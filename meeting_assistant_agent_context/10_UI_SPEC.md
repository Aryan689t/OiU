# UI Specification

## Main surfaces

### Extension popup
Purpose: quick entry and controls.
- Supported meeting detected / unsupported tab state
- Start listening button
- Listening / stopped state
- Open side panel
- Quick settings link

### Side panel
Suggested layout:
1. Header: the assistant name, session state, Stop button
2. Status: listening indicator and connection/transcription health
3. Alert card: latest event, transcript evidence, timestamp, confidence
4. Context recovery card: current topic and “What you missed”
5. Response suggestions: Direct / Professional / Clarify
6. Live transcript (collapsible)
7. Settings/profile access

## States
- `INACTIVE`
- `SUPPORTED_TAB_READY`
- `PERMISSION_REQUIRED`
- `CONNECTING`
- `LISTENING`
- `DEGRADED`
- `STOPPING`
- `STOPPED`
- `ERROR`

## Interaction principles
- Start and Stop are obvious.
- Never make the listening state ambiguous.
- Alert should not cover meeting controls or steal focus.
- User can dismiss an alert without stopping listening.
- Do not auto-open or force-focus the side panel when a name is detected.
- Keep alert text concise.
- Show evidence and confidence for AI detections.
- Avoid presenting AI suggestions as factual statements about the user's work.

## Visual direction
Clean, calm, professional utility. Use neutral backgrounds, restrained accent color, clear hierarchy, and no excessive dashboard ornamentation. The interface should feel like a quiet companion, not a monitoring tool.
