# Context Management and Event Detection

## Context manager
Maintain two layers:
1. **Recent transcript window:** a bounded window of recent finalized segments.
2. **Rolling summary:** compact, updated summary of topics, decisions, participants' stated positions, and action items.

Do not continuously send the full meeting transcript to the LLM. Update the summary in bounded chunks and retain evidence excerpts for important facts.

## Suggested context state
```ts
type MeetingContext = {
  currentTopic?: string;
  summary: string;
  decisions: Array<{ text: string; evidenceSegmentIds: string[] }>;
  actionItems: Array<{
    owner?: string;
    task: string;
    dueDate?: string;
    evidenceSegmentIds: string[];
  }>;
  unresolvedQuestions: Array<{ text: string; evidenceSegmentIds: string[] }>;
  lastUpdatedAt: number;
};
```

## Event categories
- `NAME_MENTION`: configured name or alias detected
- `IDENTIFIER_MENTION`: user-configured ID/registration number detected
- `DIRECT_QUESTION`: probable question directed at user
- `ATTENDANCE_CALL`: attendance or roll call detected
- `ACTION_ITEM`: task likely assigned to user
- `IMPORTANT_CONTEXT`: major decision or topic change (lower priority)

## Event model
```ts
type MeetingEvent = {
  id: string;
  sessionId: string;
  type: string;
  transcriptExcerpt: string;
  evidenceSegmentIds: string[];
  timestampMs: number;
  confidence: number; // 0..1
  urgency: "low" | "medium" | "high";
  explanation?: string;
};
```

## Detection strategy
Use a staged approach:
1. Fast local rules for exact names, aliases, and identifiers.
2. Transcript phrase patterns for likely attendance and question forms.
3. AI classification only when needed for ambiguous direct-address events.
4. Require evidence excerpts for every event.
5. Suppress duplicate alerts within a configurable cooldown.
6. Avoid alerts for incidental mentions where confidence is low.

## Response generation
Generate responses only from transcript/context evidence. The response must:
- Avoid inventing status, promises, dates, or personal facts.
- Offer a clarification option when evidence is incomplete.
- Be labeled as an AI suggestion.
- Provide evidence/context the user can inspect.
- Never send or speak the answer automatically.

## Example system instruction for response generator
“You are the assistant's response suggestion component. Use only facts supported by the supplied transcript excerpts and meeting summary. Do not invent progress, commitments, deadlines, or opinions. If the question cannot be answered from evidence, suggest a concise clarification or state that the user should provide the missing fact. Return concise options and identify the supporting excerpt.”
