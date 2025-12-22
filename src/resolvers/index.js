import Resolver from '@forge/resolver';
import { storage, asUser, route } from '@forge/api';
import { seedDemoData as doSeedDemoData } from './seedData';
import { scanBacklogBatch as doScanBacklogBatch } from './scanner';
import { scanSingleIssue } from './scanner';

const resolver = new Resolver();

// --- HELPERS ---

function extractProjectKey(ctx = {}) {
  return (
    ctx?.extension?.project?.key ||
    ctx?.project?.key ||
    ctx?.jira?.project?.key ||
    null
  );
}

// Helper to find the "Done" transition ID dynamically
async function getDoneTransition(issueKey) {
  const response = await asUser().requestJira(
    route`/rest/api/3/issue/${issueKey}/transitions`,
    {
      headers: { Accept: 'application/json' },
    }
  );

  if (!response.ok) return null;
  const data = await response.json();

  // Look for "Done", "Closed", "Resolved", "Duplicate" or green status category
  return data.transitions.find(
    (t) =>
      t.to?.statusCategory?.key === 'done' ||
      ['done', 'closed', 'resolved', 'duplicate'].includes(
        String(t.name || '').toLowerCase()
      )
  );
}

// --- RESOLVERS ---

resolver.define('getAllProjects', async () => {
  const res = await asUser().requestJira(
    route`/rest/api/3/project/search`,
    {
      headers: { Accept: 'application/json' },
    }
  );

  const data = await res.json();
  return (data.values || []).map((p) => ({ key: p.key, name: p.name }));
});

resolver.define('getScannerConfig', async () => {
  const cfg = (await storage.get('scanner:config')) || {};

  // Map old shape -> new shape for safety
  const scope = cfg.scope === 'cross'
    ? 'cross'
    : cfg.mode === 'cross'
    ? 'cross'
    : 'current';

  const crossProjects =
    Array.isArray(cfg.crossProjects)
      ? cfg.crossProjects
      : Array.isArray(cfg.projects)
      ? cfg.projects.filter(Boolean)
      : [];

  return {
    scope,
    crossProjects,
    ttl: cfg.ttl || 30,
    autoTag: cfg.autoTag ?? true,
    autoCheck: cfg.autoCheck ?? true,
  };
});

// --- FIX 1: Save Configuration Correctly ---
resolver.define('saveScannerConfig', async (req) => {
  // Match variable names sent from Config.jsx
  const { scope, crossProjects, ttl, autoTag, autoCheck } = req.payload;

  const toSave = {
    scope: scope === 'cross' ? 'cross' : 'current',
    crossProjects: Array.isArray(crossProjects) ? crossProjects : [],
    ttl: ttl || 30,
    autoTag: autoTag ?? true,
    autoCheck: autoCheck ?? true,
  };

  await storage.set('scanner:config', toSave);
  return { ok: true, saved: toSave };
});

resolver.define('seedDemoData', async (req) => {
  const projectKey = req.payload.projectKey || extractProjectKey(req.context);
  return doSeedDemoData(projectKey);
});

// --- FIX 2: Pass Project Key to Scanner ---
resolver.define('scanBacklogBatch', async (req) => {
  const offset = Number(req?.payload?.offset ?? 0);
  const limit = Number(req?.payload?.limit ?? 10);

  // The frontend (PitWall.jsx) sends 'projectKey'
  const projectKey = req.payload.projectKey || extractProjectKey(req.context);

  if (!projectKey) {
    throw new Error('Project key is required for scanning.');
  }

  // Pass it to the actual scanner function
  return doScanBacklogBatch(offset, limit, projectKey);
});

resolver.define('getBacklogCount', async (req) => {
  const { limit, projectKey } = req.payload;
  const pKey = projectKey || extractProjectKey(req.context);
  if (!pKey) return 0;

  const jql = `project = "${pKey}" ORDER BY created DESC`;
  const res = await asUser().requestJira(
    route`/rest/api/3/search?jql=${jql}&maxResults=${limit}&fields=key`
  );
  const data = await res.json();
  return data.issues ? data.issues.length : 0;
});

resolver.define('checkWatchdogAlert', async (req) => {
  const { issueKey } = req.payload;
  const alert = await storage.get(`alert:${issueKey}`);
  return alert || [];
});

resolver.define('ignoreCandidate', async (req) => {
  const { sourceKey, targetKey } = req.payload;
  const storageKey = `ignore:${sourceKey}`;
  const list = (await storage.get(storageKey)) || [];
  if (!list.includes(targetKey)) {
    list.push(targetKey);
    await storage.set(storageKey, list);
  }
  return { success: true };
});

// UPDATED: Robust Link & Resolve Logic (No 'fields' in transition to avoid 400 errors)
resolver.define('linkAndResolve', async (req) => {
  const { keepIssueKey, closeIssueKey } = req.payload;
  console.log(`[linkAndResolve] Linking: Keep ${keepIssueKey}, Close ${closeIssueKey}`);

  // 1. Link Issues (Type: Duplicate)
  const linkRes = await asUser().requestJira(route`/rest/api/3/issueLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: { name: 'Duplicate' },
      inwardIssue: { key: closeIssueKey }, 
      outwardIssue: { key: keepIssueKey }
    })
  });

  if (linkRes.status !== 201) {
     console.error(`Link failed: ${linkRes.status}`, await linkRes.text());
     throw new Error(`Failed to link issues. Status: ${linkRes.status}`);
  }

  // 2. Find "Done" Transition
  const transition = await getDoneTransition(closeIssueKey);
  if (!transition) {
    return { success: true, warning: "Linked, but could not auto-close (No 'Done' transition found)." };
  }

  // 3. Execute Transition (The Fix: NO 'fields' block)
  const transRes = await asUser().requestJira(route`/rest/api/3/issue/${closeIssueKey}/transitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      transition: { id: transition.id } 
      // REMOVED: fields: { resolution: ... } to prevent 400 Error
    })
  });

  if (transRes.status !== 204) {
    const errorBody = await transRes.text();
    console.error(`Transition failed [${transRes.status}]:`, errorBody);
    throw new Error(`Linked, but failed to close ${closeIssueKey}. Jira Refused: ${errorBody}`);
  }

  // 4. Comment
  await asUser().requestJira(route`/rest/api/3/issue/${closeIssueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [{
          type: "paragraph",
          content: [{ type: "text", text: `🤖 CrewSync AI automatically resolved this as a duplicate of ${keepIssueKey}.` }]
        }]
      }
    })
  });

  return { success: true, closed: closeIssueKey };
});
resolver.define('analyzeCurrentIssue', async (req) => {
  const { issueKey } = req.payload;
  if (!issueKey) throw new Error("Issue Key required");
  return await scanSingleIssue(issueKey);
});

export const handler = resolver.getDefinitions();