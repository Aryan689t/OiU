/**
 * Dynamic, pre-compiled phonetic & spelling-variation matcher for user-configured
 * names, aliases, identifiers, and keywords. Zero hardcoded participant names.
 */
export declare function levenshteinDistance(a: string, b: string): number;
/**
 * Phonetic normalizer for speech-to-text & spelling variations.
 */
export declare function phoneticNormalize(str: string): string;
/**
 * Extracts a consonant-sound skeleton, dropping vowels and soft pre-consonantal liquids.
 * Bridges acoustic STT misinterpretations dynamically without hardcoded dictionaries.
 */
export declare function consonantSkeleton(str: string): string;
/**
 * Dynamically generates likely spelling mistakes, typos, and STT confusions
 * for any user-entered name or keyword once at profile setup/compile time.
 */
export declare function generateSpellingVariants(rawTarget: string): Set<string>;
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
    windowsBySize: Map<number, PreparedCaptionWindow[]>;
}
export declare function compileTarget(rawTarget: string): CompiledTarget | null;
export declare function prepareCaptionText(text: string): PreparedCaptionText;
export interface MatchResult {
    matched: boolean;
    confidence: number;
    matchedName?: string;
}
/**
 * Optimized matcher comparing pre-tokenized caption text against a pre-compiled trigger target.
 */
export declare function matchCompiledTarget(prepared: PreparedCaptionText, compiled: CompiledTarget): MatchResult;
/**
 * Checks if targetName or keyword (including spelling mistakes and phonetic variants) is in text.
 */
export declare function matchName(text: string, targetName: string): MatchResult;
/**
 * Checks if rawId (registration number, roll number, employee id) is mentioned in text.
 * Handles exact digits, space-separated digits ("1 1 7"), and spoken number variations.
 */
export declare function matchIdentifier(text: string, rawId: string): MatchResult;
//# sourceMappingURL=matcher.d.ts.map