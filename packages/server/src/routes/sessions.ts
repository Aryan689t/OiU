import { Router, Request, Response } from "express";
import { UserProfile, DEFAULT_PROFILE, ContextBrief } from "@oiu/shared";
import { ContextManager } from "../context/contextManager.js";

export interface ServerSession {
  sessionId: string;
  sessionToken: string;
  meetingPlatform: string;
  profile: UserProfile;
  createdAt: number;
  expiresAt: string;
  contextManager: ContextManager;
  isActive: boolean;
}

export const sessionsMap = new Map<string, ServerSession>();

export function createSessionsRouter(wsPort?: number): Router {
  const router = Router();

  // Create session
  router.post("/", (req: Request, res: Response) => {
    const { meetingPlatform = "google_meet", profile = DEFAULT_PROFILE } = req.body || {};

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sessionToken = `tok_${Math.random().toString(36).substring(2, 12)}`;
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8 hours

    const session: ServerSession = {
      sessionId,
      sessionToken,
      meetingPlatform,
      profile,
      createdAt: Date.now(),
      expiresAt,
      contextManager: new ContextManager(sessionId),
      isActive: true,
    };

    sessionsMap.set(sessionId, session);

    const port = wsPort || 3001;
    res.status(201).json({
      sessionId,
      sessionToken,
      realtimeUrl: `ws://localhost:${port}/realtime?token=${sessionToken}&sessionId=${sessionId}`,
      expiresAt,
    });
  });

  // Stop session
  router.post("/:sessionId/stop", (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const session = sessionsMap.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }
    session.isActive = false;
    res.status(200).json({ status: "stopped", sessionId });
  });

  // Get context brief
  router.post("/:sessionId/context-brief", (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { sinceMs, targetEvent } = req.body || {};

    const session = sessionsMap.get(sessionId);
    if (!session) {
      // Fallback context manager if session expired
      const fallbackManager = new ContextManager(sessionId);
      const brief = fallbackManager.generateBrief(sinceMs, targetEvent);
      return res.status(200).json(brief);
    }

    const brief = session.contextManager.generateBrief(sinceMs, targetEvent);
    res.status(200).json(brief);
  });

  // Get response suggestions
  router.post("/:sessionId/suggestions", (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { targetEvent } = req.body || {};

    const session = sessionsMap.get(sessionId);
    const manager = session ? session.contextManager : new ContextManager(sessionId);
    const brief = manager.generateBrief(undefined, targetEvent);

    res.status(200).json({
      suggestions: brief.responseSuggestions,
      confidence: brief.confidence,
    });
  });

  // Clear session data
  router.delete("/:sessionId", (req: Request, res: Response) => {
    const { sessionId } = req.params;
    sessionsMap.delete(sessionId);
    res.status(200).json({ status: "cleared", sessionId });
  });

  return router;
}

