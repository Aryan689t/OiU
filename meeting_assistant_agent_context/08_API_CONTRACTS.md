# API and Realtime Contracts

These are proposed MVP contracts. Keep them typed and versioned; implementation may adjust after selecting the transcription provider.

## REST
- `GET /health` — service health
- `POST /v1/sessions` — create a session after user activation
- `POST /v1/sessions/:sessionId/stop` — stop session
- `POST /v1/sessions/:sessionId/context-brief` — request a context brief
- `POST /v1/sessions/:sessionId/suggestions` — request response suggestions
- `DELETE /v1/sessions/:sessionId` — clear session data

## Session creation
Request:
```json
{
  "meetingPlatform": "google_meet",
  "profile": {
    "displayName": "Aryan",
    "aliases": ["Ari"],
    "identifiers": []
  }
}
```

Response:
```json
{
  "sessionId": "server-generated-id",
  "realtimeUrl": "wss://service.example/realtime",
  "expiresAt": "ISO-8601 timestamp"
}
```
Do not use this illustrative URL literally. Configure a real deployment URL.

## Realtime client messages
```ts
type ClientMessage =
  | { type: "AUTH"; sessionToken: string }
  | { type: "AUDIO_CHUNK"; sequence: number; data: ArrayBuffer }
  | { type: "CONTEXT_BRIEF_REQUEST"; sinceMs?: number }
  | { type: "STOP" };
```

## Realtime server messages
```ts
type ServerMessage =
  | { type: "TRANSCRIPT_SEGMENT"; segment: TranscriptSegment }
  | { type: "MEETING_EVENT"; event: MeetingEvent }
  | { type: "CONTEXT_UPDATE"; context: MeetingContext }
  | { type: "CONTEXT_BRIEF"; brief: ContextBrief }
  | { type: "ERROR"; code: string; message: string };
```

## Context brief
```ts
type ContextBrief = {
  sinceMs?: number;
  currentTopic: string;
  whatYouMissed: string[];
  questionForUser?: string;
  decisions: string[];
  relevantActionItems: string[];
  responseSuggestions: Array<{
    label: "direct" | "professional" | "clarification";
    text: string;
    evidenceSegmentIds: string[];
  }>;
  confidence: number;
};
```

## Security
- Authenticate every session and socket.
- Bind session token to a user/session and expire it quickly.
- Never expose transcription or LLM provider API keys to the extension.
- Validate payload size, schema, and sequence.
- Rate-limit context/suggestion requests.
