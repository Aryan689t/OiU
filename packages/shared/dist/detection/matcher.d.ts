/**
 * Intelligent fuzzy, phonetic, and consonant-skeleton matcher for spoken names and identifiers in Google Meet transcripts.
 */
export declare function levenshteinDistance(a: string, b: string): number;
/**
 * Phonetic normalizer for speech-to-text variations.
 * Collapses duplicate letters and maps common speech-to-text phonetic substitutes.
 */
export declare function phoneticNormalize(str: string): string;
/**
 * Extracts a consonant-sound skeleton, dropping vowels and soft pre-consonantal liquids.
 * This bridges speech-to-text acoustic misinterpretations like "Tathagat" <-> "The target".
 */
export declare function consonantSkeleton(str: string): string;
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
export declare function matchName(text: string, targetName: string): MatchResult;
/**
 * Checks if rawId (registration number, roll number, employee id) is mentioned in text.
 * Handles exact digits, space-separated digits ("1 1 7"), and spoken number variations.
 */
export declare function matchIdentifier(text: string, rawId: string): MatchResult;
//# sourceMappingURL=matcher.d.ts.map