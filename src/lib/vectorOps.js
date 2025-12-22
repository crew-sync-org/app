// src/lib/vectorOps.js
import { storage } from '@forge/api';
import { getEmbedding } from './bedrock';

export async function getOrGenerateEmbedding(issueKey, text) {
  if (!issueKey || typeof issueKey !== 'string') {
    throw new Error('getOrGenerateEmbedding(issueKey, text) requires a non-empty issueKey');
  }
  if (!text || typeof text !== 'string') {
    throw new Error('getOrGenerateEmbedding(issueKey, text) requires a non-empty text');
  }

  const key = `meta:${issueKey}`;
  const cached = await storage.get(key);
  if (Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  const embedding = await getEmbedding(text);
  try {
    await storage.set(key, embedding);
  } catch (err) {
    console.warn(`Failed to cache embedding for ${issueKey}:`, err?.message || err);
  }
  return embedding;
}

export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
    throw new Error('cosineSimilarity(vecA, vecB) requires two equal-length numeric arrays');
  }
  let dot = 0.0;
  let magA = 0.0;
  let magB = 0.0;
  for (let i = 0; i < vecA.length; i += 1) {
    const a = Number(vecA[i]) || 0;
    const b = Number(vecB[i]) || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  if (magA === 0 || magB === 0) return 0.0;
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  const sim = dot / denom;
  
  if (Number.isNaN(sim)) return 0.0;
  return Math.max(0, Math.min(1, sim));
}

// UPDATED: Default threshold is now 0.4 to allow the "Judge" to decide on medium matches
export function findTopMatches(sourceVec, candidates, threshold = 0.4) {
  if (!Array.isArray(sourceVec) || sourceVec.length === 0) {
    throw new Error('findTopMatches requires a non-empty sourceVec');
  }
  if (!Array.isArray(candidates)) {
    throw new Error('findTopMatches requires candidates to be an array');
  }

  const results = [];
  for (const c of candidates) {
    if (!c || typeof c.key !== 'string' || !Array.isArray(c.embedding)) continue;
    if (c.embedding.length !== sourceVec.length) continue; 
    const score = cosineSimilarity(sourceVec, c.embedding);
    if (score > threshold) {
      results.push({ key: c.key, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

export default {
  getOrGenerateEmbedding,
  cosineSimilarity,
  findTopMatches,
};