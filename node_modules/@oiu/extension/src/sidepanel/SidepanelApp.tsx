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

// Feature flag: Deactivate AI question answering for now (focusing 100% on the core meeting alert engine)
const ENABLE_AI_ANSWER_ENGINE = false;

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
  const aiDebounceTimerRef = useRef<any>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const isRecent = Date.now() - lastSpeechTime < 1800;
      setIsVoiceActive(isRecent);
      if (!isRecent) {
        setAudioLevel((prev) => (prev > 0 ? 0 : prev));
      }
    }, 200);
    return () => clearInterval(interval);
  }, [lastSpeechTime]);

  const handleCopySuggestion = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSuggestionIdx(index);
      setTimeout(() => setCopiedSuggestionIdx(null), 2000);
    }).catch(() => {});
  };

  const scheduleAiGeneration = useCallback((event: MeetingEvent) => {
    if (!ENABLE_AI_ANSWER_ENGINE) return;

    if (aiDebounceTimerRef.current) {
      clearTimeout(aiDebounceTimerRef.current);
    }

    setIsGeneratingAi(true);
    aiDebounceTimerRef.current = setTimeout(() => {
      const recentCtx = transcriptsRef.current.slice(-5).map((t) => `${t.speakerId || "Speaker"}: ${t.text}`).join("\n");
      generateSmartResponses(event, profileRef.current, geminiApiKeyRef.current, recentCtx)
        .then((responses) => {
          setAiResponsesMap((prev) => ({ ...prev, [event.id]: responses }));
        })
        .catch(() => {})
        .finally(() => {
          setIsGeneratingAi(false);
        });
    }, 850);
  }, []);

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

    // Debounced AI generation (protects from burning the 15 RPM rate limit during streaming)
    scheduleAiGeneration(event);

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
  }, [scheduleAiGeneration]);

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

    // Debounced AI generation on updated excerpt
    scheduleAiGeneration(event);
  }, [scheduleAiGeneration]);

  // Auto-finalize speech turns when speaker pauses > 2.0 seconds OR when utterance reaches 7 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTranscripts((prev) => {
        let changed = false;
        const updated = prev.map((seg) => {
          if (!seg.isFinal && (now - seg.endMs > 2000 || now - (seg.startMs || now) >= 7000)) {
            changed = true;
            return { ...seg, isFinal: true };
          }
          return seg;
        });
        return changed ? updated : prev;
      });
    }, 600);
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

    // 2. Fetch session state, background transcripts, and any alerts captured while sidepanel was closed
    chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.session) setSession(response.session);
      if (response?.profile) {
        setProfile(response.profile);
        detectorRef.current.updateProfile(response.profile);
      }
      if (Array.isArray(response?.transcripts) && response.transcripts.length > 0) {
        setTranscripts(response.transcripts);
      }
      if (Array.isArray(response?.alertsHistory) && response.alertsHistory.length > 0) {
        setAlertsHistory(response.alertsHistory);
      }
      if (response?.activeAlert) {
        setActiveAlert(response.activeAlert);
        const instantAnswers = getInstantSmartResponses(response.activeAlert, profileRef.current);
        setAiResponsesMap((prev) => ({ ...prev, [response.activeAlert.id]: instantAnswers }));
      }
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
      } else if (msg.type === "BACKGROUND_DETECTION_UPDATE" && msg.payload) {
        // Sync single-source-of-truth detection from background service worker
        const {
          turnAction,
          transcripts: bgTranscripts,
          alertsHistory: bgHistory,
          activeAlert: bgAlert,
          dialogueAnalysis,
        } = msg.payload;

        if (dialogueAnalysis) setLiveDialogue(dialogueAnalysis);
        if (turnAction && turnAction !== "NO_OP") {
          setLastSpeechTime(Date.now());
          setIsVoiceActive(true);
        }
        if (Array.isArray(bgTranscripts)) setTranscripts(bgTranscripts);
        if (Array.isArray(bgHistory)) setAlertsHistory(bgHistory);
        if (bgAlert) {
          setActiveAlert(bgAlert);
          if (turnAction === "NEW_ALERT") {
            setCurrentAlertIndex(0);
          }
          const instantAnswers = getInstantSmartResponses(bgAlert, profileRef.current);
          setAiResponsesMap((prev) => ({ ...prev, [bgAlert.id]: instantAnswers }));
          scheduleAiGeneration(bgAlert);
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
    chrome.runtime.sendMessage({ type: "CLEAR_TRANSCRIPTS_REQUEST" }).catch(() => {});
  };

  const handleClearAlertsHistory = () => {
    setAlertsHistory([]);
    setActiveAlert(null);
    chrome.runtime.sendMessage({ type: "CLEAR_ALERTS_REQUEST" }).catch(() => {});
  };

  const handleTestAlert = () => {
    const testName = profile.displayName || "User";
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

    const flashMsg = { type: "SHOW_MEET_FLASH" };
    if (session.tabId && session.tabId > 0) {
      chrome.tabs.sendMessage(session.tabId, flashMsg).catch(() => {});
    } else {
      chrome.tabs.query({ url: "*://meet.google.com/*" }, (tabs) => {
        if (tabs && tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, flashMsg).catch(() => {});
        }
      });
    }
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
        onClearAlertsHistory={handleClearAlertsHistory}
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
        onClearHistory={handleClearAlertsHistory}
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
            paddingBottom: "10px",
            borderBottom: `1px solid ${THEME.colors.borderSubtle}`,
          }}
        >
          {/* Left: Custom OiU Logo in Yellow + Monospace User Tag */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <OiULogoMark size={20} color={THEME.colors.accentYellow} />
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  color: THEME.colors.accentYellow,
                  fontFamily: THEME.typography.displayFont,
                }}
              >
                OiU
              </span>
            </div>

            <span style={{ width: "1px", height: "20px", backgroundColor: "#333338", margin: "0 8px" }} />

            <div>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  fontFamily: THEME.typography.displayFont,
                  color: "#FFFFFF",
                  letterSpacing: "0.5px",
                  lineHeight: 1.2,
                }}
              >
                {profile.displayName || "User"}
                {profile.identifiers?.[0] ? (
                  <span style={{ color: THEME.colors.accentYellow, marginLeft: "6px" }}>
                    #{profile.identifiers[0]}
                  </span>
                ) : ""}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "10.5px",
                  fontFamily: THEME.typography.monoFamily,
                  color: "#CCCCCC",
                  marginTop: "2px",
                }}
              >
                <span
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "1px",
                    backgroundColor: isListening
                      ? THEME.colors.accentYellow
                      : session.state === "SUPPORTED_TAB_READY"
                      ? THEME.colors.accentBlue
                      : THEME.colors.textMuted,
                    boxShadow: isListening ? `0 0 6px ${THEME.colors.accentYellow}` : "none",
                  }}
                />
                <span style={{ fontWeight: 600 }}>
                  {isListening
                    ? "LISTENING"
                    : session.state === "SUPPORTED_TAB_READY"
                    ? "MEET DETECTED"
                    : "STANDBY"}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Kickstart Captions & Settings */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              onClick={handleKickstartCaptions}
              title={captionKickstartFeedback ? "Captions kickstarted & reconnected!" : "Kickstart / Reconnect Meet Captions"}
              style={{
                width: "32px",
                height: "32px",
                backgroundColor: THEME.colors.surface,
                border: "1px solid #333338",
                cursor: "pointer",
                borderRadius: THEME.radius.xs,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: captionKickstartFeedback ? THEME.colors.accentYellow : "#FFFFFF",
                transition: "all 0.2s ease",
              }}
            >
              <RefreshIcon
                size={14}
                color={captionKickstartFeedback ? THEME.colors.accentYellow : "#CCCCCC"}
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
                width: "32px",
                height: "32px",
                backgroundColor: THEME.colors.surface,
                border: "1px solid #333338",
                cursor: "pointer",
                borderRadius: THEME.radius.xs,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
              }}
            >
              <SettingsIcon size={15} color="#CCCCCC" />
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
            chrome.runtime.sendMessage({ type: "DISMISS_ACTIVE_ALERT" }).catch(() => {});
          }}
          onPlayChime={playAlertChime}
          onRegenerateAi={handleRegenerateAi}
          onOpenSettings={() => setCurrentView("settings")}
        />

        {/* DIVIDER & SECONDARY SCROLLABLE SECTIONS (BELOW THE FOLD) */}
        <div style={{ marginTop: "24px", borderTop: `1px solid ${THEME.colors.border}`, paddingTop: "20px" }}>
          
          {/* E. KEYWORDS SECTION */}
          <div style={{ marginBottom: "22px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    width: "5px",
                    height: "5px",
                    backgroundColor: THEME.colors.accentYellow,
                    borderRadius: "1px",
                  }}
                />
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    fontFamily: THEME.typography.displayFont,
                    color: "#FFFFFF",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                  }}
                >
                  Monitored Triggers
                </span>
              </div>

              <button
                onClick={() => setCurrentView("settings")}
                style={{
                  background: THEME.colors.surface,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.xs,
                  color: "#FFFFFF",
                  fontSize: "11px",
                  fontWeight: 600,
                  fontFamily: THEME.typography.monoFamily,
                  cursor: "pointer",
                  padding: "4px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  transition: "background-color 0.15s ease",
                }}
              >
                <EditPencilIcon size={12} color={THEME.colors.accentYellow} />
                <span>EDIT</span>
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {/* Display Name Chip (Highlighted) */}
              {profile.displayName && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    backgroundColor: THEME.colors.surface,
                    border: `1px solid ${THEME.colors.accentYellow}`,
                    borderRadius: THEME.radius.xs,
                    fontSize: "12.5px",
                    fontFamily: THEME.typography.monoFamily,
                    color: THEME.colors.accentYellow,
                    fontWeight: 700,
                    letterSpacing: "0.3px",
                  }}
                >
                  <UserIcon size={13} color={THEME.colors.accentYellow} />
                  <span>{profile.displayName.toUpperCase()}</span>
                </div>
              )}

              {/* Identifier Chips (Highlighted) */}
              {profile.identifiers.map((id, i) => (
                <div
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    backgroundColor: THEME.colors.surface,
                    border: `1px solid ${THEME.colors.accentYellow}`,
                    borderRadius: THEME.radius.xs,
                    fontSize: "12.5px",
                    fontFamily: THEME.typography.monoFamily,
                    color: THEME.colors.accentYellow,
                    fontWeight: 800,
                    letterSpacing: "0.5px",
                  }}
                >
                  <HashIcon size={13} color={THEME.colors.accentYellow} />
                  <span>#{id}</span>
                </div>
              ))}

              {/* Aliases Chips (Crisp White Text) */}
              {profile.aliases.map((alias, i) => (
                <div
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    backgroundColor: THEME.colors.surface,
                    border: `1px solid #333338`,
                    borderRadius: THEME.radius.xs,
                    fontSize: "12.5px",
                    fontFamily: THEME.typography.monoFamily,
                    color: "#FFFFFF",
                    fontWeight: 600,
                  }}
                >
                  <UserIcon size={13} color="#999999" />
                  <span>{alias.toUpperCase()}</span>
                </div>
              ))}

              {/* Custom Monitored Keywords Chips (Crisp White Text) */}
              {(profile.keywords || []).map((kw, i) => (
                <div
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    backgroundColor: THEME.colors.surface,
                    border: `1px solid #333338`,
                    borderRadius: THEME.radius.xs,
                    fontSize: "12.5px",
                    fontFamily: THEME.typography.monoFamily,
                    color: "#FFFFFF",
                    fontWeight: 600,
                  }}
                >
                  <TagIcon size={13} color={THEME.colors.accentYellow} />
                  <span>{kw.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* D. HISTORY SECTION */}
          <div style={{ marginBottom: "22px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    width: "5px",
                    height: "5px",
                    backgroundColor: THEME.colors.accentYellow,
                    borderRadius: "1px",
                  }}
                />
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    fontFamily: THEME.typography.displayFont,
                    color: "#FFFFFF",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                  }}
                >
                  Recent Callouts
                </span>
              </div>

              {alertsHistory.length > 0 && (
                <button
                  onClick={() => setCurrentView("history")}
                  style={{
                    background: "none",
                    border: "none",
                    color: THEME.colors.accentYellow,
                    fontSize: "11px",
                    fontWeight: 700,
                    fontFamily: THEME.typography.monoFamily,
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <span>VIEW ALL ({alertsHistory.length})</span>
                  <span>→</span>
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
                  backgroundColor: THEME.colors.surface,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  padding: "12px 14px",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0, marginRight: "8px" }}>
                  <div
                    style={{
                      fontFamily: THEME.typography.monoFamily,
                      fontSize: "12px",
                      color: THEME.colors.accentYellow,
                      fontWeight: 800,
                    }}
                  >
                    {new Date(mostRecentAlert.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div
                    style={{
                      fontSize: "13.5px",
                      color: "#FFFFFF",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    "{mostRecentAlert.transcriptExcerpt}"
                  </div>
                </div>
                <ChevronRightIcon size={14} color="#AAAAAA" />
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: THEME.colors.surface,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  padding: "14px 16px",
                  fontSize: "13px",
                  color: "#CCCCCC",
                  fontWeight: 500,
                }}
              >
                No callouts recorded in this session yet.
              </div>
            )}
          </div>

          {/* F. LIVE STREAM ACCESS ROW */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span
                style={{
                  width: "5px",
                  height: "5px",
                  backgroundColor: THEME.colors.accentYellow,
                  borderRadius: "1px",
                }}
              />
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  fontFamily: THEME.typography.displayFont,
                  color: "#FFFFFF",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                }}
              >
                Live Meeting Stream
              </span>
            </div>

            <div
              onClick={() => setCurrentView("transcript")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                padding: "13px 16px",
                cursor: "pointer",
                transition: "border-color 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <MessageSquareIcon size={16} color={THEME.colors.accentYellow} />
                <span style={{ fontSize: "13px", color: "#FFFFFF", fontWeight: 600 }}>
                  Open Meeting Caption Stream
                </span>
                {transcripts.length > 0 && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontFamily: THEME.typography.monoFamily,
                      fontWeight: 800,
                      backgroundColor: "#000000",
                      color: THEME.colors.accentYellow,
                      padding: "2px 7px",
                      borderRadius: "2px",
                      border: `1px solid ${THEME.colors.yellowBorder}`,
                    }}
                  >
                    {transcripts.length} TURNS
                  </span>
                )}
              </div>
              <ChevronRightIcon size={15} color="#AAAAAA" />
            </div>
          </div>
        </div>
      </div>

      {/* G. FLOATING BOTTOM LISTENING CONTROLS */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "10px 16px 14px 16px",
          backgroundColor: "rgba(0, 0, 0, 0.95)",
          backdropFilter: "blur(10px)",
          borderTop: `1px solid ${THEME.colors.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 100,
        }}
      >
        {isListening ? (
          <button
            onClick={handleStopListening}
            style={{
              width: "100%",
              maxWidth: "360px",
              padding: "11px 18px",
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.sm,
              color: THEME.colors.textPrimary,
              fontSize: "14px",
              fontWeight: 700,
              fontFamily: THEME.typography.displayFont,
              letterSpacing: "1.2px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.12s ease",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                backgroundColor: THEME.colors.accentRed,
                borderRadius: "1px",
              }}
            />
            <span>STOP LISTENING</span>
          </button>
        ) : (
          <button
            onClick={handleStartListening}
            style={{
              width: "100%",
              maxWidth: "360px",
              padding: "11px 18px",
              backgroundColor: THEME.colors.accentYellow,
              border: "none",
              borderRadius: THEME.radius.sm,
              color: "#000000",
              fontSize: "14px",
              fontWeight: 700,
              fontFamily: THEME.typography.displayFont,
              letterSpacing: "1.2px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 0 16px rgba(255, 230, 0, 0.25)",
              transition: "all 0.12s ease",
            }}
          >
            <MicrophoneIcon size={14} color="#000000" />
            <span>START LISTENING</span>
          </button>
        )}
      </div>
    </div>
  );
};
