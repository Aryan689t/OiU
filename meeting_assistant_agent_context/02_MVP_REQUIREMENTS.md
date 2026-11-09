# MVP Requirements

## P0 — Required
- User can install the the assistant Chrome extension.
- Extension works on Google Meet in Chrome.
- User can open the extension side panel.
- User can configure their display name, aliases, and optional student/employee identifier.
- User explicitly starts and stops a listening session.
- A persistent visual indicator shows when the assistant is listening.
- Meeting audio can be captured only after explicit permission and user activation.
- Audio is sent to a transcription provider through a secure service path; provider keys are never embedded in the extension.
- Transcript segments are timestamped and, where available, attributed to a speaker.
- System maintains rolling context (recent transcript + compact summary).
- Detect likely name mentions and questions directed at the user.
- Display an alert with the transcript excerpt and confidence.
- Provide a concise “What happened?” briefing and grounded response suggestions.
- User can clear the active session.
- Fail gracefully if permission, network, or transcription fails.

## P1 — Desirable
- Custom alert sound and visual settings
- Keywords for attendance phrases and custom identifiers
- Meeting session history, opt-in only
- Mute alerts temporarily while continuing context processing
- Export user-requested summary
- Additional platform adapter for Teams or Zoom web

## Acceptance criteria
- No capture occurs before the user activates the assistant.
- User can stop capture promptly using a clear control.
- The extension visibly indicates active listening.
- A detected alert includes the exact supporting transcript excerpt.
- Suggested responses do not invent commitments, dates, facts, or work status.
- When transcript context is insufficient, the suggestion asks for clarification rather than fabricating.
- No automatic interaction with the meeting's microphone, chat, or participant controls.
