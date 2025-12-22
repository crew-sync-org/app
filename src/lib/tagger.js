// src/lib/tagger.js
import { asUser, route } from '@forge/api'; // CHANGE: Import route
import { invokeLlama } from './bedrock';

function normalizeTags(raw) {
  // ... (keep existing implementation) ...
  // [Copy your normalizeTags function here exactly as it was]
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && Array.isArray(raw.tags)) arr = raw.tags;
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch (_) {
      arr = raw.split(',');
    }
  }
  const cleaned = (arr || [])
    .map((s) => String(s || '').trim())
    .filter((s) => s.length > 0)
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const t of cleaned) {
    if (!seen.has(t)) {
      seen.add(t);
      unique.push(t);
    }
  }
  if (unique.length > 5) return unique.slice(0, 5);
  return unique;
}

async function jiraUpdateLabels(issueKey, labels) {
  if (!issueKey) return false;
  try {
    // CHANGE: Use route`` with interpolation
    const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { labels } }),
    });
    return res.ok;
  } catch (err) {
    console.warn(`Failed to update labels for ${issueKey}:`, err?.message || err);
    return false;
  }
}

export async function ensureTags(issue) {
  // ... (keep existing implementation) ...
  if (!issue || typeof issue !== 'object') throw new Error('ensureTags(issue) requires an issue object');
  const existing = issue?.fields?.labels;
  if (Array.isArray(existing) && existing.length) {
    return existing;
  }

  const summary = issue?.fields?.summary || '';
  const description = issue?.fields?.description || '';
  const text = `${summary}\n\n${typeof description === 'string' ? description : ''}`.trim();

  const prompt = 'Extract 3-5 technical keywords/tags from this text. JSON array of strings only.';
  const llamaInput = `${prompt}\n\n${text}`;

  const response = await invokeLlama(llamaInput);
  const tags = normalizeTags(response);

  const key = issue?.key;
  if (key && tags.length) {
    await jiraUpdateLabels(key, tags);
  }

  return tags;
}

export async function generateExpansionJql(tags, projectKeys) {
   // ... (keep existing implementation) ...
  if (!Array.isArray(tags) || tags.length === 0) throw new Error('generateExpansionJql requires tags');
  if (!Array.isArray(projectKeys) || projectKeys.length === 0) throw new Error('generateExpansionJql requires projectKeys');

  const prompt = `Given these tags: ${JSON.stringify(tags)}, generate a JQL 'text ~' search clause that expands them to synonyms (e.g. Auth -> 'login OR signin'). Return ONLY the raw JQL string, nothing else.`;
  const llamaOut = await invokeLlama(prompt);

  let clause = '';
  if (typeof llamaOut === 'string') clause = llamaOut.trim();
  else if (llamaOut && typeof llamaOut.clause === 'string') clause = llamaOut.clause.trim();
  else if (llamaOut && typeof llamaOut.jql === 'string') clause = llamaOut.jql.trim();
  else if (llamaOut && Array.isArray(llamaOut) && typeof llamaOut[0] === 'string') clause = llamaOut[0].trim();
  if (!clause) clause = String(llamaOut || '').trim();

  clause = clause.replace(/^```(?:jql)?/i, '').replace(/```\s*$/i, '').trim();

  const projectsList = projectKeys.map((k) => k.trim()).filter(Boolean).join(', ');
  const fullJql = `project IN (${projectsList}) AND status != Done AND (${clause})`;
  return fullJql;
}

export default { ensureTags, generateExpansionJql };