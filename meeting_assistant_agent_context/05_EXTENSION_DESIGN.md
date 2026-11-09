# Chrome Extension Design

## Manifest
Use Manifest V3. Keep permissions minimal and justify each permission in product documentation.

Likely permissions to evaluate:
- `sidePanel`: side panel UI
- `storage`: user preferences and session settings
- `activeTab`: temporary access after user action, if sufficient
- `tabCapture`: only if chosen capture method requires it
- `notifications`: optional system notifications
- `scripting`: only if programmatic injection is required
- Host permissions: restrict to Google Meet for MVP (e.g. `https://meet.google.com/*`)

Do not request broad `<all_urls>` permissions for the MVP.

## Activation model
- Extension may recognize a Google Meet tab and display “Supported meeting detected.”
- It must not automatically capture audio on tab load or meeting join.
- User must click Start listening.
- User can stop at any time from the side panel or popup.
- Keep listening state visible in the extension UI.

## Audio capture implementation note
Chrome's `tabCapture` APIs and service-worker lifecycle have specific constraints. Validate the selected capture path against current Chrome documentation before implementation. The capture pipeline must support stopping tracks and releasing resources reliably.

## Meeting detection
Use a conservative check for a Google Meet tab URL and, if needed, a lightweight content script signal. Do not depend on fragile DOM selectors for core audio capture. Meeting page detection is a convenience, not proof that the user is in a live call.

## Messaging
Define typed message names and payloads, such as:
- `MEETING_TAB_DETECTED`
- `SESSION_START_REQUEST`
- `SESSION_STARTED`
- `SESSION_STOP_REQUEST`
- `SESSION_STOPPED`
- `AUDIO_STREAM_READY`
- `TRANSCRIPT_SEGMENT`
- `MEETING_EVENT`
- `CONTEXT_BRIEF_REQUEST`
- `CONTEXT_BRIEF_RESPONSE`
- `SESSION_ERROR`

Validate message payloads at runtime; do not trust content-script messages blindly.
