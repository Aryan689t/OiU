import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  SessionInfo,
  UserProfile,
  DEFAULT_PROFILE,
  formatCommaSeparatedList,
  parseCommaSeparatedList,
  validateProfile,
  TranscriptSegment,
  MeetingEvent,
  EventDetector,
  DialogueAnalysis,
} from "@oiu/shared";
import {
  extractCoreCalloutOrQuestion,
  generateSmartResponses,
  getInstantSmartResponses,
  SuggestedResponse,
} from "../services/aiService.js";
import { THEME } from "./theme";
import {
  OiULogoMark,
  SettingsIcon,
  WaveformSmallIcon,
  ChevronRightIcon,
  EditPencilIcon,
  UserIcon,
  HashIcon,
  TagIcon,
  MicrophoneIcon,
  StopSquareIcon,
  MessageSquareIcon,
  RefreshIcon,
  ZapIcon,
} from "./icons";
import { AudioWaveform } from "./AudioWaveform";
import { DetectionCard } from "./DetectionCard";
import { SettingsView } from "./SettingsView";
import { HistoryView } from "./HistoryView";
import { TranscriptView } from "./TranscriptView";

const PROFILE_STORAGE_KEY = "oiu_user_profile";
const ALERTED_HASHES_STORAGE_KEY = "oiu_alerted_hashes";
const GEMINI_API_KEY_STORAGE = "oiu_gemini_api_key";

let currentAudioCtx: AudioContext | null = null;

function stopAlertSound() {
  if (currentAudioCtx) {
    try {
      currentAudioCtx.close();
    } catch {}
    currentAudioCtx = null;
  }
}

function playAlertChime() {
  stopAlertSound();
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    currentAudioCtx = ctx;
    const now = ctx.currentTime;

    // First tone (E5 - 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.28, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.2);

    // Second tone (A5 - 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.32, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.35);

    setTimeout(() => {
      if (currentAudioCtx === ctx) {
        try { ctx.close(); } catch {}
        currentAudioCtx = null;
      }
    }, 400);
  } catch (err) {
    console.warn("[OiU] Chime playback note:", err);
  }
}

type ViewMode = "main" | "settings" | "history" | "transcript";

export const SidepanelApp: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>("main");

  const [session, setSession] = useState<SessionInfo>({
    sessionId: "",
    tabId: -1,
    meetingPlatform: "google_meet",
    state: "INACTIVE",
  });

  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isCheckingTab, setIsCheckingTab] = useState(false);

  // Audio & Alert State
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [activeAlert, setActiveAlert] = useState<MeetingEvent | null>(null);
  const [alertsHistory, setAlertsHistory] = useState<MeetingEvent[]>([]);
  const [copiedSuggestionIdx, setCopiedSuggestionIdx] = useState<number | null>(null);
  const [lastSpeechTime, setLastSpeechTime] = useState<number>(0);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [liveDialogue, setLiveDialogue] = useState<DialogueAnalysis | null>(null);

  // Gemini AI Key & Smart Responses State
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiResponsesMap, setAiResponsesMap] = useState<Record<string, SuggestedResponse[]>>({});
  const [currentAlertIndex, setCurrentAlertIndex] = useState<number>(0);

  // Live session clock string (e.g. "08:37 PM")
  const [currentTimeString, setCurrentTimeString] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
  const [captionKickstartFeedback, setCaptionKickstartFeedback] = useState(false);

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTimeString(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 10000);
    return () => clearInterval(clockTimer);
  }, []);

  const geminiApiKeyRef = useRef(geminiApiKey);
  geminiApiKeyRef.current = geminiApiKey;

  const transcriptsRef = useRef(transcripts);
  transcriptsRef.current = transcripts;

  const profileRef = useRef<UserProfile>(profile);
  profileRef.current = profile;

  const sessionRef = useRef<SessionInfo>(session);
  sessionRef.current = session;

  const detectorRef = useRef<EventDetector>(new EventDetector(profile));

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVoiceActive(Date.now() - lastSpeechTime < 2500);
    }, 300);
    return () => clearInterval(interval);
  }, [lastSpeechTime]);

  const handleCopySuggestion = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSuggestionIdx(index);
      setTimeout(() => setCopiedSuggestionIdx(null), 2000);
    }).catch(() => {});
  };

  const triggerAlert = useCallback((event: MeetingEvent) => {
    console.log("[OiU Alert Triggered]", event);
    setActiveAlert(event);
    setCurrentAlertIndex(0);
    setAlertsHistory((prev) => [event, ...prev.slice(0, 9)]);
    playAlertChime();

    // 0ms instant smart grounded responses populated immediately
    const instantAnswers = getInstantSmartResponses(event, profileRef.current);
    setAiResponsesMap((prev) => ({ ...prev, [event.id]: instantAnswers }));

    // Persist alerted sentence hashes across sidepanel open/close
    if (detectorRef.current) {
      const exported = detectorRef.current.exportAlertedHashes();
      chrome.storage.local.set({ [ALERTED_HASHES_STORAGE_KEY]: exported });
    }

    // Automatically generate intelligent AI responses (Gemini Flash or grounded topic fallback)
    setIsGeneratingAi(true);
    const recentCtx = transcriptsRef.current.slice(-6).map((t) => `${t.speakerId || "Speaker"}: ${t.text}`).join("\n");
    generateSmartResponses(event, profileRef.current, geminiApiKeyRef.current, recentCtx)
      .then((responses) => {
        setAiResponsesMap((prev) => ({ ...prev, [event.id]: responses }));
      })
      .catch(() => {})
      .finally(() => {
        setIsGeneratingAi(false);
      });

    try {
      if (chrome.notifications) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL("icon.png"),
          title: "🚨 OiU Attention Alert!",
          message: `${event.explanation}\n"${event.transcriptExcerpt}"`,
          priority: 2,
        });
      }
    } catch (e) {
      console.warn("Notification error:", e);
    }
  }, []);

  const updateActiveAlert = useCallback((event: MeetingEvent) => {
    setActiveAlert((prev) => {
      if (!prev) return event;
      return {
        ...prev,
        type: event.type,
        transcriptExcerpt: event.transcriptExcerpt,
        explanation: event.explanation,
      };
    });

    setAlertsHistory((prev) => {
      if (prev.length === 0) return [event];
      const copy = [...prev];
      copy[0] = {
        ...copy[0],
        type: event.type,
        transcriptExcerpt: event.transcriptExcerpt,
        explanation: event.explanation,
      };
      return copy;
    });

    // Re-evaluate 0ms smart response for updated excerpt
    const updatedResponses = getInstantSmartResponses(event, profileRef.current);
    setAiResponsesMap((prev) => ({ ...prev, [event.id]: updatedResponses }));

    // If Gemini API Key is active, refine AI response for full updated question
    if (geminiApiKeyRef.current) {
      const recentCtx = transcriptsRef.current.slice(-4).map((t) => `${t.speakerId || "Speaker"}: ${t.text}`).join("\n");
      generateSmartResponses(event, profileRef.current, geminiApiKeyRef.current, recentCtx)
        .then((responses) => {
          setAiResponsesMap((prev) => ({ ...prev, [event.id]: responses }));
        })
        .catch(() => {});
    }
  }, []);

  // Auto-finalize speech turns when speaker pauses > 2.2 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTranscripts((prev) => {
        let changed = false;
        const updated = prev.map((seg) => {
          if (!seg.isFinal && now - seg.endMs > 2200) {
            changed = true;
            return { ...seg, isFinal: true };
          }
          return seg;
        });
        return changed ? updated : prev;
      });
    }, 800);
    return () => clearInterval(timer);
  }, []);

  const fetchSessionState = useCallback(() => {
    setIsCheckingTab(true);
    chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" }, (response) => {
      setIsCheckingTab(false);
      if (chrome.runtime.lastError) return;
      if (response?.session) setSession(response.session);
    });
  }, []);

  // Sync state ONCE on mount
  useEffect(() => {
    // 1. Load saved profile, previous alerted hashes, and Gemini API key
    chrome.storage.local.get([PROFILE_STORAGE_KEY, ALERTED_HASHES_STORAGE_KEY, GEMINI_API_KEY_STORAGE], (res) => {
      if (res?.[PROFILE_STORAGE_KEY]) {
        const saved = res[PROFILE_STORAGE_KEY] as UserProfile;
        setProfile(saved);
        detectorRef.current.updateProfile(saved);
      } else {
        // If first run, open settings
        setCurrentView("settings");
      }

      if (res?.[ALERTED_HASHES_STORAGE_KEY] && Array.isArray(res[ALERTED_HASHES_STORAGE_KEY])) {
        detectorRef.current.importAlertedHashes(res[ALERTED_HASHES_STORAGE_KEY]);
      }

      if (res?.[GEMINI_API_KEY_STORAGE]) {
        setGeminiApiKey(res[GEMINI_API_KEY_STORAGE]);
      }
    });

    // 2. Fetch session state
    chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.session) setSession(response.session);
    });

    // 3. Attach runtime message listener
    const messageListener = (msg: any) => {
      if (!msg || !msg.type) return;

      if (msg.type === "SESSION_STATE_CHANGED" && msg.payload?.session) {
        setSession(msg.payload.session);
      } else if (msg.type === "AUDIO_LEVEL" && msg.payload) {
        const lvl = typeof msg.payload.level === "number" ? msg.payload.level : 0;
        setAudioLevel(lvl);
        if (lvl > 0.04) {
          setIsVoiceActive(true);
          setLastSpeechTime(Date.now());
        }
      } else if (msg.type === "TRANSCRIPT_SEGMENT" && msg.segment) {
        const result = detectorRef.current.processSegment(msg.segment);

        if (result.dialogueAnalysis) {
          setLiveDialogue(result.dialogueAnalysis);
        }

        if (result.turnAction === "NO_OP") {
          return;
        }

        const now = Date.now();
        setLastSpeechTime(now);
        setIsVoiceActive(true);

        // Update transcripts with Turn-based streaming, deduplication, and distinct turns
        setTranscripts((prev) => {
          const incomingText = (result.accumulatedText || msg.segment.text || "").trim();
          if (!incomingText) return prev;

          if (prev.length > 0) {
            const copy = [...prev];
            const last = { ...copy[copy.length - 1] };
            const cleanNew = incomingText.toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanLast = last.text.toLowerCase().replace(/[^a-z0-9]/g, "");

            // 1. Exact or near duplicate check (drop or update in place within 3.5s)
            if (
              cleanNew === cleanLast ||
              (cleanLast.length > 0 &&
                Math.abs(now - last.endMs) < 3500 &&
                (cleanNew.startsWith(cleanLast) || cleanLast.startsWith(cleanNew)))
            ) {
              last.text = incomingText.length >= last.text.length ? incomingText : last.text;
              last.endMs = now;
              if (last.speakerId === "Speaker" || last.speakerId === "Live Voice") {
                last.speakerId = result.speakerId || last.speakerId;
              }
              copy[copy.length - 1] = last;
              return copy;
            }

            // 2. Normal turn continuation
            if (result.isContinuation && (last.id === result.turnId || Math.abs(now - last.endMs) < 3000)) {
              last.text = incomingText;
              last.endMs = now;
              last.isFinal = false;
              copy[copy.length - 1] = last;
              return copy;
            }
          }

          // 3. Genuine New Turn
          const copy = prev.map((t) => ({ ...t, isFinal: true }));
          const newSeg: TranscriptSegment = {
            id: result.turnId,
            sessionId: msg.segment.sessionId || "meet_call",
            text: incomingText,
            speakerId: result.speakerId || msg.segment.speakerId || "Speaker",
            startMs: now,
            endMs: now,
            isFinal: false,
            confidence: 0.98,
          };
          return [...copy.slice(-40), newSeg];
        });

        // Trigger or update alert based on TurnAction
        if (result.turnAction === "NEW_ALERT" && result.event) {
          console.log("[OiU Mention Detected!]:", result.event);
          triggerAlert(result.event);
        } else if (result.turnAction === "UPDATE_ALERT" && result.event) {
          console.log("[OiU Alert Excerpt Updated]:", result.event.transcriptExcerpt);
          updateActiveAlert(result.event);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [triggerAlert, updateActiveAlert]);

  const handleSaveProfile = (newProfile: UserProfile) => {
    chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: newProfile }, () => {
      setProfile(newProfile);
      detectorRef.current.updateProfile(newProfile);
      chrome.runtime.sendMessage({
        type: "PROFILE_UPDATED",
        payload: newProfile,
      }).catch(() => {});
    });
  };

  const handleSaveApiKey = (key: string) => {
    chrome.storage.local.set({ [GEMINI_API_KEY_STORAGE]: key }, () => {
      setGeminiApiKey(key);
      if (activeAlert) {
        setIsGeneratingAi(true);
        const recentCtx = transcripts.slice(-6).map((t) => `${t.speakerId || "Speaker"}: ${t.text}`).join("\n");
        generateSmartResponses(activeAlert, profile, key, recentCtx)
          .then((responses) => {
            setAiResponsesMap((prev) => ({ ...prev, [activeAlert.id]: responses }));
          })
          .catch(() => {})
          .finally(() => setIsGeneratingAi(false));
      }
    });
  };

  const handleRegenerateAi = (eventToRegen: MeetingEvent) => {
    setIsGeneratingAi(true);
    const recentCtx = transcripts.slice(-6).map((t) => `${t.speakerId || "Speaker"}: ${t.text}`).join("\n");
    generateSmartResponses(eventToRegen, profile, geminiApiKey, recentCtx)
      .then((responses) => {
        setAiResponsesMap((prev) => ({ ...prev, [eventToRegen.id]: responses }));
      })
      .catch(() => {})
      .finally(() => setIsGeneratingAi(false));
  };

  const handleStartListening = () => {
    if (!profile.displayName) {
      setCurrentView("settings");
      return;
    }

    setSession((prev) => ({ ...prev, state: "LISTENING" }));
    sessionRef.current = { ...sessionRef.current, state: "LISTENING" };

    chrome.runtime.sendMessage(
      { type: "START_SESSION_REQUEST", payload: { tabId: session.tabId } },
      (res) => {
        if (res?.success && res.session) {
          setSession(res.session);
          sessionRef.current = res.session;
        } else if (!res?.success) {
          alert(res?.error || "Could not find an active Google Meet tab. Please open meet.google.com and try again.");
          fetchSessionState();
        }
      }
    );
  };

  const handleStopListening = () => {
    stopAlertSound();
    setActiveAlert(null);
    detectorRef.current.resetHistory();
    chrome.storage.local.remove([ALERTED_HASHES_STORAGE_KEY]).catch(() => {});
    try {
      if (chrome.notifications) {
        chrome.notifications.getAll((notifs) => {
          if (notifs) {
            Object.keys(notifs).forEach((id) => chrome.notifications.clear(id));
          }
        });
      }
    } catch {}
    chrome.runtime.sendMessage({ type: "STOP_SESSION_REQUEST" });
    setAudioLevel(0);
  };

  const handleResetSession = () => {
    chrome.runtime.sendMessage({ type: "RESET_SESSION_REQUEST" }, (res) => {
      if (res?.session) setSession(res.session);
    });
    setActiveAlert(null);
    stopAlertSound();
    detectorRef.current.resetHistory();
    chrome.storage.local.remove([ALERTED_HASHES_STORAGE_KEY]).catch(() => {});
  };

  const handleClearTranscripts = () => {
    setTranscripts([]);
  };

  const handleTestAlert = () => {
    const testName = profile.displayName || "Aryan";
    const testEvent: MeetingEvent = {
      id: `test_${Date.now()}`,
      sessionId: session.sessionId || "test_session",
      type: "NAME_MENTION",
      transcriptExcerpt: `${testName}, can you please answer the question?`,
      evidenceSegmentIds: ["seg_test"],
      timestampMs: Date.now(),
      confidence: 0.96,
      urgency: "high",
      explanation: `Direct callout addressed to ${testName}.`,
    };
    triggerAlert(testEvent);
  };

  const handleKickstartCaptions = () => {
    setCaptionKickstartFeedback(true);
    setTimeout(() => setCaptionKickstartFeedback(false), 2000);

    const msg = { type: "KICKSTART_MEET_CAPTIONS" };
    if (session.tabId && session.tabId > 0) {
      chrome.tabs.sendMessage(session.tabId, msg).catch(() => {});
    } else {
      chrome.tabs.query({ url: "*://meet.google.com/*" }, (tabs) => {
        if (tabs && tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
        }
      });
    }
  };

  const handleTurnOnCaptions = () => {
    handleKickstartCaptions();
  };

  const isListening = session.state === "LISTENING";

  // If in a secondary view, render it
  if (currentView === "settings") {
    return (
      <SettingsView
        profile={profile}
        geminiApiKey={geminiApiKey}
        onSaveProfile={handleSaveProfile}
        onSaveApiKey={handleSaveApiKey}
        onTestAlert={handleTestAlert}
        onPlayChime={playAlertChime}
        onTurnOnCaptions={handleTurnOnCaptions}
        onKickstartCaptions={handleKickstartCaptions}
        onResetSession={handleResetSession}
        onClearTranscripts={handleClearTranscripts}
        onClearAlertsHistory={() => setAlertsHistory([])}
        onClose={() => setCurrentView("main")}
      />
    );
  }

  if (currentView === "history") {
    return (
      <HistoryView
        alertsHistory={alertsHistory}
        onSelectAlert={(index) => {
          setCurrentAlertIndex(index);
          setCurrentView("main");
        }}
        onClearHistory={() => setAlertsHistory([])}
        onClose={() => setCurrentView("main")}
      />
    );
  }

  if (currentView === "transcript") {
    return (
      <TranscriptView
        transcripts={transcripts}
        liveDialogue={liveDialogue}
        isListening={isListening}
        onClearTranscripts={handleClearTranscripts}
        onTurnOnCaptions={handleTurnOnCaptions}
        onKickstartCaptions={handleKickstartCaptions}
        onClose={() => setCurrentView("main")}
      />
    );
  }

  // Active / Selected alert suggestions
  const displayAlert =
    alertsHistory.length > 0 && alertsHistory[currentAlertIndex]
      ? alertsHistory[currentAlertIndex]
      : activeAlert || alertsHistory[0];

  const suggestions = displayAlert
    ? aiResponsesMap[displayAlert.id] || getInstantSmartResponses(displayAlert, profile)
    : [];

  const priorContextTranscripts = transcripts.slice(-4, -1);
  const mostRecentAlert = alertsHistory[0];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: THEME.colors.bg,
        color: THEME.colors.textPrimary,
        boxSizing: "border-box",
        position: "relative",
        overflowY: "auto",
        fontFamily: THEME.typography.fontFamily,
      }}
    >
      {/* Scrollable Main Content Container */}
      <div style={{ flex: 1, padding: "16px 16px 85px 16px", boxSizing: "border-box" }}>
        {/* A. HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "8px",
          }}
        >
          {/* Left: Custom OiU Logo + Wordmark | Display Name & Status */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <OiULogoMark size={21} color={THEME.colors.textPrimary} />
              <span
                style={{
                  fontSize: "17px",
                  fontWeight: 800,
                  letterSpacing: "-0.4px",
                  color: THEME.colors.textPrimary,
                }}
              >
                OiU
              </span>
            </div>

            <span style={{ color: THEME.colors.border, userSelect: "none", margin: "0 2px" }}>|</span>

            <div>
              <div
                style={{
                  fontSize: "13.5px",
                  fontWeight: 700,
                  color: THEME.colors.textPrimary,
                  letterSpacing: "-0.2px",
                  lineHeight: 1.15,
                }}
              >
                {profile.displayName || "User"}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  color: THEME.colors.textSecondary,
                  marginTop: "1px",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: isListening
                      ? THEME.colors.accentGreen
                      : session.state === "SUPPORTED_TAB_READY"
                      ? THEME.colors.accentBlue
                      : THEME.colors.textMuted,
                    boxShadow: isListening ? `0 0 6px ${THEME.colors.accentGreen}` : "none",
                  }}
                />
                <span>
                  {isListening
                    ? "Listening"
                    : session.state === "SUPPORTED_TAB_READY"
                    ? "Meet Ready"
                    : "Offline"}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Kickstart Captions & Settings */}
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <button
              onClick={handleKickstartCaptions}
              title={captionKickstartFeedback ? "Captions kickstarted & reconnected!" : "Kickstart / Reconnect Meet Captions (Fixes stalled captions)"}
              style={{
                background: "none",
                border: "none",
                padding: "6px",
                cursor: "pointer",
                borderRadius: THEME.radius.sm,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: captionKickstartFeedback ? THEME.colors.accentGreen : THEME.colors.textSecondary,
                transition: "all 0.2s ease",
              }}
            >
              <RefreshIcon
                size={16}
                color={captionKickstartFeedback ? THEME.colors.accentGreen : THEME.colors.textSecondary}
                style={{
                  transform: captionKickstartFeedback ? "rotate(180deg)" : "none",
                  transition: "transform 0.4s ease",
                }}
              />
            </button>

            <button
              onClick={() => setCurrentView("settings")}
              title="Open Settings"
              style={{
                background: "none",
                border: "none",
                padding: "6px",
                cursor: "pointer",
                borderRadius: THEME.radius.sm,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: THEME.colors.textSecondary,
              }}
            >
              <SettingsIcon size={19} color={THEME.colors.textSecondary} />
            </button>
          </div>
        </div>

        {/* B. AUDIO VISUALIZER (Centerpiece Waveform) */}
        <AudioWaveform
          isListening={isListening}
          isVoiceActive={isVoiceActive}
          audioLevel={audioLevel}
          segmentsCount={transcripts.length}
          currentTimeString={currentTimeString}
        />

        {/* C. DETECTION / QUESTION & ANSWER CARD */}
        <DetectionCard
          activeAlert={activeAlert}
          alertsHistory={alertsHistory}
          currentAlertIndex={currentAlertIndex}
          profile={profile}
          suggestions={suggestions}
          isGeneratingAi={isGeneratingAi}
          geminiApiKey={geminiApiKey}
          priorContextTranscripts={priorContextTranscripts}
          onCopySuggestion={handleCopySuggestion}
          copiedSuggestionIdx={copiedSuggestionIdx}
          onNavigateAlert={setCurrentAlertIndex}
          onDismissAlert={() => {
            stopAlertSound();
            setActiveAlert(null);
          }}
          onPlayChime={playAlertChime}
          onRegenerateAi={handleRegenerateAi}
          onOpenSettings={() => setCurrentView("settings")}
        />

        {/* D. HISTORY SECTION (Compact Row matching reference) */}
        <div style={{ marginTop: "14px", marginBottom: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                color: THEME.colors.textSecondary,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
              }}
            >
              History
            </span>

            {alertsHistory.length > 0 && (
              <button
                onClick={() => setCurrentView("history")}
                style={{
                  background: "none",
                  border: "none",
                  color: THEME.colors.textSecondary,
                  fontSize: "11px",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                <span>View All</span>
                <span style={{ fontSize: "10px" }}>→</span>
              </button>
            )}
          </div>

          {mostRecentAlert ? (
            <div
              onClick={() => setCurrentView("history")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: THEME.colors.bgSecondary,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.md,
                padding: "10px 12px",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0, marginRight: "8px" }}>
                <WaveformSmallIcon size={14} color={THEME.colors.textPrimary} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: THEME.colors.textPrimary }}>
                    {new Date(mostRecentAlert.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {" · "}
                    <span style={{ color: THEME.colors.textSecondary }}>{mostRecentAlert.explanation}</span>
                  </div>
                  <div
                    style={{
                      fontSize: "11.5px",
                      fontStyle: "italic",
                      color: THEME.colors.textSecondary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    "{mostRecentAlert.transcriptExcerpt}"
                  </div>
                </div>
              </div>
              <ChevronRightIcon size={14} color={THEME.colors.textMuted} />
            </div>
          ) : (
            <div
              style={{
                backgroundColor: THEME.colors.bgSecondary,
                border: `1px solid ${THEME.colors.borderSubtle}`,
                borderRadius: THEME.radius.md,
                padding: "10px 12px",
                fontSize: "11.5px",
                color: THEME.colors.textMuted,
                fontStyle: "italic",
              }}
            >
              No past alerts in this session.
            </div>
          )}
        </div>

        {/* E. KEYWORDS SECTION (Chips matching reference) */}
        <div style={{ marginBottom: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                color: THEME.colors.textSecondary,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
              }}
            >
              Keywords
            </span>

            <button
              onClick={() => setCurrentView("settings")}
              style={{
                background: "none",
                border: "none",
                color: THEME.colors.textSecondary,
                fontSize: "11px",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <EditPencilIcon size={11} color={THEME.colors.textSecondary} />
              <span>Edit</span>
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {/* Display Name Chip */}
            {profile.displayName && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 10px",
                  backgroundColor: THEME.colors.bgSecondary,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.pill,
                  fontSize: "11px",
                  color: THEME.colors.textPrimary,
                  fontWeight: 500,
                }}
              >
                <UserIcon size={11} color={THEME.colors.textSecondary} />
                <span>{profile.displayName}</span>
              </div>
            )}

            {/* Aliases Chips */}
            {profile.aliases.map((alias, i) => (
              <div
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 10px",
                  backgroundColor: THEME.colors.bgSecondary,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.pill,
                  fontSize: "11px",
                  color: THEME.colors.textPrimary,
                  fontWeight: 500,
                }}
              >
                <UserIcon size={11} color={THEME.colors.textSecondary} />
                <span>{alias}</span>
              </div>
            ))}

            {/* Identifier Chips */}
            {profile.identifiers.map((id, i) => (
              <div
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 10px",
                  backgroundColor: THEME.colors.bgSecondary,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.pill,
                  fontSize: "11px",
                  color: THEME.colors.textPrimary,
                  fontWeight: 500,
                  fontFamily: THEME.typography.monoFamily,
                }}
              >
                <HashIcon size={11} color={THEME.colors.textSecondary} />
                <span>{id}</span>
              </div>
            ))}

            {/* Custom Monitored Keywords Chips */}
            {(profile.keywords || []).map((kw, i) => (
              <div
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 10px",
                  backgroundColor: THEME.colors.bgSecondary,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.pill,
                  fontSize: "11px",
                  color: THEME.colors.textPrimary,
                  fontWeight: 500,
                }}
              >
                <TagIcon size={11} color={THEME.colors.accentGreen} />
                <span>{kw}</span>
              </div>
            ))}
          </div>
        </div>

        {/* F. LIVE STREAM ACCESS ROW */}
        <div
          onClick={() => setCurrentView("transcript")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: THEME.colors.bgSecondary,
            border: `1px solid ${THEME.colors.border}`,
            borderRadius: THEME.radius.md,
            padding: "9px 12px",
            cursor: "pointer",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <MessageSquareIcon size={14} color={THEME.colors.textSecondary} />
            <span style={{ fontSize: "11.5px", color: THEME.colors.textSecondary }}>Live Meeting Stream</span>
            {transcripts.length > 0 && (
              <span
                style={{
                  fontSize: "9.5px",
                  fontWeight: 700,
                  backgroundColor: THEME.colors.surface,
                  color: THEME.colors.textPrimary,
                  padding: "1px 6px",
                  borderRadius: THEME.radius.xs,
                  border: `1px solid ${THEME.colors.borderSubtle}`,
                }}
              >
                {transcripts.length}
              </span>
            )}
          </div>
          <ChevronRightIcon size={14} color={THEME.colors.textMuted} />
        </div>
      </div>

      {/* G. FLOATING BOTTOM LISTENING CONTROLS */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 16px 16px 16px",
          backgroundColor: "rgba(9, 10, 11, 0.94)",
          backdropFilter: "blur(12px)",
          borderTop: `1px solid ${THEME.colors.borderSubtle}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          zIndex: 100,
        }}
      >
        {isListening ? (
          <button
            onClick={handleStopListening}
            style={{
              width: "100%",
              maxWidth: "360px",
              padding: "12px 20px",
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.borderActive}`,
              borderRadius: THEME.radius.lg,
              color: THEME.colors.textPrimary,
              fontSize: "13.5px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              boxShadow: "0 4px 18px rgba(0,0,0,0.4)",
              transition: "all 0.15s ease",
            }}
          >
            {/* Dark green-tinted squircle with square stop icon matching reference */}
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                backgroundColor: THEME.colors.greenMutedBg,
                border: `1px solid ${THEME.colors.greenBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <StopSquareIcon size={11} color={THEME.colors.accentGreen} />
            </div>
            <span>Stop Listening</span>
          </button>
        ) : (
          <button
            onClick={handleStartListening}
            style={{
              width: "100%",
              maxWidth: "360px",
              padding: "12px 20px",
              backgroundColor: THEME.colors.accentGreen,
              border: "none",
              borderRadius: THEME.radius.lg,
              color: "#090A0B",
              fontSize: "13.5px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: `0 4px 18px ${THEME.colors.greenGlow}`,
              transition: "all 0.15s ease",
            }}
          >
            <MicrophoneIcon size={16} color="#090A0B" />
            <span>Start Listening</span>
          </button>
        )}
      </div>
    </div>
  );
};
