// src/lib/judge.js
import { invokeLlama } from './bedrock';

// Helper: Ensure we have safe strings to send to the AI
function coerceIssueShape(issue) {
  if (!issue || typeof issue !== 'object') return { summary: '', description: '' };
  const summary = issue.summary ?? issue?.fields?.summary ?? '';
  const description = issue.description ?? issue?.fields?.description ?? '';
  
  // Limit length to save tokens and reduce noise
  return { 
    summary: String(summary || '').substring(0, 300), 
    description: String(description || '').substring(0, 500) 
  };
}

// Helper: Fixes "Chatty AI" errors by extracting JSON from text
function cleanAndParseJSON(rawInput) {
  if (!rawInput) return null;
  
  // If bedrock somehow returned an object already
  if (typeof rawInput === 'object') return rawInput;

  const strInput = String(rawInput);

  try {
    // 1. Try parsing directly (Best case)
    return JSON.parse(strInput);
  } catch (e) {
    // 2. If that fails, look for the JSON object pattern { ... }
    const match = strInput.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerE) {
        console.error("Regex JSON extraction failed:", innerE);
        return null;
      }
    }
    return null;
  }
}

// Helper: Standardize the output format
function normalizeResult(raw) {
  const out = { isDuplicate: false, reason: 'AI analysis failed', confidence: 0 };
  
  if (!raw || typeof raw !== 'object') return out;

  // We treat 'isRedundant' or 'isRelated' as a duplicate signal if confidence is high
  const trueVal = raw.isDuplicate ?? raw.isRedundant ?? raw.match ?? false;
  
  out.isDuplicate = Boolean(trueVal);
  // Default reason if AI still fails to provide one
  out.reason = String(raw.reason || 'AI detected similarity but provided no specific reason.');
  out.confidence = Number(raw.confidence || 0);
  
  return out;
}

export async function judgeDuplicates(sourceIssue, candidateIssue) {
  const A = coerceIssueShape(sourceIssue);
  const B = coerceIssueShape(candidateIssue);

  const prompt = `
### Context
You are a Jira Administrator cleaning up a project backlog. 
Ticket A and Ticket B are in the **same project**.

### Task
Determine if these two tickets describe the **same core intent**, such that keeping both open would be redundant.

### Criteria for "isDuplicate: true"
Mark as TRUE if:
1. **Strict Duplicate:** They describe the exact same bug or feature.
2. **Scope Overlap:** Ticket A is a general request (e.g., "Add Dark Mode") and Ticket B is the specific implementation (e.g., "Dark Mode for Mobile"). **Treat these as duplicates.**
3. **Different Phrasing:** One uses technical terms (backend), the other uses user terms (frontend), but they refer to the same issue.

### Criteria for "isDuplicate: false"
Mark as FALSE only if:
1. They describe completely different features.
2. They are two *separate* bugs on the same component.

### Output Format
You MUST return a JSON object with these exact fields. Do not add markdown.
{
  "isDuplicate": boolean,
  "confidence": number (0-100),
  "reason": "A short, one-sentence explanation of why."
}

### Ticket A
Summary: ${A.summary}
Description: ${A.description}

### Ticket B
Summary: ${B.summary}
Description: ${B.description}

### Output
JSON:`;

  try {
    const rawResponse = await invokeLlama(prompt);
    
    // FIX: Clean the response before normalizing
    const parsed = cleanAndParseJSON(rawResponse);
    
    if (!parsed) {
        console.warn("Judge failed to parse AI response:", rawResponse);
        // Fail gracefully - Scanner will likely fallback to vector score if this returns false
        return { isDuplicate: false, reason: "AI Parse Error", confidence: 0 };
    }

    return normalizeResult(parsed);
  } catch (e) {
    console.error("Judge execution error:", e);
    // Return safe object so the app doesn't crash
    return { isDuplicate: false, reason: "Judge Execution Error", confidence: 0 };
  }
}

export default { judgeDuplicates };