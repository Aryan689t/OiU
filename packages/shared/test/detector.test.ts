import test from "node:test";
import assert from "node:assert/strict";
import { EventDetector, matchName, matchIdentifier } from "../dist/index.js";

const testProfile = {
  displayName: "Aryan",
  aliases: ["Ari", "Tathagat"],
  identifiers: ["117", "10325210117"],
  keywords: [],
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

test("EventDetector detects user-configured custom keywords dynamically", () => {
  const customProfile = {
    displayName: "Jordan",
    aliases: ["Jordy"],
    identifiers: ["EMP-500"],
    keywords: ["quarterly budget", "project titan"],
  };

  const detector = new EventDetector(customProfile);

  // Keyword mention
  const res1 = detector.processSegment(createSegment("Please review the quarterly budget spreadsheet."));
  assert.equal(res1.hasEvent, true);
  assert.equal(res1.event?.type, "KEYWORD_MENTION");
  assert.match(res1.event!.explanation || "", /quarterly budget/i);

  // Question on monitored keyword
  const res2 = detector.processSegment(createSegment("What is the status of project titan?"));
  assert.equal(res2.hasEvent, true);
  assert.equal(res2.event?.type, "DIRECT_QUESTION");
});

test("EventDetector does not trigger false alerts on subsequent speech when user is not called", () => {
  const genericProfile = {
    displayName: "Alex",
    aliases: ["Lex"],
    identifiers: ["EMP-100"],
    keywords: ["architecture"],
  };

  const detector = new EventDetector(genericProfile);
  let time = 10000;

  // 1. Initial direct question for Alex
  let stream = "Question for Alex: what is the deployment schedule?";
  let res = detector.processSegment(createSegment(stream, time));
  assert.equal(res.hasEvent, true, "Should alert when user name is addressed");
  assert.equal(res.turnAction, "NEW_ALERT");

  // 2. Immediate connected follow-up
  time += 1500;
  stream += " and when is the deadline.";
  res = detector.processSegment(createSegment(stream, time));
  assert.equal(res.hasEvent, true);
  assert.equal(res.turnAction, "UPDATE_ALERT", "Should update in-place without duplicate chime");

  // 3. Unrelated meeting speech occurs (speaker talks to the room or says greetings)
  time += 4000;
  stream += " Good morning everyone.";
  res = detector.processSegment(createSegment(stream, time));
  assert.equal(res.hasEvent, false, "Must not alert on general greeting speech");

  time += 3000;
  stream += " Please check your audio.";
  res = detector.processSegment(createSegment(stream, time));
  assert.equal(res.hasEvent, false, "Must not alert when user is not called");

  time += 3000;
  stream += " Moving on to the next topic.";
  res = detector.processSegment(createSegment(stream, time));
  assert.equal(res.hasEvent, false, "Must not alert on general meeting speech");

  // 4. User is called again with their ID
  time += 4000;
  stream += " EMP-100 can you share your screen?";
  res = detector.processSegment(createSegment(stream, time));
  assert.equal(res.hasEvent, true, "Should alert when user ID is called");
  assert.equal(res.turnAction, "NEW_ALERT");
  assert.equal(res.event?.transcriptExcerpt, "EMP-100 can you share your screen?");
});

test("EventDetector triggers alert when user-configured keyword 'Attendance' is spoken", () => {
  const profileWithKeyword = {
    displayName: "Aryan",
    aliases: ["Ari", "Tathagat"],
    identifiers: ["117"],
    keywords: ["Attendance"],
  };
  const detector = new EventDetector(profileWithKeyword);

  // 1. Keyword spoken alone
  const res1 = detector.processSegment(createSegment("Please mark your attendance now."));
  assert.equal(res1.hasEvent, true, "Should alert on keyword attendance");
  assert.equal(res1.turnAction, "NEW_ALERT");
  assert.match(res1.event!.explanation, /Attendance/i);

  // 2. Keyword spoken after an ID call in the same meeting
  const t2 = Date.now();
  const res2 = detector.processSegment(createSegment("listening 117", t2));
  assert.equal(res2.hasEvent, true);
  assert.equal(res2.turnAction, "NEW_ALERT");

  const res3 = detector.processSegment(createSegment("listening 117 attendance attendance", t2 + 1000));
  assert.equal(res3.hasEvent, true, "Should trigger alert for attendance keyword even in continuous stream");
  assert.equal(res3.turnAction, "NEW_ALERT");
  assert.match(res3.event!.explanation, /Attendance/i);
});
