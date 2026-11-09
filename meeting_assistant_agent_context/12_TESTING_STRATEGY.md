# Testing Strategy

## Unit tests
- Name matching across aliases and case differences
- Identifier matching and boundary handling
- Attendance phrase detection
- Direct-question event classification
- Duplicate-alert cooldown
- Context summary updates
- Grounded response constraints
- Runtime message validation

## Integration tests
- Start session → stream audio → receive transcript
- Transcript segment → event detection → alert
- Request context brief → receive structured response
- Stop session → capture/socket/provider cleanup
- Provider disconnect → degraded state → recovery
- Session clear → no retained session content

## Manual browser tests
- Google Meet ready but not live
- Join live call and manually activate the assistant
- Switch tabs while the assistant is active
- Minimize Chrome
- Stop from side panel and popup
- Close meeting tab
- Revoke permission / deny capture
- Network interruption
- No speech / noisy audio
- Similar names and transcription errors
- Attendance roll call
- User is asked an indirect question without their name
- Sensitive meeting content does not leak into OS notification

## Quality metrics
- Time from utterance to transcript
- Time from relevant utterance to alert
- Event precision (false alerts)
- Event recall (missed direct mentions)
- Context brief latency
- Response grounding / unsupported-claim rate
- Session stop cleanup success

## Test data
Use synthetic or consented recordings only. Do not use real confidential meeting transcripts as fixtures.
