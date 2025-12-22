// src/resolvers/seedData.js
import { asUser, route } from '@forge/api';
import demoTickets from '../data/demoTickets.json';
import { getEmbedding } from '../lib/bedrock';

const REQUIRED_COMPONENTS = ['Marketing', 'Engineering', 'Product'];

const PROJECT_TO_COMPONENT = {
  MKT: 'Marketing',
  ENG: 'Engineering',
  PROD: 'Product',
};

function toADF(text) {
  if (!text) return null;
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: String(text)
          }
        ]
      }
    ]
  };
}

async function jira(method, path, body) {
  const res = await asUser().requestJira(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API ${method} ${path} failed: ${res.status} ${res.statusText} - ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  return undefined;
}

async function ensureComponents(projectKey) {
  const list = await jira('GET', route`/rest/api/3/project/${projectKey}/components`);
  const nameToId = new Map(list.map((c) => [c.name, c.id]));

  for (const name of REQUIRED_COMPONENTS) {
    if (!nameToId.has(name)) {
      const newComponent = await jira('POST', route`/rest/api/3/component`, {
        name,
        project: projectKey,
        description: `Auto-created by CrewSync seed for ${projectKey}`,
      });
      nameToId.set(name, newComponent.id);
    }
  }
  return nameToId;
}

async function getCreatableIssueTypeId(projectKey) {
  const data = await jira(
    'GET',
    route`/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`
  );
  const project = data?.projects?.find((p) => p.key === projectKey) || data?.projects?.[0];
  const issueType = project?.issuetypes?.[0];
  if (!issueType?.id) {
    throw new Error(`Unable to determine a creatable issue type for project ${projectKey}`);
  }
  return issueType.id;
}

function buildIssueFields({ projectKey, issueTypeId, summary, description, componentId, labels }) {
  const fields = {
    project: { key: projectKey },
    summary,
    description: toADF(description),
    issuetype: { id: issueTypeId },
  };

  if (componentId) {
    fields.components = [{ id: String(componentId) }];
  }

  // Use ticket-specific labels from demo data
  if (labels && Array.isArray(labels) && labels.length > 0) {
    fields.labels = labels.filter(label => label && typeof label === 'string');
  }

  return fields;
}

export async function seedDemoData(projectKey) {
  if (!projectKey || typeof projectKey !== 'string') {
    throw new Error('seedDemoData(projectKey) requires a non-empty project key string');
  }

  console.log(`Starting seed for project: ${projectKey}`);

  const nameToId = await ensureComponents(projectKey);
  const issueTypeId = await getCreatableIssueTypeId(projectKey);

  const results = [];
  const errors = [];

  for (const t of demoTickets) {
    try {
      const pseudoKey = t?.project?.key || '';
      const componentName = PROJECT_TO_COMPONENT[pseudoKey];
      const componentId = componentName ? nameToId.get(componentName) : undefined;
      const prefixedSummary = `[${t.key}] ${t.summary}`;
      
      // Use labels directly from demo data - these are context-aware and ticket-specific
      const labels = t.labels || [];

      const fields = buildIssueFields({
        projectKey,
        issueTypeId,
        summary: prefixedSummary,
        description: t.description || '',
        componentId,
        labels,
      });

      // CHANGE: Pass 'properties' along with 'fields' to mark as demo ticket
      const created = await jira('POST', route`/rest/api/3/issue`, { 
        fields,
        properties: [
          {
            key: 'crewsync-demo-ticket', // The invisible flag name
            value: true                  // The value
          }
        ]
      });

      const newKey = created?.key;
      if (!newKey) throw new Error('Issue created but response missing key');

      // Optional: Store embeddings
      const embeddingInput = `${prefixedSummary}\n\n${t.description || ''}`;
      try {
        // Uncomment if you want to store embeddings
        // const vector = await getEmbedding(embeddingInput);
        // await storage.set(`meta:${newKey}`, vector);
      } catch (err) {
        console.warn(`Embedding generation failed for ${newKey}:`, err?.message || err);
      }
      
      results.push({
        original: t.key,
        created: newKey,
        component: componentName || null,
        labels
      });
      
      console.log(`✓ Created: ${newKey} with labels: [${labels.join(', ')}]`);
    } catch (err) {
      errors.push({
        original: t.key,
        error: err.message
      });
      console.error(`✗ Failed to create issue for ${t.key}:`, err.message);
    }
  }

  console.log(`\n=== Seed Summary ===`);
  console.log(`Project: ${projectKey}`);
  console.log(`Created: ${results.length} issues`);
  console.log(`Failed: ${errors.length} issues`);

  return {
    projectKey,
    createdCount: results.length,
    failedCount: errors.length,
    issues: results,
    errors: errors.length > 0 ? errors : undefined
  };
}

export default { seedDemoData };
