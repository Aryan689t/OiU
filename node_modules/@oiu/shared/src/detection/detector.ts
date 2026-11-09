import { UserProfile } from "../types/profile.js";
import { TranscriptSegment } from "../types/transcript.js";
import { MeetingEvent, MeetingEventType } from "../types/events.js";
import { matchName, matchIdentifier } from "./matcher.js";

export type TurnAction = "NEW_ALERT" | "UPDATE_ALERT" | "CONTINUATION" | "NEW_TURN" | "NO_OP";

export interface DetectionResult {
  hasEvent: boolean;
  event?: MeetingEvent;
  turnAction: TurnAction;
  turnId: string;
  accumulatedText: string;
  isContinuation: boolean;
  speakerId: string;
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

export class EventDetector {
  private profile: UserProfile;
  private activeTurn: SpeechTurn | null = null;
  private alertedSentenceHashes = new Map<string, number>();

  constructor(profile: UserProfile, _legacyCooldownMs = 0) {
    this.profile = profile;
  }

  public updateProfile(profile: UserProfile) {
    this.profile = profile;
  }

  public resetHistory() {
    this.activeTurn = null;
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
    if (!text || text.length < 2) {
      return {
        hasEvent: false,
        turnAction: "NO_OP",
        turnId: this.activeTurn?.id || "",
        accumulatedText: this.activeTurn?.accumulatedText || "",
        isContinuation: false,
        speakerId: segment.speakerId || "Speaker",
      };
    }

    const now = segment.endMs || Date.now();
    const speaker = segment.speakerId || "Speaker";

    // 1. Check if this is a continuation of the ongoing speech turn
    if (this.activeTurn && this.isContinuationOf(text, this.activeTurn, now, speaker)) {
      const cleanIncoming = text.toLowerCase().replace(/[^a-z0-9]/g, "");
      const cleanCurrent = this.activeTurn.accumulatedText.toLowerCase().replace(/[^a-z0-9]/g, "");

      // 1a. Exact duplicate check (e.g. rapid DOM poll jitter)
      if (cleanIncoming === cleanCurrent) {
        return {
          hasEvent: false,
          turnAction: "NO_OP",
          turnId: this.activeTurn.id,
          accumulatedText: this.activeTurn.accumulatedText,
          isContinuation: true,
          speakerId: this.activeTurn.speakerId,
        };
      }

      // 1b. Progressive sentence growth (streaming continuation)
      const updatedText = text.length >= this.activeTurn.accumulatedText.length ? text : this.activeTurn.accumulatedText;
      this.activeTurn.accumulatedText = updatedText;
      this.activeTurn.lastUpdateTime = now;

      // If active turn already triggered an alert, UPDATE the alert in-place
      if (this.activeTurn.hasAlert && this.activeTurn.alertEvent) {
        const lowerText = updatedText.toLowerCase();
        const isAttendance = this.checkAttendancePattern(lowerText);
        const isQuestion = !isAttendance && this.checkQuestionPattern(lowerText);

        this.activeTurn.alertEvent.transcriptExcerpt = updatedText;
        if (isQuestion && this.activeTurn.alertEvent.type !== "DIRECT_QUESTION") {
          this.activeTurn.alertEvent.type = "DIRECT_QUESTION";
          this.activeTurn.alertEvent.explanation = "Direct question addressed to you.";
        }

        return {
          hasEvent: true,
          event: this.activeTurn.alertEvent,
          turnAction: "UPDATE_ALERT",
          turnId: this.activeTurn.id,
          accumulatedText: updatedText,
          isContinuation: true,
          speakerId: this.activeTurn.speakerId,
        };
      }

      // If active turn has NOT yet triggered an alert, check if this continuation mentions the user
      const mention = this.detectMention(updatedText, segment.sessionId, segment.id, now);
      if (mention.hasEvent && mention.event) {
        this.activeTurn.hasAlert = true;
        this.activeTurn.alertEvent = mention.event;
        this.recordAlertedSentence(cleanIncoming, now);

        return {
          hasEvent: true,
          event: mention.event,
          turnAction: "NEW_ALERT",
          turnId: this.activeTurn.id,
          accumulatedText: updatedText,
          isContinuation: true,
          speakerId: this.activeTurn.speakerId,
        };
      }

      return {
        hasEvent: false,
        turnAction: "CONTINUATION",
        turnId: this.activeTurn.id,
        accumulatedText: updatedText,
        isContinuation: true,
        speakerId: this.activeTurn.speakerId,
      };
    }

    // 2. NEW TURN / NEW MESSAGE (Pause > 2.2s, speaker change, or distinct sentence)
    if (this.activeTurn) {
      this.activeTurn.isCompleted = true;
    }

    const newTurn: SpeechTurn = {
      id: `turn_${now}_${Math.random().toString(36).substring(2, 6)}`,
      speakerId: speaker,
      accumulatedText: text,
      startTime: now,
      lastUpdateTime: now,
      hasAlert: false,
      isCompleted: false,
    };
    this.activeTurn = newTurn;

    const mention = this.detectMention(text, segment.sessionId, segment.id, now);
    if (mention.hasEvent && mention.event) {
      newTurn.hasAlert = true;
      newTurn.alertEvent = mention.event;
      const clean = text.toLowerCase().replace(/[^a-z0-9]/g, "");
      this.recordAlertedSentence(clean, now);

      return {
        hasEvent: true,
        event: mention.event,
        turnAction: "NEW_ALERT",
        turnId: newTurn.id,
        accumulatedText: text,
        isContinuation: false,
        speakerId: speaker,
      };
    }

    return {
      hasEvent: false,
      turnAction: "NEW_TURN",
      turnId: newTurn.id,
      accumulatedText: text,
      isContinuation: false,
      speakerId: speaker,
    };
  }

  private isContinuationOf(incomingText: string, currentTurn: SpeechTurn, now: number, speaker: string): boolean {
    if (currentTurn.isCompleted) return false;
    // Allow up to 2.4 seconds between interim chunks from the same speaker
    if (now - currentTurn.lastUpdateTime > 2400) return false;

    // Speaker check
    if (speaker !== "Speaker" && currentTurn.speakerId !== "Speaker" && speaker !== currentTurn.speakerId) {
      return false;
    }

    const cleanIncoming = incomingText.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanCurrent = currentTurn.accumulatedText.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (!cleanIncoming || !cleanCurrent) return false;

    // 1. One is a prefix or extension of the other (growing sentence)
    if (cleanIncoming.startsWith(cleanCurrent) || cleanCurrent.startsWith(cleanIncoming)) {
      return true;
    }

    // 2. Contains substring
    if (cleanIncoming.includes(cleanCurrent) || cleanCurrent.includes(cleanIncoming)) {
      return true;
    }

    // 3. Significant word overlap (handles live STT interim word replacements)
    const incomingWords = incomingText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const currentWords = currentTurn.accumulatedText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (incomingWords.length > 0 && currentWords.length > 0) {
      let common = 0;
      for (const w of incomingWords) {
        if (currentWords.includes(w)) common++;
      }
      const overlapRatio = common / Math.min(incomingWords.length, currentWords.length);
      if (overlapRatio >= 0.5) {
        return true;
      }
    }

    return false;
  }

  private detectMention(
    text: string,
    sessionId: string,
    segmentId: string,
    now: number
  ): { hasEvent: boolean; event?: MeetingEvent } {
    const lowerText = text.toLowerCase();

    // 1. Check Identifiers (Registration numbers, Roll numbers, IDs)
    for (const rawId of this.profile.identifiers) {
      if (!rawId || rawId.trim().length === 0) continue;
      const match = matchIdentifier(text, rawId);
      if (match.matched) {
        const isAttendance = this.checkAttendancePattern(lowerText);
        const isQuestion = !isAttendance && this.checkQuestionPattern(lowerText);
        const eventType: MeetingEventType = isAttendance
          ? "ATTENDANCE_CALL"
          : isQuestion
          ? "DIRECT_QUESTION"
          : "IDENTIFIER_MENTION";

        const event: MeetingEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          sessionId,
          type: eventType,
          transcriptExcerpt: text,
          evidenceSegmentIds: [segmentId],
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

    // 2. Check Display Name and Aliases - SORT LONGEST FIRST
    // Ensures specific names ("Tathagat", len 8) are evaluated before shorter substrings ("Aryan", len 5)
    const nameTargets = [this.profile.displayName, ...this.profile.aliases]
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
      .filter((val, idx, arr) => arr.indexOf(val) === idx)
      .sort((a, b) => b.length - a.length);

    for (const rawName of nameTargets) {
      const match = matchName(text, rawName);
      if (match.matched) {
        const isQuestion = this.checkQuestionPattern(lowerText);
        const eventType: MeetingEventType = isQuestion ? "DIRECT_QUESTION" : "NAME_MENTION";

        const event: MeetingEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          sessionId,
          type: eventType,
          transcriptExcerpt: text,
          evidenceSegmentIds: [segmentId],
          timestampMs: now,
          confidence: match.confidence,
          urgency: "high",
          explanation: isQuestion
            ? `Direct question addressed to ${rawName}.`
            : `Your name "${rawName}" was called.`,
        };

        return { hasEvent: true, event };
      }
    }

    return { hasEvent: false };
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
