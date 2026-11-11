import { UserProfile } from "../types/profile.js";
import { TranscriptSegment } from "../types/transcript.js";
import { MeetingEvent, MeetingEventType } from "../types/events.js";
import {
  matchIdentifier,
  CompiledTarget,
  compileTarget,
  prepareCaptionText,
  matchCompiledTarget,
} from "./matcher.js";
import {
  parseSentenceStream,
  getDialogueAnalysis,
  ParsedSentence,
  DialogueAnalysis,
} from "./sentenceParser.js";

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

export class EventDetector {
  private profile: UserProfile;
  private activeTurn: SpeechTurn | null = null;
  private alertedSentenceHashes = new Map<string, number>();
  private compiledNames: CompiledTarget[] = [];
  private compiledKeywords: CompiledTarget[] = [];

  constructor(profile: UserProfile, _legacyCooldownMs = 0) {
    this.profile = profile;
    this.compileProfileTargets();
  }

  private compileProfileTargets() {
    // Pre-generate spelling/phonetic/STT variants once on profile load or update (longest-first for specificity)
    const rawNames = [this.profile.displayName, ...(this.profile.aliases || [])]
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
      .filter((val, idx, arr) => arr.indexOf(val) === idx)
      .sort((a, b) => b.length - a.length);

    this.compiledNames = rawNames
      .map((n) => compileTarget(n))
      .filter((c): c is CompiledTarget => c !== null);

    const rawKeywords = (this.profile.keywords || [])
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
      .filter((val, idx, arr) => arr.indexOf(val) === idx)
      .sort((a, b) => b.length - a.length);

    this.compiledKeywords = rawKeywords
      .map((k) => compileTarget(k))
      .filter((c): c is CompiledTarget => c !== null);
  }

  public updateProfile(profile: UserProfile) {
    this.profile = profile;
    this.alertedSentenceHashes.clear();
    this.compileProfileTargets();
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

    const dialogueAnalysis = getDialogueAnalysis(text, this.profile, now, speaker);
    const sentences = dialogueAnalysis.sentences;
    const activeSentence = dialogueAnalysis.activeSentence;

    // Check if the ACTIVE / CURRENT sentence being spoken right now mentions the user
    // CRITICAL: We only test activeSentence, NEVER preceding completed sentences from minutes ago!
    const activeMention = this.detectMention(
      activeSentence.text,
      segment.sessionId,
      segment.id,
      now
    );

    // Check if the current active turn has exceeded the 7-second time limit
    if (this.activeTurn && now - this.activeTurn.startTime >= 7000) {
      this.activeTurn.isCompleted = true;
    }

    // 1. Check if this is a streaming continuation of the active turn (strictly within 7 seconds)
    if (this.activeTurn && !this.activeTurn.isCompleted && this.isContinuationOf(text, this.activeTurn, now, speaker)) {
      const cleanIncoming = text.toLowerCase().replace(/[^a-z0-9]/g, "");
      const cleanCurrent = this.activeTurn.accumulatedText.toLowerCase().replace(/[^a-z0-9]/g, "");

      // 1a. Exact duplicate poll check
      if (cleanIncoming === cleanCurrent) {
        return {
          hasEvent: false,
          turnAction: "NO_OP",
          turnId: this.activeTurn.id,
          accumulatedText: this.activeTurn.accumulatedText,
          isContinuation: true,
          speakerId: this.activeTurn.speakerId,
          sentences,
          activeSentence,
          dialogueAnalysis,
        };
      }

      // Sentence grew within the current turn
      const updatedText = text.length >= this.activeTurn.accumulatedText.length ? text : this.activeTurn.accumulatedText;
      this.activeTurn.accumulatedText = updatedText;
      this.activeTurn.lastUpdateTime = now;

      const updatedDialogue = getDialogueAnalysis(updatedText, this.profile, now, speaker);
      const updatedActiveSentence = updatedDialogue.activeSentence;

      // Re-evaluate mention on the updated active sentence
      const updatedMention = this.detectMention(
        updatedActiveSentence.text,
        segment.sessionId,
        segment.id,
        now
      );

      // If active turn already triggered an alert:
      if (this.activeTurn.hasAlert && this.activeTurn.alertEvent) {
        const currentAlert = this.activeTurn.alertEvent;
        const newEvent = updatedMention.event;

        // Check if a new trigger occurred:
        // 1. Different event type (e.g. from IDENTIFIER_MENTION to KEYWORD_MENTION or ATTENDANCE_CALL)
        // 2. Different target explanation (e.g. from ID "117" to Keyword "Attendance")
        // 3. New question addressed to user
        const isDifferentType = Boolean(newEvent && newEvent.type !== currentAlert.type);
        const isDifferentTarget = Boolean(newEvent && newEvent.explanation !== currentAlert.explanation);
        const isNewQuestion = Boolean(
          updatedDialogue.sentences.length > 1 &&
          updatedActiveSentence.isQuestion &&
          updatedActiveSentence.relation === "disconnected"
        );

        if (updatedMention.hasEvent && newEvent && (isDifferentType || isDifferentTarget || isNewQuestion)) {
          this.activeTurn.alertEvent = newEvent;

          return {
            hasEvent: true,
            event: newEvent,
            turnAction: "NEW_ALERT",
            turnId: this.activeTurn.id,
            accumulatedText: updatedText,
            isContinuation: true,
            speakerId: this.activeTurn.speakerId,
            sentences: updatedDialogue.sentences,
            activeSentence: updatedActiveSentence,
            dialogueAnalysis: updatedDialogue,
          };
        }

        // If the sentence is growing within the single turn OR is a connected follow-up (e.g. "tatha explain its function"):
        if (updatedActiveSentence.relation === "connected" || updatedDialogue.sentences.length <= 1) {
          const lowerText = updatedActiveSentence.text.toLowerCase();
          const isQuestion = this.checkQuestionPattern(lowerText);

          // Update alert excerpt cleanly to focus on the active sentence / core question (never append past questions)
          this.activeTurn.alertEvent.transcriptExcerpt = updatedDialogue.coreFocusText || updatedActiveSentence.text;

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
            sentences: updatedDialogue.sentences,
            activeSentence: updatedActiveSentence,
            dialogueAnalysis: updatedDialogue,
          };
        }

        // If the active sentence is disconnected and has NO mention (speaker moved on to someone else or other topic)
        if (updatedActiveSentence.relation === "disconnected" && !updatedMention.hasEvent) {
          this.activeTurn.isCompleted = true;
          return {
            hasEvent: false,
            turnAction: "CONTINUATION",
            turnId: this.activeTurn.id,
            accumulatedText: updatedText,
            isContinuation: true,
            speakerId: this.activeTurn.speakerId,
            sentences: updatedDialogue.sentences,
            activeSentence: updatedActiveSentence,
            dialogueAnalysis: updatedDialogue,
          };
        }
      }

      // Active turn had not yet alerted, but the active sentence now mentions the user
      if (updatedMention.hasEvent && updatedMention.event) {
        this.activeTurn.hasAlert = true;
        this.activeTurn.alertEvent = updatedMention.event;

        return {
          hasEvent: true,
          event: updatedMention.event,
          turnAction: "NEW_ALERT",
          turnId: this.activeTurn.id,
          accumulatedText: updatedText,
          isContinuation: true,
          speakerId: this.activeTurn.speakerId,
          sentences: updatedDialogue.sentences,
          activeSentence: updatedActiveSentence,
          dialogueAnalysis: updatedDialogue,
        };
      }

      return {
        hasEvent: false,
        turnAction: "CONTINUATION",
        turnId: this.activeTurn.id,
        accumulatedText: updatedText,
        isContinuation: true,
        speakerId: this.activeTurn.speakerId,
        sentences: updatedDialogue.sentences,
        activeSentence: updatedActiveSentence,
        dialogueAnalysis: updatedDialogue,
      };
    }

    // 2. NEW TURN / NEW MESSAGE (Pause > 1.6s, max duration > 3.5s, or speaker change)
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

    // In a new turn, ONLY trigger an alert if the ACTIVE sentence mentions the user!
    if (activeMention.hasEvent && activeMention.event) {
      newTurn.hasAlert = true;
      newTurn.alertEvent = activeMention.event;

      return {
        hasEvent: true,
        event: activeMention.event,
        turnAction: "NEW_ALERT",
        turnId: newTurn.id,
        accumulatedText: text,
        isContinuation: false,
        speakerId: speaker,
        sentences,
        activeSentence,
        dialogueAnalysis,
      };
    }

    return {
      hasEvent: false,
      turnAction: "NEW_TURN",
      turnId: newTurn.id,
      accumulatedText: text,
      isContinuation: false,
      speakerId: speaker,
      sentences,
      activeSentence,
      dialogueAnalysis,
    };
  }

  private isContinuationOf(incomingText: string, currentTurn: SpeechTurn, now: number, speaker: string): boolean {
    if (currentTurn.isCompleted) return false;

    // Hard ceiling: User 7-second rule - a single spoken utterance continuation cannot span >= 7000ms
    if (now - currentTurn.startTime >= 7000) return false;

    // Pause limit: If speaker stopped talking for > 1800ms, sentence is completed
    if (now - currentTurn.lastUpdateTime > 1800) return false;

    // Speaker check (coalesce generic or voice engine speaker tags if text is continuous)
    const isVoiceOrGeneric =
      speaker === "Speaker" ||
      currentTurn.speakerId === "Speaker" ||
      speaker === "Live Voice" ||
      currentTurn.speakerId === "Live Voice";
    if (!isVoiceOrGeneric && speaker !== currentTurn.speakerId) {
      return false;
    }

    const cleanIncoming = incomingText.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanCurrent = currentTurn.accumulatedText.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (!cleanIncoming || !cleanCurrent) return false;

    // 1. Growing sentence: incoming starts with current or vice versa
    if (cleanIncoming.startsWith(cleanCurrent) || cleanCurrent.startsWith(cleanIncoming)) {
      return true;
    }

    // 2. Substring containment within the 3.5s window
    if (cleanIncoming.includes(cleanCurrent) || cleanCurrent.includes(cleanIncoming)) {
      return true;
    }

    // 3. Significant word overlap (handles STT interim adjustments)
    const incomingWords = incomingText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const currentWords = currentTurn.accumulatedText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (incomingWords.length > 0 && currentWords.length > 0) {
      let common = 0;
      for (const w of incomingWords) {
        if (currentWords.includes(w)) common++;
      }
      const overlapRatio = common / Math.min(incomingWords.length, currentWords.length);
      if (overlapRatio >= 0.6) {
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

    // 2. Check Display Name and Aliases (pre-compiled with spelling/phonetic variants, longest-first)
    const prepared = prepareCaptionText(text);

    for (const compiledName of this.compiledNames) {
      const match = matchCompiledTarget(prepared, compiledName);
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
            ? `Direct question addressed to ${compiledName.raw}.`
            : `Your name "${compiledName.raw}" was called.`,
        };

        return { hasEvent: true, event };
      }
    }

    // 3. Check User-Configured Keywords / Monitored Topics (pre-compiled with spelling/phonetic variants)
    for (const compiledKw of this.compiledKeywords) {
      const match = matchCompiledTarget(prepared, compiledKw);
      if (match.matched) {
        const isQuestion = this.checkQuestionPattern(lowerText);
        const isAttendance =
          compiledKw.variants.has("attendance") ||
          compiledKw.targetLower.includes("attend") ||
          compiledKw.targetLower.includes("present") ||
          this.checkAttendancePattern(lowerText);
        const eventType: MeetingEventType = isAttendance
          ? "ATTENDANCE_CALL"
          : isQuestion
          ? "DIRECT_QUESTION"
          : "KEYWORD_MENTION";

        const event: MeetingEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          sessionId,
          type: eventType,
          transcriptExcerpt: text,
          evidenceSegmentIds: [segmentId],
          timestampMs: now,
          confidence: match.confidence,
          urgency: isQuestion || isAttendance ? "high" : "medium",
          explanation: isAttendance
            ? `Attendance call detected for keyword "${compiledKw.raw}".`
            : isQuestion
            ? `Question regarding your keyword "${compiledKw.raw}".`
            : `Your monitored keyword "${compiledKw.raw}" was mentioned.`,
        };

        return { hasEvent: true, event };
      }
    }

    return { hasEvent: false };
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
