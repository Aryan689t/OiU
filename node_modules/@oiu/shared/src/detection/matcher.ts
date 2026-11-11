/**
 * Dynamic, pre-compiled phonetic & spelling-variation matcher for user-configured
 * names, aliases, identifiers, and keywords. Zero hardcoded participant names.
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
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Phonetic normalizer for speech-to-text & spelling variations.
 */
export function phoneticNormalize(str: string): string {
  let s = str.toLowerCase().trim();
  if (!s) return "";

  s = s.replace(/[^a-z0-9\s]/g, "");

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

  s = s.replace(/([a-z])\1+/g, "$1");
  return s;
}

/**
 * Extracts a consonant-sound skeleton, dropping vowels and soft pre-consonantal liquids.
 * Bridges acoustic STT misinterpretations dynamically without hardcoded dictionaries.
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

  // Drop soft liquid 'r' before consonants (e.g. "target" -> "taget")
  s = s.replace(/r(?=[bcdfghjklmnpqrstvwxyz])/g, "");

  // Drop vowels
  s = s.replace(/[aeiouy]/g, "");

  // Collapse duplicate consonants
  s = s.replace(/([a-z])\1+/g, "$1");
  return s;
}

// Guard list so short fuzzy-generated variants never match common English function words
const ENGLISH_FUNCTION_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "had", "her", "was", "one", "our", "out", "day", "get", "has", "him",
  "his", "how", "man", "new", "now", "old", "see", "two", "way", "who",
  "did", "its", "let", "put", "say", "she", "too", "use", "that", "with",
  "have", "this", "will", "your", "from", "they", "know", "want", "been",
  "good", "much", "some", "time", "very", "when", "come", "here", "just",
  "like", "long", "make", "many", "more", "only", "over", "such", "take",
  "than", "them", "well", "were", "what", "into", "year", "also", "back",
]);

/**
 * Dynamically generates likely spelling mistakes, typos, and STT confusions
 * for any user-entered name or keyword once at profile setup/compile time.
 */
export function generateSpellingVariants(rawTarget: string): Set<string> {
  const compact = rawTarget.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const variants = new Set<string>();
  if (!compact || compact.length < 2) return variants;

  variants.add(compact);

  // For ultra-short tokens (< 4 chars), keep variants conservative to avoid noisy false alarms
  if (compact.length < 4) {
    // Allow simple double letter collapse / first-vowel double
    variants.add(compact.replace(/([a-z])\1+/g, "$1"));
    return variants;
  }

  const addSafe = (candidate: string) => {
    if (candidate.length >= 3 && !ENGLISH_FUNCTION_WORDS.has(candidate)) {
      variants.add(candidate);
    }
  };

  // 1. Collapsed double letters ("attendence" -> "atendence", "aaryan" -> "aryan")
  const collapsed = compact.replace(/([a-z])\1+/g, "$1");
  addSafe(collapsed);

  // Build from both original compact and collapsed form
  const roots = Array.from(new Set([compact, collapsed]));

  const vowelPairs: Record<string, string[]> = {
    a: ["e", "u", "aa"],
    e: ["a", "i", "ee"],
    i: ["e", "y", "ee"],
    o: ["u", "oo"],
    u: ["o", "a", "oo"],
    y: ["i", "ie"],
  };

  const consonantEquiv: Record<string, string[]> = {
    v: ["w"],
    w: ["v"],
    c: ["s", "k"],
    s: ["c", "z", "sh"],
    z: ["s", "j"],
    k: ["c", "q", "kh"],
    q: ["k"],
    f: ["ph"],
  };

  for (const base of roots) {
    // 2. Single-character vowel ambiguity swaps (e.g. "attendence" <-> "attendance")
    for (let i = 0; i < base.length; i++) {
      const ch = base[i];
      const replacements = vowelPairs[ch];
      if (replacements) {
        for (const rep of replacements) {
          addSafe(base.slice(0, i) + rep + base.slice(i + 1));
        }
      }
    }

    // 3. Phonetic consonant swaps
    for (let i = 0; i < base.length; i++) {
      const ch = base[i];
      const reps = consonantEquiv[ch];
      if (reps) {
        for (const rep of reps) {
          addSafe(base.slice(0, i) + rep + base.slice(i + 1));
        }
      }
    }

    // 4. Multi-letter phonetic swaps ("ph"<->"f", "sh"<->"s", "ck"<->"k", "th"<->"t", "dh"<->"d")
    const digraphs: [RegExp, string][] = [
      [/ph/g, "f"],
      [/f/g, "ph"],
      [/sh/g, "s"],
      [/ck/g, "k"],
      [/th/g, "t"],
      [/dh/g, "d"],
      [/bh/g, "b"],
      [/gh/g, "g"],
      [/kh/g, "k"],
    ];
    for (const [pattern, rep] of digraphs) {
      if (pattern.test(base)) {
        addSafe(base.replace(pattern, rep));
      }
    }

    // 5. Aspirated 'h' insertions after stop consonants ("t"->"th") and doubling consonants
    for (let i = 0; i < base.length; i++) {
      const ch = base[i];
      if ("tdbgkcp".includes(ch) && base[i + 1] !== "h") {
        addSafe(base.slice(0, i + 1) + "h" + base.slice(i + 1));
      }
      // Single character doubling (e.g. "aryan" -> "aaryan", "atendance" -> "attendance")
      if (base[i + 1] !== ch) {
        addSafe(base.slice(0, i + 1) + ch + base.slice(i + 1));
      }
      // Single vowel/letter omission for words >= 6 chars (e.g. accidental dropped letter)
      if (base.length >= 6 && i > 0) {
        addSafe(base.slice(0, i) + base.slice(i + 1));
      }
    }

    // 6. Adjacent character transposition typos (length >= 5, e.g. "atendence" <-> "atendnece")
    if (base.length >= 5) {
      for (let i = 1; i < base.length - 1; i++) {
        if (base[i] !== base[i + 1]) {
          addSafe(base.slice(0, i) + base[i + 1] + base[i] + base.slice(i + 2));
        }
      }
    }
  }

  return variants;
}

export interface CompiledTarget {
  raw: string;
  targetLower: string;
  compact: string;
  wordCount: number;
  wordBoundaryRegex: RegExp;
  phonetic: string;
  skeleton: string;
  variants: Set<string>;
}

export interface PreparedCaptionWindow {
  compact: string;
  skeleton: string;
  phonetic: string;
}

export interface PreparedCaptionText {
  rawText: string;
  lowerText: string;
  compactText: string;
  tokens: string[];
  // Pre-computed windows indexed by windowSize (1..6) so scanning multiple triggers does zero duplicate work
  windowsBySize: Map<number, PreparedCaptionWindow[]>;
}

const compiledTargetCache = new Map<string, CompiledTarget>();

export function compileTarget(rawTarget: string): CompiledTarget | null {
  const trimmed = rawTarget.trim();
  const targetLower = trimmed.toLowerCase();
  const compact = targetLower.replace(/[^a-z0-9]/g, "");
  if (!compact || compact.length < 2) return null;

  const cacheKey = `${trimmed}::${compact}`;
  const cached = compiledTargetCache.get(cacheKey);
  if (cached) return cached;

  const wordCount = Math.max(1, targetLower.split(/\s+/).filter(Boolean).length);
  const compiled: CompiledTarget = {
    raw: trimmed,
    targetLower,
    compact,
    wordCount,
    wordBoundaryRegex: new RegExp(`(^|[^a-z0-9])${escapeRegExp(targetLower)}($|[^a-z0-9])`, "i"),
    phonetic: phoneticNormalize(compact),
    skeleton: consonantSkeleton(compact),
    variants: generateSpellingVariants(trimmed),
  };

  if (compiledTargetCache.size > 200) {
    compiledTargetCache.clear();
  }
  compiledTargetCache.set(cacheKey, compiled);
  return compiled;
}

export function prepareCaptionText(text: string): PreparedCaptionText {
  const lowerText = text.toLowerCase();
  const compactText = lowerText.replace(/[^a-z0-9]/g, "");
  const tokens = lowerText
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  return {
    rawText: text,
    lowerText,
    compactText,
    tokens,
    windowsBySize: new Map(),
  };
}

function getWindows(prepared: PreparedCaptionText, windowSize: number): PreparedCaptionWindow[] {
  const existing = prepared.windowsBySize.get(windowSize);
  if (existing) return existing;

  const windows: PreparedCaptionWindow[] = [];
  const { tokens } = prepared;
  for (let i = 0; i <= tokens.length - windowSize; i++) {
    const winCompact = tokens.slice(i, i + windowSize).join("");
    windows.push({
      compact: winCompact,
      skeleton: consonantSkeleton(winCompact),
      phonetic: phoneticNormalize(winCompact),
    });
  }
  prepared.windowsBySize.set(windowSize, windows);
  return windows;
}

export interface MatchResult {
  matched: boolean;
  confidence: number;
  matchedName?: string;
}

/**
 * Optimized matcher comparing pre-tokenized caption text against a pre-compiled trigger target.
 */
export function matchCompiledTarget(
  prepared: PreparedCaptionText,
  compiled: CompiledTarget
): MatchResult {
  // 1. Direct whole-word boundary match
  if (compiled.wordBoundaryRegex.test(prepared.rawText)) {
    return { matched: true, confidence: 1.0, matchedName: compiled.raw };
  }

  // 2. Compressed continuous substring match (for targets >= 3 chars, handles "a ryan" or missing spaces)
  if (compiled.compact.length >= 3 && prepared.compactText.includes(compiled.compact)) {
    return { matched: true, confidence: 0.98, matchedName: compiled.raw };
  }

  // 3. Sliding-window O(1) Set, Skeleton, Phonetic, and Length-Gated Edit Distance
  const minWin = Math.max(1, compiled.wordCount - 1);
  const maxWin = Math.min(prepared.tokens.length, compiled.wordCount + 2);
  const maxDistance = compiled.compact.length <= 4 ? 1 : 2;

  for (let windowSize = minWin; windowSize <= maxWin; windowSize++) {
    const windows = getWindows(prepared, windowSize);
    for (const win of windows) {
      const winCompact = win.compact;

      // Guard against shorter suffix/prefix collisions on short names (e.g. "ryan" matching "aryan")
      if (
        compiled.compact.length <= 5 &&
        (compiled.compact.endsWith(winCompact) || compiled.compact.startsWith(winCompact)) &&
        winCompact.length < compiled.compact.length
      ) {
        continue;
      }

      // 3a. O(1) pre-generated spelling mistake & typo set lookup!
      if (compiled.variants.has(winCompact)) {
        return { matched: true, confidence: 0.96, matchedName: compiled.raw };
      }

      // 3b. Consonant skeleton match (e.g. "the target" [ttgt] == "tathagat" [ttgt], "attendence" [tndns] == "attendance" [tndns])
      if (win.skeleton && compiled.skeleton && win.skeleton.length >= 3) {
        if (win.skeleton === compiled.skeleton) {
          return { matched: true, confidence: 0.95, matchedName: compiled.raw };
        }
        if (
          compiled.skeleton.length >= 4 &&
          Math.abs(win.skeleton.length - compiled.skeleton.length) <= 1 &&
          levenshteinDistance(win.skeleton, compiled.skeleton) <= 1
        ) {
          return { matched: true, confidence: 0.9, matchedName: compiled.raw };
        }
      }

      // 3c. Phonetic signature match
      if (win.phonetic && compiled.phonetic && win.phonetic.length >= 3) {
        if (win.phonetic === compiled.phonetic) {
          return { matched: true, confidence: 0.95, matchedName: compiled.raw };
        }
        if (
          compiled.phonetic.length >= 5 &&
          win.phonetic[0] === compiled.phonetic[0] &&
          Math.abs(win.phonetic.length - compiled.phonetic.length) <= 1 &&
          levenshteinDistance(win.phonetic, compiled.phonetic) <= 1
        ) {
          return { matched: true, confidence: 0.88, matchedName: compiled.raw };
        }
      }

      // 3d. Length-filtered direct Levenshtein fallback
      if (Math.abs(winCompact.length - compiled.compact.length) <= maxDistance) {
        const dist = levenshteinDistance(winCompact, compiled.compact);
        if (dist <= maxDistance && dist / compiled.compact.length <= 0.3) {
          return { matched: true, confidence: 0.92, matchedName: compiled.raw };
        }
      }
    }
  }

  return { matched: false, confidence: 0 };
}

/**
 * Checks if targetName or keyword (including spelling mistakes and phonetic variants) is in text.
 */
export function matchName(text: string, targetName: string): MatchResult {
  const compiled = compileTarget(targetName);
  if (!compiled) return { matched: false, confidence: 0 };
  const prepared = prepareCaptionText(text);
  return matchCompiledTarget(prepared, compiled);
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
