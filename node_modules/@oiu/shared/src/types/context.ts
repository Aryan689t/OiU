export interface MeetingContext {
  currentTopic?: string;
  summary: string;
  decisions: Array<{ text: string; evidenceSegmentIds: string[] }>;
  actionItems: Array<{
    owner?: string;
    task: string;
    dueDate?: string;
    evidenceSegmentIds: string[];
  }>;
  unresolvedQuestions: Array<{ text: string; evidenceSegmentIds: string[] }>;
  lastUpdatedAt: number;
}

export interface ContextBrief {
  sinceMs?: number;
  currentTopic: string;
  whatYouMissed: string[];
  questionForUser?: string;
  decisions: string[];
  relevantActionItems: string[];
  responseSuggestions: Array<{
    label: "direct" | "professional" | "clarification";
    text: string;
    evidenceSegmentIds: string[];
  }>;
  confidence: number;
}

