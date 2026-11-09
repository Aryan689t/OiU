export type MeetingEventType =
  | "NAME_MENTION"
  | "IDENTIFIER_MENTION"
  | "DIRECT_QUESTION"
  | "ATTENDANCE_CALL"
  | "ACTION_ITEM"
  | "IMPORTANT_CONTEXT";

export interface MeetingEvent {
  id: string;
  sessionId: string;
  type: MeetingEventType;
  transcriptExcerpt: string;
  evidenceSegmentIds: string[];
  timestampMs: number;
  confidence: number; // 0..1
  urgency: "low" | "medium" | "high";
  explanation?: string;
}

