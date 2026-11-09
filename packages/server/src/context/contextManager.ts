import {
  MeetingContext,
  ContextBrief,
  TranscriptSegment,
  MeetingEvent,
} from "@oiu/shared";

export class ContextManager {
  private sessionId: string;
  private segments: TranscriptSegment[] = [];
  private context: MeetingContext;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.context = {
      currentTopic: "General Discussion",
      summary: "Meeting in progress.",
      decisions: [],
      actionItems: [],
      unresolvedQuestions: [],
      lastUpdatedAt: Date.now(),
    };
  }

  public addSegment(segment: TranscriptSegment) {
    this.segments.push(segment);
    // Bounded window: keep last 100 segments
    if (this.segments.length > 100) {
      this.segments = this.segments.slice(-100);
    }
    this.updateContextFromRecent();
  }

  public getContext(): MeetingContext {
    return { ...this.context };
  }

  public generateBrief(sinceMs?: number, targetEvent?: MeetingEvent): ContextBrief {
    const relevantSegments = sinceMs
      ? this.segments.filter((s) => s.endMs >= sinceMs)
      : this.segments.slice(-10);

    const whatYouMissed = relevantSegments
      .slice(-5)
      .map((s) => `${s.speakerId || "Speaker"}: "${s.text}"`);

    const latestQuestion = targetEvent?.type === "DIRECT_QUESTION"
      ? targetEvent.transcriptExcerpt
      : this.detectLatestQuestion();

    // Grounded response suggestions without hallucinations
    const responseSuggestions: ContextBrief["responseSuggestions"] = [
      {
        label: "direct",
        text: latestQuestion
          ? "Yes, I'm here. Looking at that right now."
          : "Yes, present and listening.",
        evidenceSegmentIds: targetEvent?.evidenceSegmentIds || [],
      },
      {
        label: "professional",
        text: latestQuestion
          ? "Yes, could you please repeat the last part of that question?"
          : "Yes, apologies, I was momentarily reviewing the notes. Could you recap that last point?",
        evidenceSegmentIds: targetEvent?.evidenceSegmentIds || [],
      },
      {
        label: "clarification",
        text: "Could you clarify which specific item or slide you are referring to?",
        evidenceSegmentIds: targetEvent?.evidenceSegmentIds || [],
      },
    ];

    return {
      sinceMs,
      currentTopic: this.context.currentTopic || "Active Meeting",
      whatYouMissed: whatYouMissed.length > 0 ? whatYouMissed : ["Discussion ongoing."],
      questionForUser: latestQuestion,
      decisions: this.context.decisions.map((d) => d.text),
      relevantActionItems: this.context.actionItems.map((a) => a.task),
      responseSuggestions,
      confidence: 0.95,
    };
  }

  private updateContextFromRecent() {
    this.context.lastUpdatedAt = Date.now();
    const recentTexts = this.segments.slice(-5).map((s) => s.text);
    if (recentTexts.length > 0) {
      this.context.summary = recentTexts.join(" ");
    }
  }

  private detectLatestQuestion(): string | undefined {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const text = this.segments[i].text;
      if (text.includes("?") || /\b(can you|could you|are you)\b/i.test(text)) {
        return text;
      }
    }
    return undefined;
  }
}

