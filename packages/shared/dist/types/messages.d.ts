import { SessionInfo } from "./session.js";
import { UserProfile } from "./profile.js";
import { TranscriptSegment } from "./transcript.js";
import { MeetingEvent } from "./events.js";
import { ContextBrief, MeetingContext } from "./context.js";
export type ExtensionMessage = {
    type: "GET_SESSION_STATE";
} | {
    type: "SESSION_STATE_CHANGED";
    payload: {
        session: SessionInfo;
        profile: UserProfile;
    };
} | {
    type: "MEETING_TAB_DETECTED";
    payload: {
        tabId: number;
        url: string;
    };
} | {
    type: "START_SESSION_REQUEST";
    payload: {
        tabId: number;
    };
} | {
    type: "STOP_SESSION_REQUEST";
} | {
    type: "PROFILE_UPDATED";
    payload: UserProfile;
} | {
    type: "OFFSCREEN_START_CAPTURE";
    payload: {
        streamId: string;
    };
} | {
    type: "OFFSCREEN_STOP_CAPTURE";
} | {
    type: "AUDIO_CHUNK_CAPTURED";
    payload: {
        chunkLength: number;
    };
} | {
    type: "AUDIO_LEVEL";
    payload: {
        level: number;
        packetsCaptured: number;
    };
} | {
    type: "SESSION_ERROR";
    payload: {
        message: string;
    };
};
export type ClientMessage = {
    type: "AUTH";
    sessionToken: string;
} | {
    type: "AUDIO_CHUNK";
    sequence: number;
    data: string;
} | {
    type: "CONTEXT_BRIEF_REQUEST";
    sinceMs?: number;
} | {
    type: "STOP";
};
export type ServerMessage = {
    type: "TRANSCRIPT_SEGMENT";
    segment: TranscriptSegment;
} | {
    type: "MEETING_EVENT";
    event: MeetingEvent;
} | {
    type: "CONTEXT_UPDATE";
    context: MeetingContext;
} | {
    type: "CONTEXT_BRIEF";
    brief: ContextBrief;
} | {
    type: "ERROR";
    code: string;
    message: string;
};
//# sourceMappingURL=messages.d.ts.map