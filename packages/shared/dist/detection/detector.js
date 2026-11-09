import { matchName, matchIdentifier } from "./matcher.js";
import { getDialogueAnalysis, } from "./sentenceParser.js";
export class EventDetector {
    profile;
    activeTurn = null;
    alertedSentenceHashes = new Map();
    constructor(profile, _legacyCooldownMs = 0) {
        this.profile = profile;
    }
    updateProfile(profile) {
        this.profile = profile;
    }
    resetHistory() {
        this.activeTurn = null;
        this.alertedSentenceHashes.clear();
    }
    exportAlertedHashes() {
        return Array.from(this.alertedSentenceHashes.entries());
    }
    importAlertedHashes(entries) {
        const now = Date.now();
        for (const [hash, timestamp] of entries) {
            if (now - timestamp < 30000) {
                this.alertedSentenceHashes.set(hash, timestamp);
            }
        }
    }
    processSegment(segment) {
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
        const activeMention = this.detectMention(activeSentence.text, segment.sessionId, segment.id, now);
        // 1. Check if this is a streaming continuation of the active turn
        if (this.activeTurn && this.isContinuationOf(text, this.activeTurn, now, speaker)) {
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
            const updatedMention = this.detectMention(updatedActiveSentence.text, segment.sessionId, segment.id, now);
            // If active turn already triggered an alert:
            if (this.activeTurn.hasAlert && this.activeTurn.alertEvent) {
                // If the active sentence is a NEW, distinct question addressed to the user (e.g. "What is photosynthesis?"):
                if (updatedDialogue.sentences.length > 1 &&
                    updatedActiveSentence.relation === "disconnected" &&
                    updatedActiveSentence.isQuestion &&
                    updatedMention.hasEvent &&
                    updatedMention.event) {
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
                // If the sentence is growing within the single turn OR is a connected follow-up (e.g. "tatha explain its function"):
                if (updatedActiveSentence.relation === "connected" || updatedDialogue.sentences.length <= 1) {
                    const lowerText = updatedActiveSentence.text.toLowerCase();
                    const isQuestion = this.checkQuestionPattern(lowerText);
                    // Update alert excerpt cleanly (only the question + connected follow-up, NOT 500 chars!)
                    if (updatedDialogue.sentences.length <= 1) {
                        this.activeTurn.alertEvent.transcriptExcerpt = updatedActiveSentence.text;
                    }
                    else {
                        const prevExcerpt = this.activeTurn.alertEvent.transcriptExcerpt;
                        if (!prevExcerpt.includes(updatedActiveSentence.text)) {
                            this.activeTurn.alertEvent.transcriptExcerpt = `${prevExcerpt} ${updatedActiveSentence.text}`.trim();
                        }
                    }
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
        const newTurn = {
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
    isContinuationOf(incomingText, currentTurn, now, speaker) {
        if (currentTurn.isCompleted)
            return false;
        // Hard ceiling: A single spoken utterance continuation cannot span more than 3.5 seconds
        if (now - currentTurn.startTime > 3500)
            return false;
        // Pause limit: If speaker stopped talking for > 1600ms, sentence is completed
        if (now - currentTurn.lastUpdateTime > 1600)
            return false;
        // Speaker check (coalesce generic or voice engine speaker tags if text is continuous)
        const isVoiceOrGeneric = speaker === "Speaker" ||
            currentTurn.speakerId === "Speaker" ||
            speaker === "Live Voice" ||
            currentTurn.speakerId === "Live Voice";
        if (!isVoiceOrGeneric && speaker !== currentTurn.speakerId) {
            return false;
        }
        const cleanIncoming = incomingText.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanCurrent = currentTurn.accumulatedText.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!cleanIncoming || !cleanCurrent)
            return false;
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
                if (currentWords.includes(w))
                    common++;
            }
            const overlapRatio = common / Math.min(incomingWords.length, currentWords.length);
            if (overlapRatio >= 0.6) {
                return true;
            }
        }
        return false;
    }
    detectMention(text, sessionId, segmentId, now) {
        const lowerText = text.toLowerCase();
        // 1. Check Identifiers (Registration numbers, Roll numbers, IDs)
        for (const rawId of this.profile.identifiers) {
            if (!rawId || rawId.trim().length === 0)
                continue;
            const match = matchIdentifier(text, rawId);
            if (match.matched) {
                const isAttendance = this.checkAttendancePattern(lowerText);
                const isQuestion = !isAttendance && this.checkQuestionPattern(lowerText);
                const eventType = isAttendance
                    ? "ATTENDANCE_CALL"
                    : isQuestion
                        ? "DIRECT_QUESTION"
                        : "IDENTIFIER_MENTION";
                const event = {
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
                const eventType = isQuestion ? "DIRECT_QUESTION" : "NAME_MENTION";
                const event = {
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
        // 3. Check User-Configured Keywords / Monitored Topics
        if (this.profile.keywords && this.profile.keywords.length > 0) {
            for (const kw of this.profile.keywords) {
                if (!kw || kw.trim().length === 0)
                    continue;
                const cleanKw = kw.trim().toLowerCase();
                if (cleanKw.length >= 2 && lowerText.includes(cleanKw)) {
                    const isQuestion = this.checkQuestionPattern(lowerText);
                    const eventType = isQuestion ? "DIRECT_QUESTION" : "KEYWORD_MENTION";
                    const event = {
                        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                        sessionId,
                        type: eventType,
                        transcriptExcerpt: text,
                        evidenceSegmentIds: [segmentId],
                        timestampMs: now,
                        confidence: 0.95,
                        urgency: isQuestion ? "high" : "medium",
                        explanation: isQuestion
                            ? `Question regarding your keyword "${kw.trim()}".`
                            : `Your monitored keyword "${kw.trim()}" was mentioned.`,
                    };
                    return { hasEvent: true, event };
                }
            }
        }
        return { hasEvent: false };
    }
    checkQuestionPattern(lowerText) {
        if (lowerText.includes("?"))
            return true;
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
    checkAttendancePattern(lowerText) {
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
