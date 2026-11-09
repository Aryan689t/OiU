import { UserProfile } from "../types/profile.js";
import { TranscriptSegment } from "../types/transcript.js";
import { MeetingEvent } from "../types/events.js";
export interface DetectionResult {
    hasEvent: boolean;
    event?: MeetingEvent;
}
export declare class EventDetector {
    private profile;
    private lastAlertTimestamp;
    private globalCooldownMs;
    private alertedSentenceHashes;
    constructor(profile: UserProfile, globalCooldownMs?: number);
    updateProfile(profile: UserProfile): void;
    resetHistory(): void;
    exportAlertedHashes(): [string, number][];
    importAlertedHashes(entries: [string, number][]): void;
    processSegment(segment: TranscriptSegment): DetectionResult;
    private isAlreadyAlertedSentence;
    private recordAlertedSentence;
    private checkQuestionPattern;
    private checkAttendancePattern;
}
//# sourceMappingURL=detector.d.ts.map