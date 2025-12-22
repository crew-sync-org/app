// src/resolvers/scanner.js
import { asUser, route, storage } from '@forge/api';
import { getOrGenerateEmbedding, findTopMatches } from '../lib/vectorOps';
import { invokeLlama } from '../lib/bedrock';
import { judgeDuplicates } from '../lib/judge';

const SAFE_BATCH_LIMIT = 5;

// --- HELPER: SAFE TEXT ---
function getSafeText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return '(Rich Text Content - View in Jira)';
}

// --- HELPER: ROBUST JSON PARSER ---
function cleanAndParseJSON(rawInput) {
  if (!rawInput) return null;
  
  // If it's already an object, just return it
  if (typeof rawInput === 'object') {
    return rawInput;
  }

  try {
    // 1. Try direct parse
    return JSON.parse(rawInput);
  } catch (e) {
    // 2. Regex extraction (Only works if rawInput is a string)
    if (typeof rawInput === 'string') {
      const match = rawInput.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (innerE) {
          return null;
        }
      }
    }
    return null;
  }
}

async function jiraSearch(jql, maxResults = 15) {
  if (!jql) return { issues: [] };
  const res = await asUser().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      jql,
      maxResults,
      fields: ['summary', 'description', 'project', 'labels'],
    }),
  });
  if (!res.ok) return { issues: [] };
  return res.json();
}

async function generateSmartJqlFromText(summary, description) {
  const safeDesc = getSafeText(description);
  const cleanSummary = summary.replace(/\[.*?\]/g, '').trim();
  const text = `${cleanSummary}\n${safeDesc}`.substring(0, 400);

  const prompt = `
Task: Extract 3 technical keywords from the text below and return a Jira JQL clause.
Format: JSON only. Do not add explanations.

Input Text: "${text}"

Example JSON:
{ "jql": "text ~ \\"api\\" OR text ~ \\"login\\" OR text ~ \\"auth\\"" }
`;

  try {
    const raw = await invokeLlama(prompt);
    const response = cleanAndParseJSON(raw);
    return response?.jql ? response.jql.trim() : null;
  } catch (e) {
    console.warn('Smart JQL failed, falling back to regex:', e.message);
    const keywords = cleanSummary
      .split(/[\s\W]+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);
    return keywords.length ? `text ~ "(${keywords.join(' OR ')})"` : null;
  }
}

async function generateJqlFromLabels(labels) {
  if (!labels || labels.length === 0) return null;

  const prompt = `
Task: Create a JQL search clause for these tags. Expand them with 1-2 synonyms each.

Input Tags: ${JSON.stringify(labels)}

Output Requirements:
- Return ONLY a JSON object.
- NO code, NO comments, NO markdown.

Example JSON:
{ "jql": "text ~ \\"login\\" OR text ~ \\"signin\\" OR text ~ \\"auth\\"" }
`;

  try {
    const raw = await invokeLlama(prompt);
    const response = cleanAndParseJSON(raw);
    return response?.jql ? response.jql.trim() : null;
  } catch (e) {
    console.warn('Label expansion failed:', e.message);
    return null;
  }
}

// --- UPDATED: SINGLE ISSUE SCAN (Now with Cross-Project Scope) ---
export async function scanSingleIssue(issueKey) {
  console.log(`[Manual Scan] Starting deep scan for ${issueKey}`);
  
  // 1. Fetch the Target Issue
  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    headers: { Accept: 'application/json' }
  });
  
  if (!res.ok) throw new Error(`Could not load issue ${issueKey}`);
  const issue = await res.json();
  const summary = issue.fields.summary;
  const description = issue.fields.description;
  const labels = issue.fields.labels || [];
  const currentProject = issue.fields.project.key;

  // 2. Load Configuration (The Missing Piece)
  const config = (await storage.get('scanner:config')) || { scope: 'current', crossProjects: [] };
  
  // 3. Determine Search Scope
  let scopeJql = `project = "${currentProject}"`;
  
  if (config.scope === 'cross') {
    // Combine current project with selected cross-projects
    const targets = [currentProject, ...(config.crossProjects || [])];
    // Remove duplicates and empty values
    const uniqueProjects = [...new Set(targets)].filter(Boolean);
    
    if (uniqueProjects.length > 0) {
      scopeJql = `project in (${uniqueProjects.map(p => `"${p}"`).join(',')})`;
      console.log(`[Manual Scan] Cross-project enabled. Scope: ${uniqueProjects.join(', ')}`);
    }
  }

  // 4. Generate Search Keywords (Reuse existing helpers)
  let jqlClause = await generateJqlFromLabels(labels);
  if (!jqlClause) {
    jqlClause = await generateSmartJqlFromText(summary, description);
  }
  
  if (!jqlClause) {
    console.log("[Manual Scan] Could not generate JQL. Returning empty.");
    return [];
  }

  // 5. Build Final JQL
  // Note: We search the 'scopeJql', but exclude the current issue Key
  const searchJql = `${scopeJql} AND (${jqlClause}) AND statusCategory != Done AND key != ${issueKey}`;
  
  console.log(`[Manual Scan] Searching: ${searchJql}`);
  
  // 6. Search & Compare
  const searchRes = await jiraSearch(searchJql, 10); // Increased limit slightly for cross-project
  const candidates = searchRes.issues || [];

  if (candidates.length === 0) {
    console.log("[Manual Scan] No candidates found in Jira search.");
    return [];
  }

  // 7. Vector Comparison
  const sourceText = `${summary}\n${getSafeText(description)}`;
  const sourceVecPromise = getOrGenerateEmbedding(issueKey, sourceText);

  const candidatePromises = candidates.map(async (c) => {
    try {
      const cText = `${c.fields.summary}\n${getSafeText(c.fields.description)}`;
      const vec = await getOrGenerateEmbedding(c.key, cText);
      return { key: c.key, embedding: vec, issue: c };
    } catch (_) { return null; }
  });

  const [sourceVec, ...candidateResults] = await Promise.all([sourceVecPromise, ...candidatePromises]);
  const validCandidates = candidateResults.filter(Boolean);
  
  const matches = findTopMatches(sourceVec, validCandidates, 0.4);
  const confirmedAlerts = [];

  for (const match of matches) {
     let isDuplicate = false;
     let confidence = 0;

     // Trust High Vector Scores
     if (match.score > 0.85) {
       isDuplicate = true;
       confidence = Math.round(match.score * 100);
     } else {
        // AI Judge for medium scores
        const candidateIssue = validCandidates.find(c => c.key === match.key)?.issue;
        const verdict = await judgeDuplicates(issue, candidateIssue);
        if (verdict?.isDuplicate) {
          isDuplicate = true;
          confidence = verdict.confidence || Math.round(match.score * 100);
        }
     }

     if (isDuplicate) {
       const candidateData = validCandidates.find(c => c.key === match.key).issue;
       confirmedAlerts.push({
         key: match.key,
         summary: candidateData.fields.summary,
         score: match.score,
         confidence
       });
     }
  }

  // 8. Save results
  if (confirmedAlerts.length > 0) {
    await storage.set(`alert:${issueKey}`, confirmedAlerts);
  }
  
  return confirmedAlerts;
}

// --- EXISTING: BATCH SCAN ---
export async function scanBacklogBatch(offset = 0, limit = 5, currentProjectKey) {
  const effectiveLimit = Math.min(limit, SAFE_BATCH_LIMIT);

  // 1. Get Configuration
  const config = (await storage.get('scanner:config')) || { 
    scope: 'current', 
    crossProjects: [] 
  };

  // 2. Build the Project Filter for CANDIDATES
  let candidateProjectJql = '';
  
  if (config.scope === 'cross') {
    // NEW: Strictly use the user's selection
    let targetProjects = config.crossProjects || [];

    // Safety: If user selected "Cross Project" but didn't pick ANY projects, 
    // we shouldn't crash. Fallback to current project only in that specific edge case.
    if (targetProjects.length === 0) {
      console.warn("[Scanner] Cross-project scope active but no projects selected. Defaulting to current.");
      targetProjects = [currentProjectKey];
    }

    const uniqueProjects = [...new Set(targetProjects)]
      .filter(Boolean)
      .map(k => `"${k}"`)
      .join(',');
    candidateProjectJql = `project in (${uniqueProjects})`;
  } else {
    // If Current: Only check this project
    candidateProjectJql = `project = "${currentProjectKey}"`;
  }

  // 3. Fetch SOURCE issues (Always from current project)
  const sourceJql = `project = "${currentProjectKey}" AND statusCategory != Done ORDER BY created DESC`;

  console.log(`[Scanner] Fetching source tickets from: ${currentProjectKey}`);
  console.log(`[Scanner] Candidate search scope: ${candidateProjectJql}`);
  
  const searchResp = await jiraSearch(sourceJql);

  // Apply offset/limit manually
  const issues = (searchResp?.issues || []).slice(
    offset,
    offset + effectiveLimit
  );
  const results = [];

  for (const source of issues) {
    console.log(`Processing ${source.key}...`);
    const labels = source.fields.labels || [];
    let candidatesMap = new Map();

    // --- CANDIDATE DISCOVERY ---

    // A. Check Labels
    if (labels.length > 0) {
      const safeLabels = labels.map((l) => `"${l}"`).join(',');

      const labelQuery = `labels in (${safeLabels}) AND key != ${source.key} AND ${candidateProjectJql}`;
      const labelResp = await jiraSearch(labelQuery);
      (labelResp.issues || []).forEach((i) => candidatesMap.set(i.key, i));

      const expandedJql = await generateJqlFromLabels(labels);
      if (expandedJql) {
        const expQuery = `${expandedJql} AND key != ${source.key} AND statusCategory != Done AND ${candidateProjectJql}`;
        const expResp = await jiraSearch(expQuery);
        (expResp.issues || []).forEach((i) => candidatesMap.set(i.key, i));
      }
    } else {
      // B. Check Text
      const textJql = await generateSmartJqlFromText(
        source.fields.summary,
        source.fields.description
      );
      if (textJql) {
        const textQuery = `${textJql} AND key != ${source.key} AND statusCategory != Done AND ${candidateProjectJql}`;
        const textResp = await jiraSearch(textQuery);
        (textResp.issues || []).forEach((i) => candidatesMap.set(i.key, i));
      }
    }

    let candidates = Array.from(candidatesMap.values());

    // Filter ignored items
    const ignore = (await storage.get(`ignore:${source.key}`)) || [];
    candidates = candidates.filter(
      (c) => c.key !== source.key && !ignore.includes(c.key)
    );

    if (candidates.length === 0) continue;

    // Vector Embeddings
    const sourceText = `${source.fields.summary}\n${getSafeText(source.fields.description)}`;
    const sourceVecPromise = getOrGenerateEmbedding(source.key, sourceText);

    const candidateVecPromises = candidates.slice(0, 5).map(async (c) => {
      try {
        const cText = `${c.fields.summary}\n${getSafeText(c.fields.description)}`;
        const vec = await getOrGenerateEmbedding(c.key, cText);
        return { key: c.key, embedding: vec, issue: c };
      } catch (e) {
        return null;
      }
    });

    const [sourceVec, ...candidateResults] = await Promise.all([
      sourceVecPromise,
      ...candidateVecPromises,
    ]);

    const validCandidates = candidateResults.filter((c) => c !== null);
    const matches = findTopMatches(sourceVec, validCandidates, 0.4);

    const confirmedDuplicates = [];

    for (const match of matches.slice(0, 3)) {
      const candidateIssue = validCandidates.find((c) => c.key === match.key).issue;
      let verdict = { isDuplicate: false, confidence: 0, reason: '' };

      if (match.score > 0.85) {
        verdict = {
          isDuplicate: true,
          confidence: Math.round(match.score * 100),
          reason: `High vector match (${Math.round(match.score * 100)}%). Auto-verified.`,
        };
      } else if (match.score > 0.4) {
        try {
          const aiVerdict = await judgeDuplicates(source, candidateIssue);
          if (aiVerdict.isDuplicate) {
            verdict = aiVerdict;
          } else {
            continue;
          }
        } catch (e) {
          if (match.score > 0.7) {
            verdict = {
              isDuplicate: true,
              confidence: Math.round(match.score * 100),
              reason: 'Vector match (AI Judge failed to parse)',
            };
          } else {
            continue;
          }
        }
      }

      if (verdict.isDuplicate) {
        const safeCandidate = {
          key: candidateIssue.key,
          summary: candidateIssue.fields.summary,
          description: getSafeText(candidateIssue.fields.description),
        };

        confirmedDuplicates.push({
          key: match.key,
          score: match.score,
          verdict: verdict,
          issue: safeCandidate,
        });
      }
    }

    if (confirmedDuplicates.length > 0) {
      results.push({
        source: {
          key: source.key,
          summary: source.fields.summary,
          description: getSafeText(source.fields.description),
        },
        duplicates: confirmedDuplicates,
      });
    }
  }

  return { items: results };
}