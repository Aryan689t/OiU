# User Flows

## First-time installation and setup
1. User installs the assistant from the Chrome Web Store (development builds may be loaded unpacked).
2. User opens the assistant and sees a short explanation of capture, processing, and privacy.
3. User sets their name, common aliases, and optional identifiers.
4. User chooses notification style.
5. Setup finishes; the assistant remains inactive.

## Start a meeting session
1. User opens or joins a Google Meet in Chrome.
2. User clicks the the assistant extension icon or opens its side panel.
3. the assistant detects a supported meeting tab, but does not start capture automatically.
4. User clicks **Start listening**.
5. Browser permission/capture affordances are presented as required.
6. Listening indicator becomes visible and transcript/context processing begins.

## Relevant event detected
1. A transcript segment arrives.
2. Event detector checks name/alias/identifier mentions, direct-address signals, attendance language, and assignment language.
3. If relevant and confidence meets configured threshold, the assistant raises an alert.
4. Alert includes event type, transcript excerpt, timestamp, and confidence.
5. User may open context recovery or dismiss the alert.

## User returns after missing context
1. User opens the the assistant side panel or clicks the alert.
2. the assistant shows a brief timeline of what happened since the last interaction / alert.
3. the assistant shows the exact question, current topic, relevant decisions, and action items.
4. the assistant offers response options: direct, professional, or clarification.
5. User copies or uses the suggestion manually.

## Stop and clear
1. User clicks **Stop listening**.
2. Capture and streaming transcription stop.
3. Session data is cleared according to the active retention setting.
4. the assistant shows a session-ended state.
