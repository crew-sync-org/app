I am building an Atlassian Forge app called CrewSync.
First, create a new file 'src/lib/bedrock.js'.
I need a function 'invokeLlama' that accepts a prompt string and returns JSON tags.
I need a function 'getEmbedding' that accepts text and returns a vector array.

Constraint: You MUST use native 'node-fetch' and 'crypto' to manually sign the requests with AWS Signature V4.
Do not import aws-sdk because the Forge runtime is strict.
Use process.env.AWS_ACCESS_KEY_ID and process.env.AWS_SECRET_ACCESS_KEY.
Target region: us-east-1

response
I'm going to add a new library file with AWS Signature V4 request signing using Node's built-in crypto and fetch,
then implement two functions:

 • invokeLlama(prompt): calls Bedrock's Meta Llama model and returns the parsed JSON object from the model output.
 • getEmbedding(text): calls Bedrock's Titan embedding model and returns the numeric vector.

I'll ensure no aws-sdk is used and credentials are read from environment variables.
I'm going to quickly inspect package.json to ensure module type and confirm whether using ESM imports is compatible,
and adjust the crypto import accordingly if needed.


╭─ Response ───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ I’ve added a new module at src/lib/bedrock.js implementing AWS SigV4 signing with native crypto and fetch, and       │
│ exposed:                                                                                                             │
│                                                                                                                      │
│  • invokeLlama(prompt): Calls Meta Llama on Bedrock and returns the parsed JSON object from the model output.        │
│  • getEmbedding(text): Calls Titan Embeddings on Bedrock and returns the numeric vector.                             │
│                                                                                                                      │
│ Key details:                                                                                                         │
│                                                                                                                      │
│  • No aws-sdk is used; requests are manually signed with SigV4.                                                      │
│  • Uses process.env.AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (and AWS_SESSION_TOKEN if present).                    │
│  • Targets us-east-1 and the bedrock-runtime.us-east-1.amazonaws.com endpoint.                                       │
│  • Llama model: meta.llama3-70b-instruct-v1:0 with prompt-only response nudged to strict JSON, and robust JSON       │
│    extraction/parsing.                                                                                               │
│  • Embeddings model: amazon.titan-embed-text-v2:0 with inputText, returning embedding.                               │
│                                                                                                                      │
│ Heads-up for Forge setup:                                                                                            │
│                                                                                                                      │
│  • You’ll need to allow outbound egress to bedrock-runtime.us-east-1.amazonaws.com in manifest.yml permissions for   │
│    backend fetch.                                                                                                    │
│  • You’ll need to configure the AWS credentials as environment variables for the Forge function/environment.         │
│                                                                                                                      │
│ Would you like me to:                                                                                                │
│                                                                                                                      │
│ Heads-up for Forge setup:                                                                                            │
│                                                                                                                      │
│  • You’ll need to allow outbound egress to bedrock-runtime.us-east-1.amazonaws.com in manifest.yml permissions for   │
│    backend fetch.                                                                                                    │
│  • You’ll need to configure the AWS credentials as environment variables for the Forge function/environment.         │
│                                                                                                                      │
│ Would you like me to:                                                                                                │
│                                                                                                                      │
│  1 Wire resolvers to expose invokeLlama and getEmbedding from the backend for easy invocation?                       │
│  2 Update manifest.yml to add external egress permissions for bedrock-runtime.us-east-1.amazonaws.com?               │
│  3 Add a minimal UI Kit front-end example button to test these calls end-to-end?                                     │
│  4 Do something else (e.g., switch models or add retry/backoff and timeouts)?                                        │
│                                                                                                                      │
│ Let’s Forge ahead with your first app! If we wire this up, we’ll hammer out the kinks and anvil a smooth workflow.   │
│ What would you like me to do next?                                                                                   |╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
Session context: ▮▮▮▮▮▮▮▮▮▮ 11.5K/272K


Create a file 'src/data/demoTickets.json'.
Generate a JSON array of 15 Jira tickets (5 MKT, 5 ENG, 5 PROD).

Required Scenarios:
1. "Login Crash" Duplicate:
   - MKT-10: "Users reporting app crash on login screen after update" (Status: Open)
   - ENG-22: "iOS NullPointerException in AuthController during sign-in" (Status: Open)

2. "API Latency" Duplicate:
   - PROD-05: "Dashboard loading is extremely slow for enterprise users" (Status: Open)
   - ENG-23: "Optimize DB query performance for /dashboard endpoint" (Status: In Progress)

3. "New Feature" Duplicate (Cross-Team):
   - PROD-08: "Add Dark Mode support to mobile app" (Status: Open)
   - ENG-24: "Implement Dark Mode UI theme" (Status: In Progress)

Fill the remaining 9 tickets with generic but realistic software/business tasks.
Ensure the JSON structure matches standard Jira issue fields (key, summary, description, status, project).
╭─ Response ───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ I’ve created src/data/demoTickets.json with 15 Jira-like tickets: 5 MKT, 5 ENG, and 5 PROD. It includes the three    │
│ required duplicate scenarios and 9 additional realistic tasks. Each ticket has the fields you requested: key,        │
│ summary, description, status, and project (with project.key and project.name).                                       │
│                                                                                                                      │
│ Would you like me to:                                                                                                │
│                                                                                                                      │
│  • Expand fields (e.g., issueType, priority, labels, assignee, created/updated dates) to better mirror Jira?         │
│  • Add more duplicate clusters for testing dedup logic?                                                              │
│  • Wire a simple UI Kit view to load and display these demo tickets in a DynamicTable?                               │
│                                                                                                                      │
│ Let’s Forge ahead—want me to hammer out a quick table so you can eyeball these tickets in-app?                       │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
Session context: ▮▮▮▮▮▮▮▮▮▮ 11.9K/272K


Now create the 'src/resolvers/seedData.js'.
This function is triggered from the "Project Settings" page.

Export a function 'seedDemoData(projectKey)'.
Logic:
1. Ensure Components exist in 'projectKey': "Marketing", "Engineering", "Product". (Create them if missing).
2. Read 'src/data/demoTickets.json'.
3. Loop through the tickets.
4. "Translate" the JSON project to a Component:
   - JSON "MKT" -> Component "Marketing"
   - JSON "ENG" -> Component "Engineering"
   - JSON "PROD" -> Component "Product"
5. Create the issue in 'projectKey' using the mapped Component.
   - Prefix the summary: "[OriginalKey] " + summary.
6. CRITICAL: Immediately generate the embedding (using 'bedrock.getEmbedding') and store it in Forge Storage under `meta:${newIssueKey}`.
   - This ensures the demo is instant (vectors are pre-cached).

╭─ Response ───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ I’ve added src/resolvers/seedData.js with export function seedDemoData(projectKey) that:                             │
│                                                                                                                      │
│  • Ensures the “Marketing”, “Engineering”, and “Product” components exist in the target project (creates if          │
│    missing).                                                                                                         │
│  • Reads src/data/demoTickets.json and loops through all 15 tickets.                                                 │
│  • Maps MKT/ENG/PROD to the respective components.                                                                   │
│  • Creates issues in the target project, prefixing the summary with [OriginalKey].                                   │
│  • Immediately generates an embedding using bedrock.getEmbedding and stores it under storage key                     │
│    meta:${newIssueKey}.                                                                                              │
│                                                                                                                      │
│ Notes and requirements to complete the flow:                                                                         │
│                                                                                                                      │
│  • Resolver wiring: We should export seedDemoData from your resolvers index and call it from your Project Settings   │
│    page action.                                                                                                      │
│  • Manifest scopes: Creating components and issues likely requires at least:                                         │
│     • write:jira-work (create issues)                                                                                │
│     • manage:jira-project (create components)                                                                        │
│  • Egress: Add bedrock-runtime.us-east-1.amazonaws.com to external permissions for backend fetch.                    │
│  • Environment: Ensure AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (and optionally AWS_SESSION_TOKEN) are set for the  │
│    Forge environment.                                                                                                │
│                                                                                                                      │
│ Would you like me to:                                                                                                │
│                                                                                                                      │
│  1 Wire the resolver (add export in src/resolvers/index.js and a handler you can call from Project Settings)?        │
│  2 Update manifest.yml with the required scopes and external egress, then run forge lint?                            │
│  3 Add a Project Settings UI Kit action that triggers seedDemoData and shows a success summary?                      │
│  4 Do all of the above in one smithing session?                                                                      │
│                                                                                                                      │
│ Let’s Forge ahead—shall I steel myself to wire the resolver and manifest next?                                       │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
Session context: ▮▮▮▮▮▮▮▮▮▮ 14.5K/272K


Create 'src/lib/tagger.js'.
This module handles AI-powered tagging and search expansion.

Imports: 'invokeLlama' from './bedrock'.

Functions to export:
1. `ensureTags(issue)`:
   - Check if `issue.fields.labels` exists.
   - If yes, return them.
   - If no, call `invokeLlama` with the issue summary/description.
   - Prompt: "Extract 3-5 technical keywords/tags from this text. JSON array of strings only."
   - Return the tags (and ideally update the issue labels via Jira API if possible, otherwise just return them for this session).

2. `generateExpansionJql(tags, projectKeys)`:
   - Input: Array of tags (e.g. ['Auth', 'iOS']) and target project keys.
   - Call `invokeLlama`.
   - Prompt: "Given these tags: ${tags}, generate a JQL 'text ~' search clause that expands them to synonyms (e.g. Auth -> 'login OR signin'). Return ONLY the raw JQL string, nothing else."
   - Construct the full JQL: `project IN (${projectKeys}) AND status != Done AND (${llamaGeneratedJql})`.
   - Return the JQL string.


╭─ Response ───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ I’ve added src/lib/tagger.js with:                                                                                   │
│                                                                                                                      │
│                                                                                                                      │
│                                                                                                                      │
│  • ensureTags(issue): Returns existing labels if present; otherwise uses invokeLlama to extract 3–5 tags from        │
│    summary/description, normalizes them to label-safe strings, and best-effort updates Jira labels via asUser REST   │
│    calls. Returns the tags either way.                                                                               │
│  • generateExpansionJql(tags, projectKeys): Calls invokeLlama to produce an expanded text ~ clause, then constructs  │
│    a full JQL: project IN () AND status != Done AND ().                                                              │
│                                                                                                                      │
│ Things to consider:                                                                                                  │
│                                                                                                                      │
│  • Manifest scopes: Updating labels requires write:jira-work. We should verify scopes and add manage:jira-project if │
│    needed elsewhere.                                                                                                 │
│  • Egress: Ensure bedrock-runtime.us-east-1.amazonaws.com is allowed for backend resolver.                           │
│  • Prompt control: If you prefer JSON-only outputs for the JQL clause, we could wrap the prompt to require plain     │
│    string or add stricter parsing.                                                                                   │
│                                                                                                                      │
│ Would you like me to:                                                                                                │
│                                                                                                                      │
│  1 Wire these helpers into an existing resolver and UI action for “Tag this issue” and “Expand search”?              │
│  2 Update manifest.yml with the required scopes and external permissions, then forge lint?                           │
│  3 Add tests or mock utilities to simulate invokeLlama and validate tag normalization and JQL generation?            │
│                                                                                                                      │
│ Let’s Forge ahead—shall I temper the manifest and rivet this into your Project Settings next?                        │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
Session context: ▮▮▮▮▮▮▮▮▮▮ 16.4K/272K

Create 'src/lib/vectorOps.js'.
This handles embedding generation, caching, and similarity.

Imports: 'getEmbedding' from './bedrock', 'storage' from '@forge/api'.

Functions to export:
1. `getOrGenerateEmbedding(issueKey, text)`:
   - Check `storage.get('meta:${issueKey}')`.
   - If found, return it.
   - If not, call `getEmbedding(text)`, store it in `meta:${issueKey}`, and return it.

2. `cosineSimilarity(vecA, vecB)`:
   - Standard math implementation. Return float 0.0 to 1.0.

3. `findTopMatches(sourceVec, candidates, threshold = 0.80)`:
   - `candidates` is array of { key, embedding }.
   - Loop through candidates, calc similarity.
   - Return array of { key, score } sorted by score descending, where score > threshold.



╭─ Response ───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ I’ve added src/lib/vectorOps.js with:                                                                                │
│                                                                                                                      │
│  • getOrGenerateEmbedding(issueKey, text): Checks Forge storage at meta:${issueKey}; if missing, generates via       │
│    Bedrock getEmbedding, stores it, and returns it.                                                                  │
│  • cosineSimilarity(vecA, vecB): Standard cosine similarity, returns a float clamped to [0.0, 1.0], and guards       │
│    against zero-length magnitudes.                                                                                   │
│  • findTopMatches(sourceVec, candidates, threshold = 0.80): Computes similarity for each { key, embedding }, filters │
│    by score > threshold, sorts descending, and returns [{ key, score }].                                             │
│                                                                                                                      │
│ This pairs cleanly with your seeding flow and enables quick dedupe matching.                                         │
│                                                                                                                      │
│ Would you like me to:                                                                                                │
│                                                                                                                      │
│  • Wire vectorOps into a resolver to find duplicates across your new demo issues?                                    │
│  • Update manifest.yml to ensure external egress to Bedrock and the necessary Jira scopes?                           │
│  • Add a UI Kit action on Project Settings to “Find Duplicates Now” using these vectors?                             │
│                                                                                                                      │
│ Let’s Forge ahead—shall I steel the manifest and bolt on a duplicate finder next?                                    │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
Session context: ▮▮▮▮▮▮▮▮▮▮ 18.1K/272K








Create 'src/lib/judge.js'.

Imports: 'invokeLlama' from './bedrock'.

Export function `judgeDuplicates(sourceIssue, candidateIssue)`:
- Construct a prompt: 
  "I have two Jira tickets. 
   Ticket A: ${sourceIssue.summary} - ${sourceIssue.description}
   Ticket B: ${candidateIssue.summary} - ${candidateIssue.description}
   
   Are these duplicates describing the same underlying problem?
   Return JSON: { isDuplicate: boolean, reason: string, confidence: number 0-100 }"
   
- Call `invokeLlama` and return the parsed JSON.



╭─ Response ───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ All set! I created src/lib/judge.js with export function judgeDuplicates(sourceIssue, candidateIssue) that:          │
│                                                                                                                      │
│  • Extracts summary/description from either flat issues or Jira-shaped issue.fields.                                 │
│  • Builds the exact prompt you specified.                                                                            │
│  • Calls invokeLlama and normalizes the result to { isDuplicate, reason, confidence } with sane defaults and bounds. │
│                                                                                                                      │
│ Current TODOs:                                                                                                       │
│                                                                                                                      │
│  • Wire resolver into resolvers index and Project Settings trigger: In progress                                      │
│  • Update manifest.yml with Bedrock egress and Jira scopes: Pending                                                  │
│  • Test the seeding flow: Pending                                                                                    │
│                                                                                                                      │
│ Would you like me to:                                                                                                │
│                                                                                                                      │
│  1 Wire seedDemoData into src/resolvers/index.js with a resolver key (e.g., seedDemoData), and add a Project         │
│    Settings UI action to trigger it?                                                                                 │
│  2 Update manifest.yml with required scopes and external egress for bedrock-runtime.us-east-1.amazonaws.com, then    │
│    run forge lint?                                                                                                   │
│  3 Create a duplicate-finder resolver that uses vectorOps and judge to surface top matches for a given issue?        │
│                                                                                                                      │
│ Let’s Forge ahead—shall I rivet the manifest and weld the resolvers next?                                            │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
Session context: ▮▮▮▮▮▮▮▮▮▮ 19.4K/272K



Create 'src/resolvers/scanner.js'.

Imports: 
- `ensureTags`, `generateExpansionJql` from '../lib/tagger'
- `getOrGenerateEmbedding`, `findTopMatches` from '../lib/vectorOps'
- `judgeDuplicates` from '../lib/judge'
- `asUser`, `storage` from '@forge/api'

Export function `scanBacklogBatch(offset = 0, limit = 10)`:
1. Load Config (Internal vs Cross-Project).
2. Fetch current backlog issues (startAt: offset, maxResults: limit).
3. LOOP through each source issue:
   - `tags` = await ensureTags(sourceIssue).
   - `jql` = await generateExpansionJql(tags, targetProjects).
   - Fetch `candidates` using JQL (exclude current issue).
   - Check `storage.get('ignore:${sourceIssue.key}')` to filter out blacklisted candidates.
   - `sourceVec` = await getOrGenerateEmbedding(sourceIssue).
   - For each candidate: `candVec` = await getOrGenerateEmbedding(candidate).
   - `matches` = findTopMatches(sourceVec, [candidates], 0.82).
   - For top 3 matches: 
     - `verdict` = await judgeDuplicates(sourceIssue, candidate).
     - If `verdict.isDuplicate`, add to results list.
4. Return structured results for the UI.



╭─ Response ───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ I created src/resolvers/scanner.js implementing scanBacklogBatch(offset = 0, limit = 10) with the full pipeline:     │
│                                                                                                                      │
│  • Loads scanner config from storage (internal vs cross-project, with optional projects list).                       │
│  • Fetches backlog issues (excluding Done) with pagination.                                                          │
│  • For each source issue:                                                                                            │
│     • ensureTags to get labels or generate new ones;                                                                 │
│     • generateExpansionJql to create a text~ expansion over target projects;                                         │
│     • Searches candidates via JQL, excluding the source issue;                                                       │
│     • Filters out ignored candidates using storage key ignore:${sourceKey};                                          │
│     • Generates embeddings for source and candidates and computes similarity with threshold 0.82;                    │
│     • Judges top 3 matches with judgeDuplicates to confirm duplicates.                                               │
│  • Returns structured results ready for a UI.                                                                        │
│                                                                                                                      │
│ Next steps I can take:                                                                                               │
│                                                                                                                      │
│  • Wire this resolver into src/resolvers/index.js so your Project Settings page can call scanBacklogBatch.           │
│  • Update manifest.yml with:                                                                                         │
│     • External egress to bedrock-runtime.us-east-1.amazonaws.com                                                     │
│     • Scopes: read:jira-work (search), write:jira-work (labels), manage:jira-project (components), storage:app       │
│  • Add a Project Settings UI Kit view with actions to seed demo data and run scans, displaying results in a          │
│    DynamicTable.                                                                                                     │
│                                                                                                                      │
│ Let’s Forge ahead—want me to rivet the resolver export and temper the manifest now, then run forge lint?             │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
Session context: ▮▮▮▮▮▮▮▮▮▮ 21.6K/272K


Create 'src/frontend/Settings.jsx'.
This is the Admin/Config page for CrewSync.

Imports:
- `@forge/react` (use hooks `useAction`, `useState`, `useEffect`).
- `@forge/bridge` (invoke).

UI Requirements:
1. Title: "CrewSync Configuration".
2. Section "Demo Data":
   - Description: "Populate current project with 15 scenarios (Marketing, Engineering, Product) to test the AI engine."
   - Button: "Generate Demo Data" (Calls `seedDemoData` resolver).
   - Show a loading spinner while generating.
   - Show success message: "Created 15 tickets & cached vectors."

3. Section "Scan Scope":
   - Toggle: "Cross-Project Scanning" (Default: Off/Internal).
   - If On: Show Textfield for "Target Project Keys (comma-separated)".
   - Button: "Save Config" (Calls storage API via resolver).

Ensure it uses standard UI Kit components (Form, Button, Textfield, Toggle, SectionMessage).





╭─ Response ───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Settings page created. I added src/frontend/Settings.jsx that:                                                       │
│                                                                                                                      │
│  • Shows “CrewSync Configuration”                                                                                    │
│  • Demo Data section with “Generate Demo Data” button, spinner while running, and success message “Created 15        │
│    tickets & cached vectors.”                                                                                        │
│  • Scan Scope section with “Cross-Project Scanning” toggle, optional “Target Project Keys” textfield, and “Save      │
│    Config” button                                                                                                    │
│  • Uses only UI Kit components from @forge/react and invoke from @forge/bridge                                       │
│  • Expects resolvers: getProjectContext, seedDemoData, getScannerConfig, saveScannerConfig                           │
│                                                                                                                      │
│ What’s left to wire:                                                                                                 │
│                                                                                                                      │
│  • Backend resolvers for:                                                                                            │
│     • getProjectContext: return current project key                                                                  │
│     • getScannerConfig: read storage key scanner:config                                                              │
│     • saveScannerConfig: write storage key scanner:config                                                            │
│     • seedDemoData: already implemented in src/resolvers/seedData.js, just export in resolvers index                 │
│  • Export scanBacklogBatch and seedDemoData in src/resolvers/index.js                                                │
│  • Update manifest.yml:                                                                                              │
│     • Scopes likely needed: read:jira-work, write:jira-work, manage:jira-project, storage:app                        │
│     • External egress: bedrock-runtime.us-east-1.amazonaws.com                                                       │
│                                                                                                                      │
│ I can:                                                                                                               │
│                                                                                                                      │
│  1 Implement getProjectContext, getScannerConfig, saveScannerConfig resolvers and wire all exports in                │
│    src/resolvers/index.js                                                                                            │
│  2 Update manifest.yml with required scopes and bedrock egress, then run forge lint                                  │
│  3 Add a nav/route to show the Settings page (if not already registered), and hook it to the “Project Settings”      │
│    module                                                                                                            │
│                                                                                                                      │
│ Let’s Forge ahead—want me to hammer in the resolver wiring and temper the manifest next, or prioritize adding the    │
│    src/resolvers/index.js                                                                                            │
│  2 Update manifest.yml with required scopes and bedrock egress, then run forge lint                                  │
│  3 Add a nav/route to show the Settings page (if not already registered), and hook it to the “Project Settings”      │
│    module                                                                                                            │
│                                                                                                                      │
│ Let’s Forge ahead—want me to hammer in the resolver wiring and temper the manifest next, or prioritize adding the    │
│    src/resolvers/index.js                                                                                            │
│  2 Update manifest.yml with required scopes and bedrock egress, then run forge lint                                  │
│  3 Add a nav/route to show the Settings page (if not already registered), and hook it to the “Project Settings”      │
│    src/resolvers/index.js                                                                                            │
│    src/resolvers/index.js                                                                                            │
│  2 Update manifest.yml with required scopes and bedrock egress, then run forge lint                                  │
│  3 Add a nav/route to show the Settings page (if not already registered), and hook it to the “Project Settings”      │
│    module                                                                                                            │
│                                                                                                                      │
│ Let’s Forge ahead—want me to hammer in the resolver wiring and temper the manifest next, or prioritize adding the    │
│ backlog scanner trigger UI?                                                                                          │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
Session context: ▮▮▮▮▮▮▮▮▮▮ 24.5K/272K

Create 'src/frontend/Panel.jsx'.
This is the main Issue Panel for CrewSync that displays duplicate candidates.

Imports:
- `@forge/react` (use hooks: useState, useEffect, useProductContext).
- `@forge/bridge` (invoke).

UI Logic:
1. "Scan Button" Area:
   - Primary Button "Scan for Duplicates".
   - When clicked, call resolver `scanBacklogBatch({ offset: 0, limit: 10 })`.
   - Show a "Scanning..." state (maybe a ProgressBar or Spinner).

2. Results Table (DynamicTable):
   - Render ONLY if duplicates are found.
   - Columns: 
     - "Source" (The ticket we checked)
     - "Potential Duplicate" (The ticket we found)
     - "Confidence" (The score %)
     - "Reason" (The LLM's explanation)
     - "Actions" (Link / Ignore)

3. Actions:
   - "Link & Resolve": Call a new resolver `linkAndResolve({ sourceKey, targetKey })`.
   - "Ignore": Call resolver `ignoreCandidate({ sourceKey, targetKey })`.
   - After action, remove that row from the UI state.

4. Empty State:
   - If scan finishes with 0 results, show a clean "All Clear" success message.

Note: You can stub the `linkAndResolve` and `ignoreCandidate` resolvers for now, or implement them inline if simple.



   

╭─ Response ───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ I created src/frontend/Panel.jsx, the Issue Panel UI for CrewSync:                                                   │
│                                                                                                                      │
│  • Scan Button: “Scan for Duplicates” calls scanBacklogBatch({ offset: 0, limit: 10 }) and shows a spinner while     │
│    scanning.                                                                                                         │
│  • Results Table: Uses DynamicTable with columns Source, Potential Duplicate, Confidence, Reason, and Actions (Link  │
│    & Resolve, Ignore).                                                                                               │
│  • Actions: Calls linkAndResolve and ignoreCandidate then removes the row from state, even if the resolver errors    │
│    (non-blocking).                                                                                                   │
│  • Empty State: If no results after scan, shows an All Clear confirmation message.                                   │
│                                                                                                                      │
│ Next steps to make it fully functional:                                                                              │
│                                                                                                                      │
│  • Implement resolvers for linkAndResolve and ignoreCandidate:                                                       │
│     • linkAndResolve: Typically creates an “is duplicated by” or “duplicates” issue link and optionally transitions  │
│       one issue to Resolved.                                                                                         │
│     • ignoreCandidate: Add the targetKey to storage list ignore:${sourceKey}.                                        │
│  • Register proper UI modules in manifest.yml so both the Settings page and Panel render in Jira:                    │
│     • Project settings page module for src/frontend/Settings.jsx                                                     │
│     • Issue panel module for src/frontend/Panel.jsx                                                                  │
│  • Run forge lint, then deploy --non-interactive --e development, then install/upgrade to grant new scopes.          │
│                                                                                                                      │
│ Would you like me to:                                                                                                │
│                                                                                                                      │
│  1 Implement linkAndResolve and ignoreCandidate resolvers now?                                                       │
│  2 Register the Settings and Panel modules in manifest.yml and wire resources?                                       │
│  3 Run a quick forge lint to validate the updated manifest?                                                          │
│                                                                                                                      │
│ Let’s Forge ahead—should I bolt on those resolvers, or rivet the manifest modules first?                             │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
Session context: ▮▮▮▮▮▮▮▮▮▮ 30.1K/272K