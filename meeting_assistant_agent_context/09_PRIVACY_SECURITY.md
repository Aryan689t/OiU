# Privacy and Security

## Privacy principles
- Explicit user activation before capture.
- Clear, persistent listening indicator.
- Plain-language disclosure of what is captured and processed.
- No covert capture or attempts to bypass meeting platform controls.
- No automatic speech, unmute, chat posting, or attendance response.
- No raw audio retention by default.
- Transcript/session data is ephemeral by default; history requires an explicit opt-in.
- User can stop and clear the session.
- Use data minimization: send only what is needed for transcription and context.

## Consent and policy
The product must remind users to follow applicable laws, employer/school rules, and meeting participant consent requirements. Do not imply that extension installation alone authorizes recording.

## Security controls
- Provider credentials remain on backend.
- TLS for all network traffic.
- Session-scoped short-lived credentials.
- Validate and authorize all requests.
- Do not log raw audio, full transcript, names, or response content by default.
- Redact sensitive values from diagnostic logs.
- Limit retention and document deletion behavior.
- Protect against prompt injection embedded in meeting transcript: transcript content is untrusted data, never system instructions.

## Threat considerations
- Malicious transcript text attempting to instruct the AI
- Unauthorized session access
- Leaked API keys
- Accidental session left active
- Extension message spoofing
- Unintended capture of unrelated tab audio
- Sensitive meeting content appearing in notifications

## Notification privacy
Default alerts should avoid showing full sensitive transcript on lock screens. Offer a generic alert such as “the assistant detected a question for you” and reveal detail inside the extension.
