import test from "node:test";
import assert from "node:assert/strict";
import {
  splitIntoSentences,
  parseSentenceStream,
  getDialogueAnalysis,
} from "../dist/index.js";

const testProfile = {
  displayName: "Aryan",
  aliases: ["Ari", "Tathagat"],
  identifiers: ["117", "10325210117"],
  keywords: [],
};

test("sentenceParser splits multi-sentence Google Meet caption stream", () => {
  const text = "yah wala 117 r ine r n 11 Swagat what is mitochondria? tatha 117 aur ine Aryan 17";
  const sentences = splitIntoSentences(text);
  assert.equal(sentences.length, 2);
  assert.match(sentences[0], /what is mitochondria\?/i);
  assert.match(sentences[1], /tatha 117 aur ine Aryan 17/i);
});

test("sentenceParser differentiates OLD vs NEW sentences", () => {
  const text = "yah wala 117 r ine r n 11 Swagat what is mitochondria? tatha 117 aur ine Aryan 17";
  const parsed = parseSentenceStream(text, testProfile, Date.now(), "ryan");
  assert.equal(parsed.length, 2);

  // First sentence is completed in the past -> "old"
  assert.equal(parsed[0].status, "old");
  assert.equal(parsed[0].isQuestion, true);

  // Second sentence is currently active -> "new"
  assert.equal(parsed[1].status, "new");
});

test("sentenceParser classifies CONNECTED sentence via connective prefix 'tatha' / 'aur'", () => {
  const text = "yah wala 117 r ine r n 11 Swagat what is mitochondria? tatha 117 aur ine Aryan 17";
  const analysis = getDialogueAnalysis(text, testProfile, Date.now(), "ryan");

  assert.equal(analysis.sentences.length, 2);
  assert.equal(analysis.activeSentence.relation, "connected");
  assert.match(analysis.activeSentence.relationReason, /tatha/i);
  assert.equal(analysis.coreFocusText, "What is mitochondria?");
  assert.equal(analysis.activeFollowUp, "tatha 117 aur ine Aryan 17");
});

test("sentenceParser classifies DISCONNECTED sentence when addressed to another participant", () => {
  const text = "yah wala 117 what is mitochondria? Swagat roll 118 aap batao.";
  const analysis = getDialogueAnalysis(text, testProfile, Date.now(), "ryan");

  assert.equal(analysis.sentences.length, 2);
  assert.equal(analysis.activeSentence.relation, "disconnected");
  assert.equal(analysis.activeSentence.addressedToOther, true);
  assert.match(analysis.activeSentence.relationReason, /participant/i);
});

test("sentenceParser updates core focus when a NEW question is asked without getting stuck", () => {
  const text = "yah wala 117 what is mitochondria? Aryan what is photosynthesis?";
  const analysis = getDialogueAnalysis(text, testProfile, Date.now(), "ryan");

  assert.equal(analysis.sentences.length, 2);
  assert.equal(analysis.activeSentence.relation, "disconnected");
  assert.equal(analysis.activeSentence.isQuestion, true);
  // Must NOT remain stuck at mitochondria!
  assert.equal(analysis.coreFocusText, "What is photosynthesis?");
  assert.equal(analysis.topic, "photosynthesis");
});

test("sentenceParser classifies short general greetings as DISCONNECTED and does not resurrect old questions", () => {
  const text = "What is mitochondria? namaskar namaskar.";
  const analysis = getDialogueAnalysis(text, testProfile, Date.now(), "ryan");

  assert.equal(analysis.sentences.length, 2);
  assert.equal(analysis.activeSentence.relation, "disconnected");
  assert.equal(analysis.activeSentence.isQuestion, false);
  // Must NOT resurrect the old question!
  assert.equal(analysis.coreFocusText, "namaskar namaskar.");
  assert.equal(analysis.isQuestion, false);
});
