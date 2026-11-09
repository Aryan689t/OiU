# the assistant — AI Agent Context Pack

This folder contains the source-of-truth product and engineering context for AI coding agents building the assistant.

## Product
the assistant is a general-purpose meeting awareness assistant. It continuously listens to a meeting after the user explicitly activates the Chrome extension, detects moments that require the user's attention, and provides context recovery plus response suggestions.

## MVP boundaries
- Chrome Extension, Manifest V3
- Google Meet in Chrome as the first supported meeting platform
- User installs extension, joins a meeting, then explicitly activates the assistant
- Live transcription and rolling context
- Alerts for user name / configured identifiers, direct questions, attendance calls, and action items
- A side panel for live state, alerts, context, and suggested replies
- User remains in control; the assistant never speaks, unmutes, or answers automatically

## Read these documents in order
1. `01_PRODUCT_BRIEF.md`
2. `02_MVP_REQUIREMENTS.md`
3. `03_USER_FLOWS.md`
4. `04_SYSTEM_ARCHITECTURE.md`
5. `05_EXTENSION_DESIGN.md`
6. `06_AUDIO_AND_TRANSCRIPTION.md`
7. `07_CONTEXT_AND_EVENT_DETECTION.md`
8. `08_API_CONTRACTS.md`
9. `09_PRIVACY_SECURITY.md`
10. `10_UI_SPEC.md`
11. `11_IMPLEMENTATION_PLAN.md`
12. `12_TESTING_STRATEGY.md`
13. `13_AGENT_WORKING_RULES.md`

## Important product assumptions
- Continuous listening is the intended experience once the user starts a session.
- Listening must be explicit and visibly indicated.
- No audio or transcript is persisted by default beyond the active session unless the user opts in.
- Meeting participants' privacy and applicable consent rules matter. The product must not encourage covert recording.
- Speech recognition and speaker attribution are imperfect. The UI should show uncertainty rather than state guesses as facts.
