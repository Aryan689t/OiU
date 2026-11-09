# System Architecture

## High-level components

```text
Google Meet tab
   │
   ▼
Chrome Extension (Manifest V3)
   ├── Popup / Side Panel UI
   ├── Content script: supported-meeting detection + non-invasive page context
   ├── Service worker: session lifecycle, permissions, message routing
   └── Audio capture module (user-initiated)
          │
          ▼
Secure backend / realtime gateway
   ├── Authentication + session authorization
   ├── Realtime transcription provider adapter
   ├── Transcript event stream
   ├── Rolling context manager
   ├── Event detection pipeline
   └── LLM context brief + response suggestion
          │
          ▼
Side panel: live status, transcript, alert, recovery brief, suggestions
```

## Suggested stack
- Extension: TypeScript, React, Vite, Chrome Manifest V3
- UI: Tailwind CSS
- Side panel: `chrome.sidePanel`
- Backend: Node.js + TypeScript + Express (or a small WebSocket server)
- Realtime: WebSocket
- Database: PostgreSQL/Supabase only if accounts or opt-in history are needed
- Transcription: provider adapter around a streaming speech-to-text API
- LLM: provider adapter for event interpretation and grounded response generation

## Architectural principles
- Keep provider-specific code behind adapters.
- Keep audio capture separate from UI.
- Use typed messages between extension components.
- Backend owns provider secrets and AI orchestration.
- Do not send raw audio to an LLM for each event; use transcript text and compact context.
- Maintain session-scoped state in memory for MVP.
- Avoid account/database scope until a demonstrated need exists.
- Do not scrape meeting DOM for private participant information or bypass platform protections.

## Extension components
- `popup`: small entry point and session controls
- `sidepanel`: transcript, context, alerts, settings
- `background`: service worker; session orchestration
- `content`: detect supported meeting page and communicate minimal state
- `capture`: tab audio capture lifecycle
- `shared`: types, constants, validators
- `options`: profile and notification preferences

## Reliability
- Reconnect the transcript stream with bounded retries.
- Show states: unsupported tab, ready, permission required, connecting, listening, degraded, stopped, error.
- If transcription disconnects, preserve already received transcript/context and display a clear degraded status.
