import { UserProfile } from "../types/profile.js";
import { TranscriptSegment } from "../types/transcript.js";
import { MeetingEvent } from "../types/events.js";
import { ParsedSentence, DialogueAnalysis } from "./sentenceParser.js";
export type TurnAction = "NEW_ALERT" | "UPDATE_ALERT" | "CONTINUATION" | "NEW_TURN" | "NO_OP";
export interface DetectionResult {
    hasEvent: boolean;
    event?: MeetingEvent;
    turnAction: TurnAction;
    turnId: string;
    accumulatedText: string;
    isContinuation: boolean;
    speakerId: string;
    sentences?: ParsedSentence[];
    activeSentence?: ParsedSentence;
    dialogueAnalysis?: DialogueAnalysis;
}
export interface SpeechTurn {
    id: string;
    speakerId: string;
    accumulatedText: string;
    startTime: number;
    lastUpdateTime: number;
    hasAlert: boolean;
    alertEvent?: MeetingEvent;
    isCompleted: boolean;
}
export declare class EventDetector {
    private profile;
    private activeTurn;
    private alertedSentenceHashes;
    constructor(profile: UserProfile, _legacyCooldownMs?: number);
    updateProfile(profile: UserProfile): void;
    resetHistory(): void;
    exportAlertedHashes(): [string, number][];
    importAlertedHashes(entries: [string, number][]): void;
    processSegment(segment: TranscriptSegment): DetectionResult;
    private isContinuationOf;
    private detectMention;
    private checkQuestionPattern;
    private checkAttendancePattern;
}
//# sourceMappingURL=detector.d.ts.map