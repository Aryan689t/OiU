import { UserProfile } from "../types/profile.js";
import { TranscriptSegment } from "../types/transcript.js";
import { MeetingEvent, MeetingEventType } from "../types/events.js";
import { matchName, matchIdentifier } from "./matcher.js";

export interface DetectionResult {
  hasEvent: boolean;
  event?: MeetingEvent;
}

export class EventDetector {
  private profile: UserProfile;
  private lastAlertTimestamp = 0;
  private globalCooldownMs: number;
  private alertedSentenceHashes = new Map<string, number>();

  constructor(profile: UserProfile, globalCooldownMs = 4000) {
    this.profile = profile;
    this.globalCooldownMs = globalCooldownMs;
  }

  public updateProfile(profile: UserProfile) {
    this.profile = profile;
  }

  public resetHistory() {
    this.lastAlertTimestamp = 0;
    this.alertedSentenceHashes.clear();
  }

  public exportAlertedHashes(): [string, number][] {
    return Array.from(this.alertedSentenceHashes.entries());
  }

  public importAlertedHashes(entries: [string, number][]) {
    const now = Date.now();
    for (const [hash, timestamp] of entries) {
      if (now - timestamp < 30000) {
        this.alertedSentenceHashes.set(hash, timestamp);
      }
    }
  }

  public processSegment(segment: TranscriptSegment): DetectionResult {
    const text = segment.text.trim();
    if (!text || text.length < 2) return { hasEvent: false };

    const now = segment.endMs || Date.now();

    // 1. Check Global Cooldown: Prevent repeated alert chimes within 8s of any alert
    if (now - this.lastAlertTimestamp < this.globalCooldownMs) {
      return { hasEvent: false };
    }

    // 2. Check Sentence Fingerprint: Prevent duplicate alerts for the exact same progressive sentence
    const cleanSentence = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (this.isAlreadyAlertedSentence(cleanSentence, now)) {
      return { hasEvent: false };
    }

    const lowerText = text.toLowerCase();

    // 3. Check Identifiers (Registration numbers, Roll numbers, Employee IDs)
    for (const rawId of this.profile.identifiers) {
      const match = matchIdentifier(text, rawId);
      if (match.matched) {
        this.lastAlertTimestamp = now;
        this.recordAlertedSentence(cleanSentence, now);

        const isAttendance = this.checkAttendancePattern(lowerText);
        const isQuestion = !isAttendance && this.checkQuestionPattern(lowerText);
        const eventType: MeetingEventType = isAttendance
          ? "ATTENDANCE_CALL"
          : isQuestion
          ? "DIRECT_QUESTION"
          : "IDENTIFIER_MENTION";

        const event: MeetingEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          sessionId: segment.sessionId,
          type: eventType,
          transcriptExcerpt: text,
          evidenceSegmentIds: [segment.id],
          timestampMs: now,
          confidence: match.confidence,
          urgency: "high",
          explanation: isAttendance
            ? `Attendance call for ID "${rawId}".`
            : isQuestion
            ? `Direct question addressed to ID "${rawId}".`
            : `Your ID/Registration number "${rawId}" was called.`,
        };

        return { hasEvent: true, event };
      }
    }

    // 4. Check Display Name and Aliases with Fuzzy, Phonetic & Consonant Skeleton Matching
    const nameTargets = [this.profile.displayName, ...this.profile.aliases]
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    for (const rawName of nameTargets) {
      const match = matchName(text, rawName);
      if (match.matched) {
        this.lastAlertTimestamp = now;
        this.recordAlertedSentence(cleanSentence, now);

        const isQuestion = this.checkQuestionPattern(lowerText);
        const eventType: MeetingEventType = isQuestion ? "DIRECT_QUESTION" : "NAME_MENTION";

        const event: MeetingEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          sessionId: segment.sessionId,
          type: eventType,
          transcriptExcerpt: text,
          evidenceSegmentIds: [segment.id],
          timestampMs: now,
          confidence: match.confidence,
          urgency: "high",
          explanation: isQuestion
            ? `Direct question addressed to ${rawName}.`
            : `Your name "${rawName}" was mentioned.`,
        };

        return { hasEvent: true, event };
      }
    }

    return { hasEvent: false };
  }

  private isAlreadyAlertedSentence(cleanSentence: string, now: number): boolean {
    // Purge entries older than 25 seconds
    for (const [hash, timestamp] of this.alertedSentenceHashes.entries()) {
      if (now - timestamp > 25000) {
        this.alertedSentenceHashes.delete(hash);
      }
    }

    // Check if the current sentence is identical to or an in-progress prefix of a recent alert
    for (const [hash] of this.alertedSentenceHashes.entries()) {
      if (hash === cleanSentence) return true;
      if (cleanSentence.startsWith(hash) && hash.length >= 8) return true;
      if (hash.startsWith(cleanSentence) && cleanSentence.length >= 8) return true;
    }

    return false;
  }

  private recordAlertedSentence(cleanSentence: string, now: number) {
    if (cleanSentence && cleanSentence.length >= 2) {
      this.alertedSentenceHashes.set(cleanSentence, now);
    }
  }

  private checkQuestionPattern(lowerText: string): boolean {
    if (lowerText.includes("?")) return true;
    const questionStarters = [
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
      "what do you think",
      "your thoughts",
      "did you",
      "do you",
      "have you",
      "tell me",
      "explain",
      "define",
    ];
    return questionStarters.some((starter) => lowerText.includes(starter));
  }

  private checkAttendancePattern(lowerText: string): boolean {
    const attendanceKeywords = [
      "present",
      "roll call",
      "attendance",
      "absent",
      "number",
      "here",
    ];
    return attendanceKeywords.some((word) => lowerText.includes(word));
  }
}
