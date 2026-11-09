export type SessionState =
  | "INACTIVE"
  | "SUPPORTED_TAB_READY"
  | "PERMISSION_REQUIRED"
  | "CONNECTING"
  | "LISTENING"
  | "DEGRADED"
  | "STOPPING"
  | "STOPPED"
  | "ERROR";

export interface SessionInfo {
  sessionId: string;
  tabId: number;
  meetingPlatform: "google_meet";
  state: SessionState;
  startedAt?: number;
  errorMessage?: string;
}

