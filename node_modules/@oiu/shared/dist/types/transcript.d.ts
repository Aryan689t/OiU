export interface TranscriptSegment {
    id: string;
    sessionId: string;
    text: string;
    startMs: number;
    endMs: number;
    speakerId?: string;
    isFinal: boolean;
    confidence?: number;
}
//# sourceMappingURL=transcript.d.ts.map