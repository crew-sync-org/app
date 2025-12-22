// src/resolvers/triggers.js

console.log(">>> SYSTEM: triggers.js file loaded by Node runtime.");

import api, { storage, route } from "@forge/api";
import { getOrGenerateEmbedding, findTopMatches } from "../lib/vectorOps";
import { ensureTags } from "../lib/tagger";
import { judgeDuplicates } from "../lib/judge";
import { invokeLlama } from "../lib/bedrock";

// --- HELPERS ---

function getSafeText(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  return "(Rich Text Content - View in Jira)";
}

function stripCodeFences(text) {
  if (!text) return text;
  let t = String(text).trim();

  // Handles ```block``` and ```
  if (t.startsWith("```")) {
    // Remove opening fence (including language identifier)
    t = t.replace(/^```[a-zA-Z]*\s*/m, "");
    // Remove closing fence
    t = t.replace(/```\s*$/, "");
    t = t.trim();
  }
  return t;
}

function extractLargestBalanced(text, openChar, closeChar) {
  const t = String(text);
  let best = null;

  for (let i = 0; i < t.length; i++) {
    if (t[i] !== openChar) continue;

    let depth = 0;
    for (let j = i; j < t.length; j++) {
      const ch = t[j];
      if (ch === openChar) depth++;
      else if (ch === closeChar) depth--;

      if (depth === 0) {
        const candidate = t.slice(i, j + 1);
        if (!best || candidate.length > best.length) best = candidate;
        break;
      }
    }
  }

  return best;
}

export function cleanAndParseJSON(rawInput) {
  if (!rawInput) return null;
  if (typeof rawInput === 'object') return rawInput;

  let cleaned = String(rawInput);

  // 1. Remove Markdown code blocks (```json ... ```)
  cleaned = cleaned.replace(/```json/gi, '').replace(/```/g, '');
  
  // 2. Remove "Here is the JSON" conversational fluff
  cleaned = cleaned.replace(/^[^{[]*/, ''); // Remove everything before the first { or [

  // 3. Try finding the first JSON Object OR Array
  // This regex finds the first '{...}' OR '[...]' block
  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      console.warn("Found JSON-like string but failed to parse:", match[0]);
    }
  }

  // 4. Fallback: Last ditch effort to parse the whole cleaned string
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

async function jiraSearch(jql, maxResults = 5) {
  if (!jql) return [];
  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        jql,
        maxResults,
        fields: ["summary", "description", "project", "labels", "status"],
      }),
    });

    if (!res.ok) {
      console.warn("[Watchdog] Jira search failed:", res.status, await res.text());
      return [];
    }

    const data = await res.json();
    return data.issues || [];
  } catch (e) {
    console.warn("[Watchdog] Jira search failed:", e);
    return [];
  }
}

async function generateSmartJqlFromText(summary, description) {
  const safeDesc = getSafeText(description);
  const text = `${summary}\n${safeDesc}`.substring(0, 400);

  // 1. Improved Prompt (Better instruction wrapping)
  const prompt = [
    "You are a JSON generator. Output valid JSON only.",
    "Task: Extract 3 technical keywords from the text below and return a Jira JQL clause.",
    'Output Format: { "jql": "text ~ \\"keyword1\\" OR text ~ \\"keyword2\\"" }',
    `Input Text: "${text}"`,
    "JSON:"
  ].join("\n");

  // 2. Try AI Generation
  try {
    const raw = await invokeLlama(prompt);
    // Log the output to debug
    console.log(`[Watchdog] AI Raw Output: ${raw.substring(0, 50)}...`); 
    
    const parsed = cleanAndParseJSON(raw);
    if (parsed && parsed.jql) {
       return String(parsed.jql).trim();
    }
    console.warn("[Watchdog] AI returned invalid JSON. Switching to fallback.");
  } catch (e) {
    console.warn("[Watchdog] AI invocation failed:", e);
  }

  // 3. FALLBACK (Moved outside try/catch so it ALWAYS runs if AI fails)
  console.log("[Watchdog] Generating basic keyword search...");
  const keywords = String(summary || "")
    .split(/[\s\W]+/) // Split by spaces and non-word chars
    .filter((w) => w.length > 3) // Filter short words
    .slice(0, 3); // Take top 3

  // Return a safe JQL string or null if summary is empty
  return keywords.length
    ? `(${keywords.map((k) => `text ~ "${k}"`).join(" OR ")})`
    : null;
}

async function generateJqlFromLabels(labels) {
  if (!labels || labels.length === 0) return null;

  const prompt = [
    "Return ONLY valid JSON. No markdown, no code fences, no extra text.",
    "Task: Create a JQL search clause for these tags. Expand them with 1-2 synonyms each.",
    `Input Tags JSON: ${JSON.stringify(labels)}`,
    'Output JSON schema: { "jql": "text ~ \\"t1\\" OR text ~ \\"t2\\" OR text ~ \\"t3\\"" }',
  ].join("\n");

  try {
    const raw = await invokeLlama(prompt);
    const parsed = cleanAndParseJSON(raw);
    const jql = parsed?.jql ? String(parsed.jql).trim() : null;
    return jql || null;
  } catch (e) {
    return null;
  }
}

// --- MAIN TRIGGER HANDLER ---
export async function handler(event) {
  console.log(">>> SYSTEM: Handler function started execution.");

  const issue = event.issue;
  if (!issue) {
    console.log("[Watchdog] Error: No issue data in event payload.");
    return;
  }

  const issueKey = issue.key;

  // 1) SAFETY: Check for "Demo" Entity Property
  try {
    const propRes = await api.asApp().requestJira(
      route`/rest/api/3/issue/${issueKey}/properties/crewsync-demo-ticket`
    );

    if (propRes.status === 200) {
      console.log(
        `[Watchdog] Ignoring demo ticket ${issueKey} (Flagged via Entity Property).`
      );
      return;
    }
  } catch (err) {
    // Ignore 404s etc.
  }

  // 2) SAFETY: Skip updates where summary/description didn't change
  if (event.changelog) {
    const changedFields = (event.changelog.items || []).map((item) => item.field);
    const contentChanged =
      changedFields.includes("summary") || changedFields.includes("description");

    if (!contentChanged) {
      console.log(
        `[Watchdog] Update detected, but no content changes (Fields: ${changedFields.join(
          ", "
        )}). Skipping.`
      );
      return;
    }
  }

  const projectKey = issue.fields?.project?.key;
  console.log(`[Watchdog] Triggered for ${issueKey} in ${projectKey}`);

  // 3) Load Configuration
  const config = (await storage.get("scanner:config")) || {
    autoTag: true,
    autoCheck: true,
    scope: "current",
    crossProjects: [],
  };

  // 4) Auto-tagging (note: ensureTags must update Jira itself if you want labels persisted)
  if (config.autoTag) {
    console.log("[Watchdog] Auto-tagging enabled.");
    try {
      const newTags = await ensureTags(issue);
      if (newTags && newTags.length) {
        issue.fields.labels = newTags;
      }
    } catch (err) {
      console.warn(`[Watchdog] Auto-tagging failed: ${err.message}`);
    }
  } else {
    console.log("[Watchdog] Auto-tagging skipped (Config is OFF).");
  }

  // 5) Background Scan
  if (!config.autoCheck) {
    console.log("[Watchdog] Background scan skipped (Config is OFF). Exiting.");
    return;
  }

  // 6) Determine Search Scope
  let scopeJql = `project = "${projectKey}"`;
  if (config.scope === "cross") {
    let targetProjects = config.crossProjects || [];
    if (targetProjects.length === 0) targetProjects = [projectKey];
    const safeProjects = [...new Set(targetProjects)]
      .filter(Boolean)
      .map((p) => `"${p}"`)
      .join(",");
    scopeJql = `project in (${safeProjects})`;
  }
  console.log(`[Watchdog] Scanning scope: ${scopeJql}`);

  // 7) Candidate Discovery
  const labels = issue.fields?.labels || [];
  let jqlClause = null;

  if (labels.length > 0) {
    console.log("[Watchdog] Using Label-based search.");
    jqlClause = await generateJqlFromLabels(labels);
  }
  if (!jqlClause) {
    console.log("[Watchdog] Using Text-based search.");
    jqlClause = await generateSmartJqlFromText(
      issue.fields?.summary || "",
      issue.fields?.description || ""
    );
  }

  if (!jqlClause) {
    console.log("[Watchdog] Could not generate JQL. Skipping scan.");
    return;
  }

  const finalJql = `${scopeJql} AND (${jqlClause}) AND statusCategory != Done AND key != ${issueKey}`;
  console.log(`[Watchdog] JQL: ${finalJql}`);

  const candidateIssues = await jiraSearch(finalJql, 5);
  if (candidateIssues.length === 0) {
    console.log("[Watchdog] No candidates found via JQL.");
    return;
  }

  // 8) Vector Similarity & Judging
  const sourceText = `${issue.fields.summary}\n${getSafeText(issue.fields.description)}`;
  const sourceVecPromise = getOrGenerateEmbedding(issueKey, sourceText);

  const candidatePromises = candidateIssues.map(async (c) => {
    try {
      const cText = `${c.fields.summary}\n${getSafeText(c.fields.description)}`;
      const vec = await getOrGenerateEmbedding(c.key, cText);
      return { key: c.key, embedding: vec, issue: c };
    } catch (_) {
      return null;
    }
  });

  const [sourceVec, ...candidateResults] = await Promise.all([
    sourceVecPromise,
    ...candidatePromises,
  ]);

  const validCandidates = candidateResults.filter(Boolean);
  const topMatches = findTopMatches(sourceVec, validCandidates, 0.4);

  // 2. [NEW] Load Ignore List
  const ignoreList = (await storage.get(`ignore:${issueKey}`)) || [];

  const confirmedAlerts = [];

  for (const match of topMatches) {
    // [NEW] Skip if this match is in the ignore list
    if (ignoreList.includes(match.key)) {
      console.log(`[Watchdog] Skipping ignored candidate: ${match.key}`);
      continue;
    }

    let isDuplicate = false;
    let confidence = 0;

    if (match.score > 0.85) {
      isDuplicate = true;
      confidence = Math.round(match.score * 100);
      console.log(`[Watchdog] Auto-Match: ${match.key} (${confidence}%)`);
    } else {
      try {
        const candidateIssue = validCandidates.find((c) => c.key === match.key)?.issue;
        if (!candidateIssue) continue;

        console.log(`[Watchdog] Judging: ${match.key} (Score: ${match.score})`);
        const verdict = await judgeDuplicates(issue, candidateIssue);

        if (verdict?.isDuplicate) {
          isDuplicate = true;
          confidence = verdict.confidence || Math.round(match.score * 100);
        }
      } catch (judgeErr) {
        console.warn(`[Watchdog] Judge failed for ${match.key}:`, judgeErr);
      }
    }

    if (isDuplicate) {
      confirmedAlerts.push({
        key: match.key,
        score: match.score,
        confidence,
      });
    }
  }

  // 3. [UPDATED] Store Alert AND Notify User
  if (confirmedAlerts.length > 0) {
    console.log(`[Watchdog] Saving ${confirmedAlerts.length} alerts for ${issueKey}`);
    await storage.set(`alert:${issueKey}`, confirmedAlerts);

    // [NEW] Send a "Small Alert" via Comment (The only way to reach a passive user)
    // We check if we recently commented to avoid spamming (optional logic)
    try {
      await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          body: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "⚠️ CrewSync detected " },
                  { type: "text", text: `${confirmedAlerts.length} potential duplicate(s)`, marks: [{ type: "strong" }] },
                  { type: "text", text: ". Open the CrewSync panel to review." }
                ]
              }
            ]
          },
          properties: [{ key: "crewsync-alert", value: true }] // Mark comment as bot
        })
      });
      console.log("[Watchdog] Posted alert comment to issue.");
    } catch (e) {
      console.error("Failed to post alert comment:", e);
    }

  } else {
    console.log("[Watchdog] Clean scan. No duplicates found.");
    await storage.delete(`alert:${issueKey}`);
  }
}
