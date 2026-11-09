import test from "node:test";
import assert from "node:assert/strict";
import { EventDetector, matchName, matchIdentifier } from "../dist/index.js";

const testProfile = {
  displayName: "Aryan",
  aliases: ["Ari", "Tathagat"],
  identifiers: ["117", "10325210117"],
};

function createSegment(text: string, timestampMs = Date.now()) {
  return {
    id: `seg_${Math.random()}`,
    sessionId: "sess_1",
    text,
    startMs: timestampMs - 1000,
    endMs: timestampMs,
    isFinal: true,
  };
}

test("EventDetector detects exact name mention", () => {
  const detector = new EventDetector(testProfile, 5000);
  const result = detector.processSegment(createSegment("Hey Aryan, we are discussing the report."));
  assert.equal(result.hasEvent, true);
  assert.equal(result.event?.type, "NAME_MENTION");
  assert.match(result.event!.transcriptExcerpt, /Aryan/);
});

test("EventDetector detects phonetic and speech-to-text name variations", () => {
  // Test "Aaryan" for "Aryan"
  const detector1 = new EventDetector(testProfile, 5000);
  const res1 = detector1.processSegment(createSegment("Can Aaryan answer this question?"));
  assert.equal(res1.hasEvent, true);
  assert.equal(res1.event?.type, "DIRECT_QUESTION");

  // Test "Tathagath" for "Tathagat"
  const detector2 = new EventDetector(testProfile, 5000);
  const res2 = detector2.processSegment(createSegment("Is Tathagath in the call?"));
  assert.equal(res2.hasEvent, true);

  // Test "Thathagat" for "Tathagat"
  const detector3 = new EventDetector(testProfile, 5000);
  const res3 = detector3.processSegment(createSegment("Thathagat please present your screen"));
  assert.equal(res3.hasEvent, true);

  // Test space-separated syllables "Ta tha gat"
  const detector4 = new EventDetector(testProfile, 5000);
  const res4 = detector4.processSegment(createSegment("Ta tha gat are you there?"));
  assert.equal(res4.hasEvent, true);

  // Test Google Meet STT acoustic confusion "The target" for "Tathagat"
  const detector5 = new EventDetector(testProfile, 5000);
  const res5 = detector5.processSegment(createSegment("117. The target."));
  assert.equal(res5.hasEvent, true);

  // Test "The target. The target."
  const detector6 = new EventDetector(testProfile, 5000);
  const res6 = detector6.processSegment(createSegment("The target please unmute."));
  assert.equal(res6.hasEvent, true);
  assert.equal(res6.event?.type, "NAME_MENTION");
});

test("EventDetector detects identifier / registration number mention", () => {
  const detector = new EventDetector(testProfile, 5000);
  const result = detector.processSegment(createSegment("Roll number 117 are you present?"));
  assert.equal(result.hasEvent, true);
  assert.equal(result.event?.type, "ATTENDANCE_CALL");
});

test("EventDetector detects question addressed to identifier", () => {
  const detector = new EventDetector(testProfile, 4000);
  const result = detector.processSegment(createSegment("117 what is mitochondria?"));
  assert.equal(result.hasEvent, true);
  assert.equal(result.event?.type, "DIRECT_QUESTION");
  assert.match(result.event!.explanation, /Direct question addressed to ID/);
});

test("EventDetector detects spaced registration numbers", () => {
  const detector = new EventDetector(testProfile, 5000);
  const result = detector.processSegment(createSegment("Is roll 1 1 7 here today?"));
  assert.equal(result.hasEvent, true);
  assert.equal(result.event?.type, "ATTENDANCE_CALL");
});

test("EventDetector ignores unrelated text", () => {
  const detector = new EventDetector(testProfile, 5000);
  const result = detector.processSegment(createSegment("Let us move to the next slide."));
  assert.equal(result.hasEvent, false);
});

test("EventDetector prevents repeating alert for the same utterance", () => {
  const detector = new EventDetector(testProfile, 8000);
  const t0 = 10000;

  // First speech event
  const first = detector.processSegment(createSegment("Aryan roll number 117 please respond.", t0));
  assert.equal(first.hasEvent, true);

  // Subtitle continues/repeats 1 second later (Google Meet streaming captions)
  const stream1 = detector.processSegment(createSegment("Aryan roll number 117 please respond now.", t0 + 1000));
  assert.equal(stream1.hasEvent, false, "Should not re-trigger during progressive subtitle growth");

  // Subtitle repeated after cooldown expires but text is the same sentence
  const stream2 = detector.processSegment(createSegment("Aryan roll number 117 please respond.", t0 + 9000));
  assert.equal(stream2.hasEvent, false, "Should not re-trigger on identical sentence even after cooldown");

  // Genuinely new sentence after cooldown
  const newCall = detector.processSegment(createSegment("Tathagat do you have any updates on project?", t0 + 10000));
  assert.equal(newCall.hasEvent, true, "Should trigger on genuinely new utterance after cooldown");
});

test("EventDetector prevents repeats on short identifier 117 and persists across export/import", () => {
  const detectorA = new EventDetector(testProfile, 8000);
  const t0 = Date.now() - 4000; // 4 seconds ago

  // Initial call with only "117"
  const res1 = detectorA.processSegment(createSegment("117", t0));
  assert.equal(res1.hasEvent, true);

  // Stale caption re-evaluated 2 seconds later
  const res2 = detectorA.processSegment(createSegment("117", t0 + 2000));
  assert.equal(res2.hasEvent, false, "Should not re-trigger on stale 117");

  // Export state (simulating saving to storage when sidepanel closes)
  const exported = detectorA.exportAlertedHashes();

  // New detector instance (simulating sidepanel reopening)
  const detectorB = new EventDetector(testProfile, 8000);
  detectorB.importAlertedHashes(exported);

  // Stale caption re-evaluated in new sidepanel session within 10 seconds
  const res3 = detectorB.processSegment(createSegment("117", t0 + 5000));
  assert.equal(res3.hasEvent, false, "Reopened sidepanel should remember past 117 alert and not re-trigger");
});

test("EventDetector triggers alert when called again after cooldown", () => {
  const detector = new EventDetector(testProfile, 8000);
  const t0 = 100000;

  // Turn 1: user or teacher calls "tathagat Aryan tathagat 11"
  const res1 = detector.processSegment(createSegment("tathagat Aryan tathagat 11", t0));
  assert.equal(res1.hasEvent, true);

  // Progressive update within 8s suppressed
  const res2 = detector.processSegment(createSegment("tathagat Aryan tathagat 117", t0 + 1000));
  assert.equal(res2.hasEvent, false);

  // Turn 2 (10 seconds later): teacher calls "117 please answer"
  const res3 = detector.processSegment(createSegment("117 please answer", t0 + 10000));
  assert.equal(res3.hasEvent, true, "Should alert on second call-out after cooldown");

  // Turn 3 (another 10 seconds later): teacher calls "Tathagat are you there"
  const res4 = detector.processSegment(createSegment("Tathagat are you there", t0 + 20000));
  assert.equal(res4.hasEvent, true, "Should alert on third call-out");
});
