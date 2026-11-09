/**
 * Intelligent fuzzy, phonetic, and consonant-skeleton matcher for spoken names and identifiers in Google Meet transcripts.
 */

export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; ++i) matrix[i] = [i];
  for (let i = 0; i <= an; ++i) matrix[0][i] = i;

  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          )
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Phonetic normalizer for speech-to-text variations.
 * Collapses duplicate letters and maps common speech-to-text phonetic substitutes.
 */
export function phoneticNormalize(str: string): string {
  let s = str.toLowerCase().trim();
  if (!s) return "";

  // Remove non-alphanumeric except spaces
  s = s.replace(/[^a-z0-9\s]/g, "");

  // Common speech-to-text sound-alike substitutions
  s = s.replace(/ph/g, "f");
  s = s.replace(/th/g, "t");
  s = s.replace(/dh/g, "d");
  s = s.replace(/bh/g, "b");
  s = s.replace(/gh/g, "g");
  s = s.replace(/kh/g, "k");
  s = s.replace(/sh/g, "s");
  s = s.replace(/ck/g, "k");
  s = s.replace(/c(?=[eiy])/g, "s");
  s = s.replace(/c/g, "k");
  s = s.replace(/q/g, "k");
  s = s.replace(/z/g, "s");
  s = s.replace(/w/g, "v");
  s = s.replace(/ee|ea|y/g, "i");
  s = s.replace(/oo|ou/g, "u");

  // Collapse consecutive duplicate characters (e.g. "aaryan" -> "aryan", "tt" -> "t")
  s = s.replace(/([a-z])\1+/g, "$1");

  return s;
}

/**
 * Extracts a consonant-sound skeleton, dropping vowels and soft pre-consonantal liquids.
 * This bridges speech-to-text acoustic misinterpretations like "Tathagat" <-> "The target".
 */
export function consonantSkeleton(str: string): string {
  let s = str.toLowerCase().trim();
  if (!s) return "";

  s = s.replace(/[^a-z0-9]/g, "");
  s = s.replace(/ph/g, "f");
  s = s.replace(/th/g, "t");
  s = s.replace(/dh/g, "d");
  s = s.replace(/bh/g, "b");
  s = s.replace(/gh/g, "g");
  s = s.replace(/kh/g, "k");
  s = s.replace(/sh/g, "s");
  s = s.replace(/ck/g, "k");
  s = s.replace(/c(?=[eiy])/g, "s");
  s = s.replace(/c/g, "k");
  s = s.replace(/q/g, "k");
  s = s.replace(/z/g, "s");
  s = s.replace(/w/g, "v");

  // Remove soft liquid 'r' before consonants (e.g. "target" -> "taget")
  s = s.replace(/r(?=[bcdfghjklmnpqrstvwxyz])/g, "");

  // Drop vowels
  s = s.replace(/[aeiouy]/g, "");

  // Collapse duplicate consonants (e.g. "tt" -> "t")
  s = s.replace(/([a-z])\1+/g, "$1");

  return s;
}

/**
 * Common English speech-to-text dictionary corruptions for names.
 * Google Meet STT forces English dictionary words on Indian/global names.
 */
const COMMON_STT_CONFUSIONS: Record<string, string[]> = {
  "tathagat": [
    "the target",
    "that target",
    "target",
    "the market",
    "tata gat",
    "tata got",
    "tatagat",
    "data get",
    "thathagat",
    "tathagath",
    "ta tha gat",
  ],
  "tathagata": [
    "the target",
    "that target",
    "target",
    "tata gata",
    "tatagata",
    "thathagata",
  ],
  "aryan": [
    "a ryan",
    "iron",
    "arian",
    "aryen",
    "aaryan",
    "are in",
  ],
};

export interface MatchResult {
  matched: boolean;
  confidence: number;
  matchedName?: string;
}

/**
 * Checks if targetName is spoken in text, supporting:
 * 1. Exact case-insensitive match
 * 2. Whitespace-compressed match (e.g. "A ryan" -> "aryan", "Ta tha gat" -> "tathagat")
 * 3. STT acoustic confusion dictionary (e.g. "The target" -> "tathagat")
 * 4. Consonant skeleton matching (e.g. "the target" [ttgt] == "tathagat" [ttgt])
 * 5. Token-level Levenshtein edit distance (tolerates 1-2 character typos from speech-to-text)
 * 6. Phonetic similarity (tolerates "Aaryan", "Arian", "Tathagath", etc.)
 */
export function matchName(text: string, targetName: string): MatchResult {
  const target = targetName.trim().toLowerCase();
  if (!target || target.length < 2) {
    return { matched: false, confidence: 0 };
  }

  const lowerText = text.toLowerCase();

  // 1. Direct whole-word or substring match
  const wordBoundaryRegex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(target)}($|[^a-z0-9])`, "i");
  if (wordBoundaryRegex.test(text)) {
    return { matched: true, confidence: 1.0, matchedName: targetName };
  }

  // 2. Compressed match (removes spaces, hyphens, punctuation)
  const compactText = lowerText.replace(/[^a-z0-9]/g, "");
  const compactTarget = target.replace(/[^a-z0-9]/g, "");
  if (compactTarget.length >= 3 && compactText.includes(compactTarget)) {
    return { matched: true, confidence: 0.98, matchedName: targetName };
  }

  // 3. Known STT acoustic confusions dictionary check on text
  const knownConfusions = COMMON_STT_CONFUSIONS[compactTarget];
  if (knownConfusions) {
    for (const confusion of knownConfusions) {
      const confusionRegex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(confusion)}($|[^a-z0-9])`, "i");
      if (confusionRegex.test(lowerText)) {
        return { matched: true, confidence: 0.96, matchedName: targetName };
      }
    }
  }

  // 4. Token & N-Gram matching with Sliding Window (Word-boundary scoped to prevent ambient noise matching)
  const tokens = lowerText
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const targetWords = target.split(/\s+/).filter(Boolean);
  const targetWordCount = Math.max(1, targetWords.length);
  const targetSkeleton = consonantSkeleton(compactTarget);
  const phoneticTarget = phoneticNormalize(compactTarget);

  const maxDistance = target.length <= 4 ? 1 : 2;

  // Window sizes from 1 up to targetWordCount + 2 (handles multi-word STT confusions like "the target")
  const minWin = Math.max(1, targetWordCount - 1);
  const maxWin = targetWordCount + 2;

  for (let windowSize = minWin; windowSize <= maxWin; windowSize++) {
    for (let i = 0; i <= tokens.length - windowSize; i++) {
      const windowStr = tokens.slice(i, i + windowSize).join(" ");
      const windowCompact = tokens.slice(i, i + windowSize).join("");

      // Check known confusions on window
      if (knownConfusions && knownConfusions.includes(windowStr)) {
        return { matched: true, confidence: 0.96, matchedName: targetName };
      }

      // Exact consonant skeleton match on token window (e.g. "ttgt" == "ttgt" for "the target" == "tathagat")
      const winSkeleton = consonantSkeleton(windowCompact);
      if (winSkeleton && targetSkeleton && winSkeleton.length >= 3) {
        if (winSkeleton === targetSkeleton) {
          return { matched: true, confidence: 0.95, matchedName: targetName };
        }
        if (levenshteinDistance(winSkeleton, targetSkeleton) <= 1 && targetSkeleton.length >= 4) {
          return { matched: true, confidence: 0.90, matchedName: targetName };
        }
      }

      // Phonetic key match on window (handles "Aaryan", "Arian", "Tathagath")
      const winPhonetic = phoneticNormalize(windowCompact);
      if (winPhonetic && phoneticTarget && winPhonetic.length >= 3) {
        if (winPhonetic === phoneticTarget) {
          return { matched: true, confidence: 0.95, matchedName: targetName };
        }
        const pDist = levenshteinDistance(winPhonetic, phoneticTarget);
        if (pDist <= 1 && phoneticTarget.length >= 5 && winPhonetic[0] === phoneticTarget[0]) {
          return { matched: true, confidence: 0.88, matchedName: targetName };
        }
      }

      // Direct edit distance on window token
      const dist = levenshteinDistance(windowCompact, compactTarget);
      if (dist <= maxDistance && dist / target.length <= 0.3) {
        // Guard against other participant names (e.g. "ryan" matching "aryan")
        if (target.length <= 5 && (compactTarget.endsWith(windowCompact) || compactTarget.startsWith(windowCompact)) && windowCompact.length < compactTarget.length) {
          continue;
        }
        return { matched: true, confidence: 0.92, matchedName: targetName };
      }
    }
  }

  return { matched: false, confidence: 0 };
}

/**
 * Checks if rawId (registration number, roll number, employee id) is mentioned in text.
 * Handles exact digits, space-separated digits ("1 1 7"), and spoken number variations.
 */
export function matchIdentifier(text: string, rawId: string): MatchResult {
  const id = rawId.trim().toLowerCase();
  if (!id) return { matched: false, confidence: 0 };

  const lowerText = text.toLowerCase();

  // 1. Direct word boundary match
  const boundaryRegex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(id)}($|[^a-z0-9])`, "i");
  if (boundaryRegex.test(lowerText)) {
    return { matched: true, confidence: 1.0, matchedName: rawId };
  }

  // 2. Space or hyphen separated digits (e.g. "1 1 7" or "1-1-7" for "117")
  if (/^\d+$/.test(id) && id.length >= 2) {
    const spacedPattern = id.split("").join("[\\s\\-_]+");
    const spacedRegex = new RegExp(`(^|[^a-z0-9])${spacedPattern}($|[^a-z0-9])`, "i");
    if (spacedRegex.test(lowerText)) {
      return { matched: true, confidence: 0.98, matchedName: rawId };
    }
  }

  return { matched: false, confidence: 0 };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
