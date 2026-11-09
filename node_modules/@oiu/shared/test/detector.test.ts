import test from "node:test";
import assert from "node:assert/strict";
import { EventDetector, matchName, matchIdentifier } from "../dist/index.js";

const testProfile = {
  displayName: "Aryan",
  aliases: ["Ari", "Tathagat"],
  identifiers: ["117", "10325210117"],
};

function createSegment(text: string, timestampMs = Date.now(), speakerId = "Speaker") {
  return {
    id: `seg_${Math.random()}`,
    sessionId: "sess_1",
    text,
    speakerId,
    startMs: timestampMs - 1000,
    endMs: timestampMs,
    isFinal: true,
  };
}

test("EventDetector detects exact name mention", () => {
  const detector = new EventDetector(testProfile);
  const result = detector.processSegment(createSegment("Hey Aryan, we are discussing the report."));
  assert.equal(result.hasEvent, true);
  assert.equal(result.turnAction, "NEW_ALERT");
  assert.equal(result.event?.type, "NAME_MENTION");
  assert.match(result.event!.transcriptExcerpt, /Aryan/);
});

test("EventDetector detects phonetic and speech-to-text name variations", () => {
  // Test "Aaryan" for "Aryan"
  const detector1 = new EventDetector(testProfile);
  const res1 = detector1.processSegment(createSegment("Can Aaryan answer this question?"));
  assert.equal(res1.hasEvent, true);
  assert.equal(res1.event?.type, "DIRECT_QUESTION");

  // Test "Tathagath" for "Tathagat"
  const detector2 = new EventDetector(testProfile);
  const res2 = detector2.processSegment(createSegment("Is Tathagath in the call?"));
  assert.equal(res2.hasEvent, true);

  // Test "Thathagat" for "Tathagat"
  const detector3 = new EventDetector(testProfile);
  const res3 = detector3.processSegment(createSegment("Thathagat please present your screen"));
  assert.equal(res3.hasEvent, true);

  // Test space-separated syllables "Ta tha gat"
  const detector4 = new EventDetector(testProfile);
  const res4 = detector4.processSegment(createSegment("Ta tha gat are you there?"));
  assert.equal(res4.hasEvent, true);

  // Test Google Meet STT acoustic confusion "The target" for "Tathagat"
  const detector5 = new EventDetector(testProfile);
  const res5 = detector5.processSegment(createSegment("117. The target."));
  assert.equal(res5.hasEvent, true);

  // Test "The target. The target."
  const detector6 = new EventDetector(testProfile);
  const res6 = detector6.processSegment(createSegment("The target please unmute."));
  assert.equal(res6.hasEvent, true);
  assert.equal(res6.event?.type, "NAME_MENTION");
});

test("EventDetector does not confuse participant name 'ryan' with 'Aryan'", () => {
  const detector = new EventDetector(testProfile);
  const result = detector.processSegment(createSegment("Hello ryan how are you?"));
  assert.equal(result.hasEvent, false, "Should not confuse participant ryan with user Aryan");
});

test("EventDetector prioritizes specific alias 'Tathagat' over substring 'Aryan'", () => {
  const detector = new EventDetector(testProfile);
  const result = detector.processSegment(createSegment("Hello. tatha protection tathagat Arya tathagatory hai"));
  assert.equal(result.hasEvent, true);
  assert.match(result.event!.explanation, /Tathagat/i, "Should identify Tathagat with highest specificity");
});

test("EventDetector detects identifier / registration number mention", () => {
  const detector = new EventDetector(testProfile);
  const result = detector.processSegment(createSegment("Roll number 117 are you present?"));
  assert.equal(result.hasEvent, true);
  assert.equal(result.event?.type, "ATTENDANCE_CALL");
});

test("EventDetector detects question addressed to identifier", () => {
  const detector = new EventDetector(testProfile);
  const result = detector.processSegment(createSegment("117 what is mitochondria?"));
  assert.equal(result.hasEvent, true);
  assert.equal(result.event?.type, "DIRECT_QUESTION");
  assert.match(result.event!.explanation, /Direct question addressed to ID/);
});

test("EventDetector detects spaced registration numbers", () => {
  const detector = new EventDetector(testProfile);
  const result = detector.processSegment(createSegment("Is roll 1 1 7 here today?"));
  assert.equal(result.hasEvent, true);
  assert.equal(result.event?.type, "ATTENDANCE_CALL");
});

test("EventDetector ignores unrelated text", () => {
  const detector = new EventDetector(testProfile);
  const result = detector.processSegment(createSegment("Let us move to the next slide."));
  assert.equal(result.hasEvent, false);
});

test("EventDetector differentiates duplicate, continuation, and new message turns", () => {
  const detector = new EventDetector(testProfile);
  const t0 = 10000;

  // 1. First speech event: starts a new turn and triggers alert
  const first = detector.processSegment(createSegment("Aryan roll number 117 please respond.", t0));
  assert.equal(first.hasEvent, true);
  assert.equal(first.turnAction, "NEW_ALERT");
  const turn1Id = first.turnId;

  // 2. Exact duplicate 300ms later (DOM polling jitter) -> NO_OP
  const dup = detector.processSegment(createSegment("Aryan roll number 117 please respond.", t0 + 300));
  assert.equal(dup.turnAction, "NO_OP");

  // 3. Sentence continuation 1 second later: updates alert in-place
  const stream1 = detector.processSegment(createSegment("Aryan roll number 117 please respond now to question 1.", t0 + 1000));
  assert.equal(stream1.turnAction, "UPDATE_ALERT", "Should update alert in-place without triggering new chime");
  assert.equal(stream1.turnId, turn1Id, "Should remain in the same ongoing turn");
  assert.equal(stream1.accumulatedText, "Aryan roll number 117 please respond now to question 1.");

  // 4. New turn after pause (>2.4s): fires immediate alert without artificial cooldown
  const newCall = detector.processSegment(createSegment("Tathagat what is mitochondria?", t0 + 4000));
  assert.equal(newCall.hasEvent, true, "Should trigger immediate alert on new turn");
  assert.equal(newCall.turnAction, "NEW_ALERT");
  assert.notEqual(newCall.turnId, turn1Id, "Must be a distinct new turn");
  assert.equal(newCall.event?.type, "DIRECT_QUESTION");
});
