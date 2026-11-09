import { WebSocketServer } from "ws";
import { sessionsMap } from "../routes/sessions.js";
export function setupRealtimeGateway(server) {
    const wss = new WebSocketServer({ server, path: "/realtime" });
    wss.on("connection", (ws, req) => {
        console.log("[OiU Gateway] New WebSocket client connected.");
        // Extract query params if provided in URL
        const url = new URL(req.url || "", `http://${req.headers.host}`);
        const querySessionId = url.searchParams.get("sessionId");
        const queryToken = url.searchParams.get("token");
        let currentSessionId = querySessionId || "";
        let isAuthenticated = false;
        if (querySessionId && queryToken) {
            const session = sessionsMap.get(querySessionId);
            if (session && session.sessionToken === queryToken) {
                isAuthenticated = true;
                console.log(`[OiU Gateway] Client authenticated via URL params for session: ${currentSessionId}`);
            }
        }
        ws.on("message", (data) => {
            try {
                const message = JSON.parse(data.toString());
                switch (message.type) {
                    case "AUTH": {
                        const foundSession = Array.from(sessionsMap.values()).find((s) => s.sessionToken === message.sessionToken);
                        if (foundSession) {
                            isAuthenticated = true;
                            currentSessionId = foundSession.sessionId;
                            console.log(`[OiU Gateway] Socket authenticated for session: ${currentSessionId}`);
                        }
                        else {
                            const errorMsg = {
                                type: "ERROR",
                                code: "AUTH_FAILED",
                                message: "Invalid session token.",
                            };
                            ws.send(JSON.stringify(errorMsg));
                        }
                        break;
                    }
                    case "AUDIO_CHUNK": {
                        if (!isAuthenticated)
                            return;
                        // Audio packet received - acknowledged
                        break;
                    }
                    case "CONTEXT_BRIEF_REQUEST": {
                        const session = sessionsMap.get(currentSessionId);
                        if (session) {
                            const brief = session.contextManager.generateBrief(message.sinceMs);
                            const response = {
                                type: "CONTEXT_BRIEF",
                                brief,
                            };
                            ws.send(JSON.stringify(response));
                        }
                        break;
                    }
                    case "STOP": {
                        console.log(`[OiU Gateway] Stop requested via socket for: ${currentSessionId}`);
                        const session = sessionsMap.get(currentSessionId);
                        if (session)
                            session.isActive = false;
                        break;
                    }
                }
            }
            catch (err) {
                // Binary audio or malformed JSON
            }
        });
        ws.on("close", () => {
            console.log(`[OiU Gateway] Client socket closed: ${currentSessionId}`);
        });
    });
    return wss;
}
