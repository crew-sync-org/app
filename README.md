
# 🚀 CrewSync: AI-Powered Duplicate Detection

CrewSync uses Vector Embeddings and LLM-based reasoning (AWS Bedrock) to find duplicates in your Jira backlog that traditional keyword searches miss. 

---

## 🛠️ Installation & Setup Guide for Judges

Follow these steps to set up the environment and test the duplicate detection engine.

### 1. Installation
1. **Get the App:** Open the [Installation Link Here].
2. **Select Site:** Click **Get app** and select your Jira Cloud site.
3. **Project Prep:** You must have an existing Jira project. If you don't, please create a new "Software Development" project (Scrum or Kanban).

### 2. Configuration & Demo Data
1. **Navigate to CrewSync:** In your Jira Project sidebar (or the **Apps** menu), select **CrewSync**.
2. **Open Settings:** Click the **Gear Icon (⚙️)** in the top right corner.
3. **Save Configuration (Important):** * Even though defaults are visible, click **Save Configuration** first. 
   * This ensures the settings are written to the database for the backend scanner to use.
4. **Generate Demo Data:** Click the **Generate Demo Data** button. 
   * This will automatically create several tickets with overlapping descriptions designed to trigger the AI.
5. **The "Jira Indexing" Break:** ☕ **Please wait 5 minutes.** Jira's search index needs time to process the new tickets. If you sync too fast, the search API will return 0 results.

---

## 🧪 Testing Scenarios

### Scenario A: The Bulk Dashboard Sync (Pit Wall)
*After the 5-minute wait:*
1. Go back to the main CrewSync page and click the **Start Sync** button.
2. The scanner will process the backlog. 
3. **Review Matches:** You will see pairs of issues. You can:
   * **View:** Compare descriptions side-by-side.
   * **Ignore:** Remove the match from your view.
   * **Link & Close:** Automatically link the tickets and mark the duplicate as "Done."

### Scenario B: Individual Issue Analysis (Contextual UI)
Test how CrewSync works while a developer is looking at a specific ticket.
1. **Create a Ticket:** Manually create a new ticket with the summary: `Implement dark ui mode for the dashboard`.
2. **Open Full Issue View:** Click on the ticket to open it in the full Jira panel.
3. **Access CrewSync:** * At the top right of the issue, click the **App Logo/Menu**.
   * Select **CrewSync Analysis**.
   * *Tip:* You can "Add to workspace" or pin this section for quick access in the future.
4. **Trigger Scan:** The app will automatically look for duplicates. If a match isn't seen immediately, press the **Sync/Scan** button within that small section.
5. **The Result:** The app will find the "Dark Mode" ticket created during the "Generate Demo Data" step.
6. **Take Action:** * Click **Mark as Duplicate**. 
   * The app will automatically add a comment identifying the original ticket and transition the current ticket to **Done**.


## for the app installation directly via code

## Requirements

See [Set up Forge](https://developer.atlassian.com/platform/forge/set-up-forge/) for instructions to get set up.

## Quick start
```
forge variables set AWS_ACCESS_KEY_ID "Your_Key"
forge variables set AWS_SECRET_ACCESS_KEY "Your_Key"
```


- Build and deploy your app by running:
```
forge deploy
```

- Install your app in an Atlassian site by running:
```
forge install
```

- Develop your app by running `forge tunnel` to proxy invocations locally:
```
forge tunnel
```

### Notes
- Use the `forge deploy` command when you want to persist code changes.
- Use the `forge install` command when you want to install the app on a new site.
- Once the app is installed on a site, the site picks up the new app changes you deploy without needing to rerun the install command.


---

## 🧠 Technical Architecture: How CrewSync Works

CrewSync doesn't just look for matching words; it understands the **intent** of your tickets using a multi-stage AI pipeline.

### 1. The Intelligence Pipeline
When a scan is triggered (via Dashboard or Background Watchdog), CrewSync executes the following logic:

* **Stage 1: Intent-Based Candidate Discovery (LLama 3 + JQL)**
    * **With Labels:** If a ticket has labels, the LLM expands them into technical synonyms and generates a complex JQL query to find "candidates."
    * **Without Labels:** The LLM analyzes the Summary and Description to identify the "core problem" and writes a custom JQL query to fetch potential matches.
* **Stage 2: Vector Semantic Filtering (Amazon Titan)**
    * Every candidate issue is converted into a high-dimensional vector embedding.
    * We perform a **Cosine Similarity** check against the original ticket. 
    * **The 0.45 Threshold:** Only issues with a mathematical similarity score of **> 0.45** proceed. This filters out the "noise" while keeping subtle duplicates.
* **Stage 3: The Final Verdict (Deep Reasoning)**
    * The top 3 matches are sent back to the LLM. 
    * The model acts as a "Senior Developer," comparing both tickets to decide if they truly represent the same work.
    * **Output:** Returns a `Boolean` (isDuplicate) and a **Human-Readable Reason** for why it matched.

### 2. Core Features & Judge Controls
The **Settings Panel (Gear Icon)** provides granular control over the engine:

| Feature | Description |
| :--- | :--- |
| **Auto-Tagging** | Automatically labels new tickets with technical categories to speed up future scans. |
| **Background Watchdog** | Scans tickets in real-time as they are created or updated. |
| **Vector TTL** | Controls the lifespan of embeddings in Forge Storage to ensure data remains fresh. |
| **Cross-Project Scanning** | Allows the engine to look for duplicates across multiple selected projects—perfect for large organizations. |

### 3. "The Smart Feedback Loop"
CrewSync gets smarter the more you use it:
* **Ignore Logic:** When you click "Ignore," CrewSync saves that specific pair to a persistent "Ignore List." These tickets will never be flagged as a match again.
* **Auto-Resolution:** Clicking **Link & Close** performs three actions in one:
    1.  Links the duplicate to the original ticket.
    2.  Transitions the duplicate to the **Done** status.
    3.  Leaves an automated audit comment: *"🤖 CrewSync AI automatically resolved this as a duplicate of [Key]."*

---

## 🛠️ Built With
* **Atlassian Forge:** Enterprise-ready app infrastructure.
* **AWS Bedrock:** * **Llama 3:** For JQL generation and final duplicate reasoning.
    * **Amazon Titan:** For high-performance vector embeddings.
* **Forge Storage:** Secure, site-local storage for embeddings and user configurations.