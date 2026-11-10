import { UserProfile } from "../types/profile.js";
import { matchName, matchIdentifier } from "./matcher.js";

export type SentenceStatus = "old" | "new" | "current";
export type SentenceRelation = "connected" | "disconnected" | "standalone";

export interface ParsedSentence {
  id: string;
  index: number;
  text: string;
  rawText: string;
  speakerId: string;
  status: SentenceStatus; // "old" (completed past sentence) vs "new" / "current" (actively spoken now)
  relation: SentenceRelation; // "connected" vs "disconnected" vs "standalone"
  relationReason: string; // e.g. "Connective prefix 'tatha' / 'and'", "Addressed to different participant ('Swagat')"
  isQuestion: boolean;
  coreQuestion?: string;
  hasUserMention: boolean;
  mentionedTarget?: string;
  addressedToOther: boolean;
  otherTarget?: string;
  timestampMs: number;
}

// Conjunctions and connective prefixes that indicate continuation of previous thought
const CONNECTIVE_PREFIXES_REGEX = /^(?:and\b|also\b|then\b|or\b|so\b|because\b|plus\b|furthermore\b|meaning\b|tatha\b|aur\b|ya\b|bhi\b|matlab\b|yani\b|toh\b|iske\b|iska\b|iski\b|uske\b|uska\b)/i;

// Pronouns referencing previous subject
const ANAPHORIC_PRONOUNS_REGEX = /\b(?:it|its|this|that|these|those|they|them|same|yeh|woh|yehi|uska|iske)\b/i;

// Question starters
const QUESTION_PATTERNS = [
  "what is",
  "what are",
  "what was",
  "what were",
  "what do",
  "what does",
  "what can",
  "what would",
  "why is",
  "why are",
  "why do",
  "why does",
  "how is",
  "how are",
  "how do",
  "how does",
  "how can",
  "how to",
  "can you",
  "could you",
  "would you",
  "are you",
  "did you",
  "do you",
  "have you",
  "tell me",
  "explain",
  "define",
  "kya hai",
  "kya hota",
  "batao",
];

export function isQuestionSentence(lower: string): boolean {
  if (lower.includes("?")) return true;
  return QUESTION_PATTERNS.some((pat) => lower.includes(pat));
}

/**
 * Splits text into individual sentences using punctuation (. ? ! ; \n)
 * and connective/keyword clause boundaries.
 */
export function splitIntoSentences(text: string, profile?: UserProfile): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. Split on standard punctuation delimiters: ? ! . ; \n
  const rawParts = trimmed
    .split(/(?<=[.?!;\n])\s+|(?<=\?)|(?<=\!)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // 2. Helper to split run-on speech on user keywords or clause boundaries
  const customKws = (profile?.keywords || [])
    .map((k) => k.trim())
    .filter((k) => k.length >= 2)
    .map((k) => k.replace(/[\^$*+?.()|[\]{}\\]/g, "\\$&"));

  const boundaryPatterns = [...customKws];
  if (boundaryPatterns.length === 0) {
    return rawParts.filter((s) => s.length > 1);
  }

  const regex = new RegExp(`^(.*?)\\s+(?=(?:${boundaryPatterns.join("|")})\\b)(.*)$`, "i");

  const splitKeywordsOrConjunctions = (clause: string): string[] => {
    const match = clause.match(regex);
    if (match && match[1] && match[2] && match[1].trim().length >= 2 && match[2].trim().length >= 2) {
      return [match[1].trim(), ...splitKeywordsOrConjunctions(match[2].trim())];
    }
    return [clause];
  };

  const finalParts: string[] = [];
  for (const part of rawParts) {
    finalParts.push(...splitKeywordsOrConjunctions(part));
  }

  return finalParts.filter((s) => s.length > 1);
}

/**
 * Checks if a sentence is addressed to a participant OTHER than the current user.
 * 100% generic across any institution, corporate organization, or platform.
 */
function checkAddressedToOther(
  lowerText: string,
  profile: UserProfile
): { isOther: boolean; target?: string } {
  // Check for other roll numbers or IDs: "roll 118", "id 402", "number 25", etc.
  const rollMatch = lowerText.match(/\b(?:roll|number|id|no\.?)\s*([a-zA-Z0-9\-]+)/i);
  if (rollMatch && rollMatch[1]) {
    const foundId = rollMatch[1].toLowerCase();
    const isUserId = (profile.identifiers || []).some(
      (id) => id.toLowerCase() === foundId || foundId.includes(id.toLowerCase())
    );
    if (!isUserId && foundId.length >= 2) {
      return { isOther: true, target: `ID ${rollMatch[1]}` };
    }
  }

  // Generic participant shift markers
  if (/\b(?:next student|next person|anyone else|someone else|next roll|everyone else|moving on to|next slide)\b/i.test(lowerText)) {
    return { isOther: true, target: "Next participant" };
  }

  return { isOther: false };
}

/**
 * Extracts a clean question or callout from a single sentence.
 */
export function extractCleanSentenceQuestion(text: string): string {
  let cleaned = text.trim();
  const match = cleaned.match(/\b(what|why|how|when|where|who|which|can you|could you|would you|do you|are you|tell me|explain|define|kya)\b.*/i);
  if (match && match[0]) {
    cleaned = match[0];
  }
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (!cleaned.endsWith("?") && !cleaned.endsWith(".")) {
    cleaned += "?";
  }
  return cleaned;
}

/**
 * Parses a caption stream and returns structured sentence objects with
 * explicit "old" vs "new" and "connected" vs "disconnected" classification.
 */
export function parseSentenceStream(
  text: string,
  profile: UserProfile,
  timestampMs = Date.now(),
  speakerId = "Speaker"
): ParsedSentence[] {
  const rawSentences = splitIntoSentences(text, profile);
  if (rawSentences.length === 0) {
    return [];
  }

  const results: ParsedSentence[] = [];

  for (let i = 0; i < rawSentences.length; i++) {
    const sentenceText = rawSentences[i];
    const lower = sentenceText.toLowerCase();
    const isLast = i === rawSentences.length - 1;

    // 1. Status: Previous sentences are OLD; the latest active sentence is NEW / CURRENT
    const status: SentenceStatus = isLast ? "new" : "old";

    // 2. Check if this sentence mentions the user
    let hasUserMention = false;
    let mentionedTarget: string | undefined;

    for (const rawId of profile.identifiers) {
      if (rawId && matchIdentifier(sentenceText, rawId).matched) {
        hasUserMention = true;
        mentionedTarget = `ID ${rawId}`;
        break;
      }
    }

    if (!hasUserMention) {
      const nameTargets = [profile.displayName, ...profile.aliases].filter(Boolean);
      for (const name of nameTargets) {
        if (matchName(sentenceText, name).matched) {
          hasUserMention = true;
          mentionedTarget = name;
          break;
        }
      }
    }

    // Check user-configured custom alert keywords (topics, project names, technical terms)
    if (!hasUserMention && profile.keywords && profile.keywords.length > 0) {
      for (const kw of profile.keywords) {
        if (!kw || kw.trim().length === 0) continue;
        const cleanKw = kw.trim().toLowerCase();
        const kwRegex = new RegExp(`(^|[^a-z0-9])${cleanKw.replace(/[\^$*+?.()|[\]{}\\]/g, '\\$&')}([^a-z0-9]|$)`, "i");
        if (cleanKw.length >= 2 && (lower.includes(cleanKw) || kwRegex.test(lower))) {
          hasUserMention = true;
          mentionedTarget = `Keyword "${kw.trim()}"`;
          break;
        }
      }
    }

    // 3. Check if addressed to someone else
    const otherCheck = checkAddressedToOther(lower, profile);

    // 4. Question detection
    const isQ = isQuestionSentence(lower);
    const coreQ = isQ ? extractCleanSentenceQuestion(sentenceText) : undefined;

    // 5. Connected vs Disconnected classification
    let relation: SentenceRelation = "standalone";
    let relationReason = "Initial sentence";

    if (i > 0) {
      const prevSentence = rawSentences[i - 1];
      const prevLower = prevSentence.toLowerCase();

      if (otherCheck.isOther) {
        relation = "disconnected";
        relationReason = `Addressed to different participant (${otherCheck.target})`;
      } else if (CONNECTIVE_PREFIXES_REGEX.test(sentenceText.trim())) {
        const connMatch = sentenceText.trim().match(CONNECTIVE_PREFIXES_REGEX);
        const word = connMatch ? connMatch[0] : "conjunction";
        relation = "connected";
        relationReason = `Connective follow-up via '${word}'`;
      } else if (ANAPHORIC_PRONOUNS_REGEX.test(sentenceText)) {
        relation = "connected";
        relationReason = "Refers back to previous subject";
      } else if (hasUserMention && isQ && isQuestionSentence(prevLower)) {
        relation = "disconnected";
        relationReason = "New distinct question";
      } else if (hasUserMention) {
        relation = "connected";
        relationReason = `Direct follow-up to ${mentionedTarget || "you"}`;
      } else {
        relation = "disconnected";
        relationReason = "New statement / topic transition";
      }
    }

    results.push({
      id: `sent_${timestampMs}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      index: i,
      text: sentenceText,
      rawText: sentenceText,
      speakerId,
      status,
      relation,
      relationReason,
      isQuestion: isQ,
      coreQuestion: coreQ,
      hasUserMention,
      mentionedTarget,
      addressedToOther: otherCheck.isOther,
      otherTarget: otherCheck.target,
      timestampMs,
    });
  }

  return results;
}

export interface DialogueAnalysis {
  sentences: ParsedSentence[];
  activeSentence: ParsedSentence;
  previousSentences: ParsedSentence[];
  coreFocusText: string;
  isQuestion: boolean;
  topic?: string;
  relationToPrevious: SentenceRelation;
  relationReason: string;
  hasUserMention: boolean;
  addressedToOther: boolean;
  otherTarget?: string;
  activeFollowUp?: string;
}

/**
 * Analyzes full multi-sentence stream to provide a structured dialogue breakdown,
 * ensuring UI and alerts never remain stuck on an old question when new speech occurs.
 */
export function getDialogueAnalysis(
  text: string,
  profile: UserProfile,
  timestampMs = Date.now(),
  speakerId = "Speaker"
): DialogueAnalysis {
  const sentences = parseSentenceStream(text, profile, timestampMs, speakerId);

  if (sentences.length === 0) {
    const dummy: ParsedSentence = {
      id: `sent_${timestampMs}_0`,
      index: 0,
      text: text.trim(),
      rawText: text,
      speakerId,
      status: "new",
      relation: "standalone",
      relationReason: "Initial speech",
      isQuestion: false,
      hasUserMention: false,
      addressedToOther: false,
      timestampMs,
    };
    return {
      sentences: [dummy],
      activeSentence: dummy,
      previousSentences: [],
      coreFocusText: text.trim(),
      isQuestion: false,
      relationToPrevious: "standalone",
      relationReason: "Initial speech",
      hasUserMention: false,
      addressedToOther: false,
    };
  }

  const activeSentence = sentences[sentences.length - 1];
  const previousSentences = sentences.slice(0, -1);

  let coreFocusText = activeSentence.text;
  let isQuestion = activeSentence.isQuestion;
  let activeFollowUp: string | undefined = undefined;

  // 1. If active sentence is a question, focus immediately on the new question!
  if (activeSentence.isQuestion) {
    coreFocusText = activeSentence.coreQuestion || activeSentence.text;
    isQuestion = true;
  }
  // 2. If active sentence is a connected follow-up (e.g. "tatha 117 aur ine Aryan 17")
  else if (activeSentence.relation === "connected" && previousSentences.length > 0) {
    // Look backwards for the core question that is being continued
    const prevQ = [...previousSentences].reverse().find((s) => s.isQuestion);
    if (prevQ) {
      coreFocusText = prevQ.coreQuestion || prevQ.text;
      isQuestion = true;
      activeFollowUp = activeSentence.text;
    } else {
      coreFocusText = activeSentence.text;
    }
  }
  // 3. If active sentence contains a direct user mention
  else if (activeSentence.hasUserMention) {
    coreFocusText = activeSentence.text;
  }
  // 4. Default: current active sentence is the focus (never resurrect old disconnected questions)
  else {
    coreFocusText = activeSentence.text;
    isQuestion = false;
  }

  // Extract clean topic if question
  let topic: string | undefined = undefined;
  if (isQuestion) {
    const topicMatch = coreFocusText.match(/(?:what is|what are|define|explain|about)\s+([a-zA-Z0-9\s]+?)(?:\?|$|\.|\()/i);
    if (topicMatch && topicMatch[1]) {
      topic = topicMatch[1].trim();
    }
  }

  return {
    sentences,
    activeSentence,
    previousSentences,
    coreFocusText,
    isQuestion,
    topic,
    relationToPrevious: activeSentence.relation,
    relationReason: activeSentence.relationReason,
    hasUserMention: activeSentence.hasUserMention,
    addressedToOther: activeSentence.addressedToOther,
    otherTarget: activeSentence.otherTarget,
    activeFollowUp,
  };
}
