# Audio Capture and Transcription

## Goal
Provide continuous, low-latency transcription while the assistant is explicitly active.

## Pipeline
1. User starts a session.
2. Extension obtains the required capture permission.
3. Capture audio from the meeting tab using a supported Chrome API.
4. Stream audio to the secure backend/realtime gateway.
5. Backend forwards audio to the selected transcription provider.
6. Receive partial and final transcript segments.
7. Normalize and timestamp segments.
8. Feed final segments into context and event processing.
9. Deliver updates to the extension side panel.

## Transcript segment model
```ts
type TranscriptSegment = {
  id: string;
  sessionId: string;
  text: string;
  startMs: number;
  endMs: number;
  speakerId?: string;
  isFinal: boolean;
  confidence?: number;
};
```

## Requirements
- Prefer streaming transcription with partial/final updates.
- Avoid duplicate final segments.
- Preserve source timestamps where provider supports them.
- Speaker attribution is optional and must be labeled as uncertain when not reliable.
- Keep a bounded audio buffer; do not retain raw audio by default.
- Stop capture tracks and close sockets on Stop, tab close, or unrecoverable error.
- Make provider latency and transcription errors visible in product state.

## Important limitations
- Tab audio capture may include mixed audio, not isolated speakers.
- Browser and provider behavior varies.
- A transcript can mishear names, numbers, acronyms, and technical terms.
- the assistant must not treat transcription as ground truth.
