import test from "node:test";
import assert from "node:assert/strict";
import { getInstantSmartResponses } from "../src/services/aiService.js";
import { UserProfile, MeetingEvent } from "@oiu/shared";

const profile: UserProfile = {
  displayName: "Aryan",
  aliases: ["Tathagat", "Tatha"],
  identifiers: ["117"],
  keywords: ["Attendance"],
  sensitivity: "balanced",
};

test("getInstantSmartResponses returns accurate factual definition for 'what is atom?'", () => {
  const event: MeetingEvent = {
    id: "evt_1",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "Aryan what is atom?",
  };

  const responses = getInstantSmartResponses(event, profile);
  assert.equal(responses.length, 3);
  assert.match(responses[0].text, /basic building block of all matter/i);
  assert.doesNotMatch(responses[0].text, /essentially centered on its foundational definition/i);
});

test("getInstantSmartResponses returns accurate factual definition for 'what is data?'", () => {
  const event: MeetingEvent = {
    id: "evt_2",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "What is data?",
  };

  const responses = getInstantSmartResponses(event, profile);
  assert.match(responses[0].text, /raw, unorganized facts/i);
  assert.doesNotMatch(responses[0].text, /essentially centered on its foundational definition/i);
});

test("getInstantSmartResponses returns accurate factual definition for 'what is communication?'", () => {
  const event: MeetingEvent = {
    id: "evt_3",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "Aryan tathagat Tatha can you tell me what is communication?",
  };

  const responses = getInstantSmartResponses(event, profile);
  assert.match(responses[0].text, /process of transmitting and exchanging information/i);
  assert.doesNotMatch(responses[0].text, /essentially centered on its foundational definition/i);
});

test("getInstantSmartResponses returns accurate answer for '117 what is capital off India?'", () => {
  const event: MeetingEvent = {
    id: "evt_4",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "117 what is capital off India?",
  };

  const responses = getInstantSmartResponses(event, profile);
  assert.match(responses[0].text, /New Delhi is the capital of India/i);
});

test("getInstantSmartResponses returns accurate answer for standalone 'what is api?'", () => {
  const event: MeetingEvent = {
    id: "evt_5",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "Aryan what is an API?",
  };

  const responses = getInstantSmartResponses(event, profile);
  assert.match(responses[0].text, /Application Programming Interface/i);
});

test("getInstantSmartResponses returns accurate answer for biology questions (photosynthesis, mitochondria)", () => {
  const eventBio1: MeetingEvent = {
    id: "evt_6",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "Tatha what is photosynthesis?",
  };
  const res1 = getInstantSmartResponses(eventBio1, profile);
  assert.match(res1[0].text, /sunlight, water, and carbon dioxide/i);

  const eventBio2: MeetingEvent = {
    id: "evt_7",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "Swagat what is mitochondria?",
  };
  const res2 = getInstantSmartResponses(eventBio2, profile);
  assert.match(res2[0].text, /powerhouses of the cell/i);
});

test("getInstantSmartResponses handles speech-to-text garble 'What ise D use off geometry box?'", () => {
  const event: MeetingEvent = {
    id: "evt_geom",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "What ise D use off geometry box?",
  };

  const responses = getInstantSmartResponses(event, profile);
  assert.equal(responses.length, 3);
  assert.match(responses[0].text, /mathematical instruments|ruler, compass, protractor/i);
  assert.doesNotMatch(responses[0].text, /regarding What ise d use/i);
});

test("getInstantSmartResponses handles speech-to-text garble 'What ise D source off vitamin Di?'", () => {
  const event: MeetingEvent = {
    id: "evt_vit",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "What ise D source off vitamin Di?",
  };

  const responses = getInstantSmartResponses(event, profile);
  assert.equal(responses.length, 3);
  assert.match(responses[0].text, /sunlight|fatty fish|egg yolks/i);
  assert.doesNotMatch(responses[0].text, /regarding What ise d source/i);
});

test("getInstantSmartResponses handles speech-to-text garble 'What ise D hight off Mount Everest?'", () => {
  const event: MeetingEvent = {
    id: "evt_everest",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "What ise D hight off Mount Everest?",
  };

  const responses = getInstantSmartResponses(event, profile);
  assert.equal(responses.length, 3);
  assert.match(responses[0].text, /8,848|highest mountain on earth/i);
  assert.doesNotMatch(responses[0].text, /regarding What ise d hight/i);
});

test("getInstantSmartResponses fallback for unknown questions produces natural spoken response without robotic filler", () => {
  const eventUnknown: MeetingEvent = {
    id: "evt_8",
    sessionId: "s_1",
    timestampMs: Date.now(),
    type: "DIRECT_QUESTION",
    confidence: 1.0,
    transcriptExcerpt: "Aryan what is quantum superposition in computing?",
  };
  const res = getInstantSmartResponses(eventUnknown, profile);
  assert.equal(res.length, 3);
  assert.doesNotMatch(res[0].text, /essentially centered on its foundational definition/i);
  assert.match(res[0].text, /following along/i);
});
