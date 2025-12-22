// src/lib/bedrock.js
import crypto from 'crypto';

const REGION = 'us-east-1';
const SERVICE = 'bedrock';
const RUNTIME_HOST = `bedrock-runtime.${REGION}.amazonaws.com`;

// --- [Keep existing helper functions: awsUriEncode, encodeCanonicalUri, getAmzDate, getDateStamp, sha256Hex, hmac, getSigningKey, sign, doFetch] ---
// (I will omit the helper functions here for brevity as they are unchanged. 
//  Assume the standard AWS SigV4 helpers from your previous file are present.)

function awsUriEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

function encodeCanonicalUri(path) {
  return path.split('/').map(segment => awsUriEncode(segment)).join('/');
}

function getAmzDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const YYYY = date.getUTCFullYear();
  const MM = pad(date.getUTCMonth() + 1);
  const DD = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${YYYY}${MM}${DD}T${hh}${mm}${ss}Z`;
}

function getDateStamp(amzDate) {
  return amzDate.slice(0, 8);
}

function sha256Hex(payload) {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function hmac(key, data, encoding = undefined) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest(encoding);
}

function getSigningKey(secretKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

function sign({ method, host, path, query = '', body = '' }) {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (!accessKey || !secretKey) {
    throw new Error('Missing AWS credentials in environment: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY');
  }

  const amzDate = getAmzDate();
  const dateStamp = getDateStamp(amzDate);

  const bodyString = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const payloadHash = sha256Hex(bodyString);
  const canonicalUri = encodeCanonicalUri(path);
  const canonicalQuerystring = query;

  const canonicalHeadersEntries = [
    ['content-type', 'application/json'],
    ['host', host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', amzDate],
  ];
  if (sessionToken) {
    canonicalHeadersEntries.push(['x-amz-security-token', sessionToken]);
  }
  
  canonicalHeadersEntries.sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalHeaders = canonicalHeadersEntries.map(([k, v]) => `${k}:${String(v).trim()}\n`).join('');
  const signedHeaders = canonicalHeadersEntries.map(([k]) => k).join(';');

  const canonicalRequest = [
    method, canonicalUri, canonicalQuerystring, canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretKey, dateStamp, REGION, SERVICE);
  const signature = hmac(signingKey, stringToSign, 'hex');

  const headers = {
    'Content-Type': 'application/json',
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': payloadHash,
    'Authorization': `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (sessionToken) headers['X-Amz-Security-Token'] = sessionToken;
  return headers;
}

async function doFetch({ method, path, bodyObj }) {
  const url = `https://${RUNTIME_HOST}${path}`;
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const headers = sign({ method, host: RUNTIME_HOST, path, query: '', body });
  const res = await fetch(url, { method, headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bedrock request failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

// Public: invoke Llama 4 Scout model and return JSON object extracted from output
export async function invokeLlama(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('invokeLlama(prompt) requires a non-empty string');
  }

  // CHANGED: Removed the "You are a JSON-only API" wrapper. 
  // We now rely purely on the caller's prompt to define the behavior.
  // This reduces confusion for the model.
  
  const modelId = 'us.meta.llama4-scout-17b-instruct-v1:0';
  const path = `/model/${modelId}/invoke`;

  const body = {
    prompt: prompt, // Pass prompt directly
    max_gen_len: 1024,
    temperature: 0.4, // Slightly higher to prevent "stuck" empty responses
    top_p: 0.9,
  };

  const json = await doFetch({ method: 'POST', path, bodyObj: body });

  const output = json?.generation ?? '';
  if (typeof output !== 'string' || output.trim().length === 0) {
    // Add debug log to see what prompt caused the empty response
    console.error('DEBUG: Empty output for prompt:', prompt.substring(0, 200));
    throw new Error('Llama returned an empty generation');
  }

  console.log('RAW LLAMA OUTPUT:', output.substring(0, 200));

  let cleaned = output.trim();
  // Cleanup code fences
  if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
  
  cleaned = cleaned.replace(/^Here's the JSON:\s*/i, '')
                   .replace(/^JSON:\s*/i, '')
                   .trim();

  // Extract JSON object
  let jsonStr = null;
  try {
    JSON.parse(cleaned);
    jsonStr = cleaned;
  } catch (e) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }

  if (!jsonStr) {
    console.error('FAILED TO EXTRACT JSON FROM:', output);
    throw new Error('Failed to extract JSON from Llama output');
  }

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Failed to parse JSON: ${err.message}`);
  }
}

export async function getEmbedding(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('getEmbedding requires string');
  const modelId = 'amazon.titan-embed-text-v2:0';
  const path = `/model/${modelId}/invoke`;
  const body = { inputText: text };
  const json = await doFetch({ method: 'POST', path, bodyObj: body });
  if (!Array.isArray(json?.embedding)) throw new Error('Embedding response missing vector');
  return json.embedding;
}

export default { invokeLlama, getEmbedding };