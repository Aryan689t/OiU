# Implementation Plan

## Milestone 0 — Validate capture
- Create minimal MV3 extension.
- Detect Google Meet URL.
- Build popup with explicit Start/Stop.
- Validate tab audio capture behavior in supported Chrome versions.
- Confirm audio can be streamed without exposing secrets.
- Document any platform limitations before building AI features.

## Milestone 1 — Extension shell
- TypeScript + React + Vite setup.
- Manifest, service worker, popup, side panel.
- Shared message types and session state.
- Local profile settings (display name, aliases, optional identifier).
- Listening indicator and error states.

## Milestone 2 — Realtime transcription
- Backend session endpoint and WebSocket gateway.
- Transcription provider adapter.
- Audio streaming and transcript display.
- Reconnect and cleanup behavior.
- No long-term storage.

## Milestone 3 — Awareness events
- Exact name/alias and identifier matching.
- Attendance phrase detection.
- Direct-question classification.
- Alert cooldown and confidence.
- Evidence excerpt shown for each alert.

## Milestone 4 — Context recovery
- Rolling summary.
- Decisions and action items.
- “What you missed” brief.
- Context-grounded response suggestions.
- Clarification response if context is insufficient.

## Milestone 5 — Hardening
- Permission and privacy copy.
- Unit/integration tests.
- Failure state testing.
- Performance and latency measurement.
- Chrome Web Store packaging checklist.

## Suggested repository layout
```text
the assistant/
  extension/
    src/
      background/
      popup/
      sidepanel/
      content/
      capture/
      options/
      shared/
    public/
      manifest.json
  server/
    src/
      routes/
      realtime/
      providers/
        transcription/
        llm/
      context/
      detection/
      security/
      shared/
  docs/
  README.md
```

## Build discipline
Complete one milestone and verify it before starting the next. Do not add accounts, meeting history, billing, or multi-platform support until the core flow works end-to-end.
