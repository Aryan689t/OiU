import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  SessionInfo,
  UserProfile,
  DEFAULT_PROFILE,
  TranscriptSegment,
  MeetingEvent,
  EventDetector,
  DialogueAnalysis,
} from "@oiu/shared";
import {
  generateSmartResponses,
  getInstantSmartResponses,
  SuggestedResponse,
} from "../services/aiService.js";
import { THEME } from "./theme";
import {
  OiULogoMark,
  SettingsIcon,
  ChevronRightIcon,
  EditPencilIcon,
  UserIcon,
  HashIcon,
  TagIcon,
  MicrophoneIcon,
  StopSquareIcon,
  MessageSquareIcon,
  RefreshIcon,
} from "./icons";
import { AuraSignalArc, AuraSignalState } from "./AuraSignalArc";
import { AudioWaveform } from "./AudioWaveform";
import { DetectionCard } from "./DetectionCard";
import { SettingsView } from "./SettingsView";
import { HistoryView } from "./HistoryView";
import { TranscriptView } from "./TranscriptView";

const PROFILE_STORAGE_KEY = "oiu_user_profile";
const ALERTED_HASHES_STORAGE_KEY = "oiu_alerted_hashes";
const GEMINI_API_KEY_STORAGE = "oiu_gemini_api_key";

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
    gain1.gain.setValueAtTime(0.24, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // Second tone (A5 - 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.28, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.38);

    setTimeout(() => {
      if (currentAudioCtx === ctx) {
        try { ctx.close(); } catch {}
        currentAudioCtx = null;
      }
    }, 450);
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

    const instantAnswers = getInstantSmartResponses(event, profileRef.current);
    setAiResponsesMap((prev) => ({ ...prev, [event.id]: instantAnswers }));

    if (detectorRef.current) {
      const exported = detectorRef.current.exportAlertedHashes();
      chrome.storage.local.set({ [ALERTED_HASHES_STORAGE_KEY]: exported });
    }

    scheduleAiGeneration(event);

    try {
      if (chrome.notifications) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL("icon.png"),
          title: "OiU Attention Alert",
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

    const updatedResponses = getInstantSmartResponses(event, profileRef.current);
    setAiResponsesMap((prev) => ({ ...prev, [event.id]: updatedResponses }));
    scheduleAiGeneration(event);
  }, [scheduleAiGeneration]);

  // Auto-finalize speech turns
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
    chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.session) setSession(response.session);
    });
  }, []);

  // Sync state on mount
  useEffect(() => {
    chrome.storage.local.get([PROFILE_STORAGE_KEY, ALERTED_HASHES_STORAGE_KEY, GEMINI_API_KEY_STORAGE], (res) => {
      if (res?.[PROFILE_STORAGE_KEY]) {
        const saved = res[PROFILE_STORAGE_KEY] as UserProfile;
        setProfile(saved);
        detectorRef.current.updateProfile(saved);
      } else {
        setCurrentView("settings");
      }

      if (res?.[ALERTED_HASHES_STORAGE_KEY] && Array.isArray(res[ALERTED_HASHES_STORAGE_KEY])) {
        detectorRef.current.importAlertedHashes(res[ALERTED_HASHES_STORAGE_KEY]);
      }

      if (res?.[GEMINI_API_KEY_STORAGE]) {
        setGeminiApiKey(res[GEMINI_API_KEY_STORAGE]);
      }
    });

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
    if (!profile.displayName?.trim()) {
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
          alert(res?.error || "Could not find an active Google Meet tab. Open meet.google.com and try again.");
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
    const testName = profile.displayName?.trim() || "User";
    const testEvent: MeetingEvent = {
      id: `test_${Date.now()}`,
      sessionId: session.sessionId || "test_session",
      type: "NAME_MENTION",
      transcriptExcerpt: `${testName}, can you please verify this point?`,
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

  const isConfigured = Boolean(profile.displayName && profile.displayName.trim().length > 0);
  const isListening = session.state === "LISTENING";
  const isMeetReady = session.state === "SUPPORTED_TAB_READY";

  // Determine truthful application state for the AURA Signal Arc and UI
  const getTruthfulSignalState = (): AuraSignalState => {
    if (!isConfigured) return "NOT_CONFIGURED";
    if (activeAlert) return "ALERT";
    if (session.state === "ERROR" || session.state === "PERMISSION_REQUIRED") return "ERROR";
    if (session.state === "STOPPED" || session.state === "STOPPING") return "STOPPED";
    if (isListening) return "LISTENING";
    if (isMeetReady) return "READY";
    return "NO_MEETING";
  };

  const signalState = getTruthfulSignalState();

  // Header status badge
  const getHeaderStatusBadge = () => {
    if (!isConfigured) {
      return {
        text: "Setup Needed",
        bg: THEME.colors.accentPeachLight,
        color: THEME.colors.accentPeachDark,
        border: THEME.colors.accentPeachBorder,
      };
    }
    if (isListening) {
      return {
        text: isVoiceActive ? "Speech Active" : "Listening",
        bg: THEME.colors.accentSageLight,
        color: THEME.colors.accentSageDark,
        border: THEME.colors.accentSageBorder,
      };
    }
    if (isMeetReady) {
      return {
        text: "Meet Detected",
        bg: THEME.colors.accentBlueLight,
        color: THEME.colors.accentBlueDark,
        border: THEME.colors.accentBlueBorder,
      };
    }
    return {
      text: "Standby",
      bg: THEME.colors.bgSubtle,
      color: THEME.colors.textSecondary,
      border: THEME.colors.border,
    };
  };

  const headerStatus = getHeaderStatusBadge();

  // Waveform status description
  const getWaveformStatus = () => {
    if (!isConfigured) return "Setup incomplete";
    if (isListening) {
      return isVoiceActive ? "Active speech feed" : "Listening for speech...";
    }
    if (isMeetReady) return "Google Meet connected · Standby";
    return "Waiting for Google Meet";
  };

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
          setActiveAlert(alertsHistory[index] || null);
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
      <div style={{ flex: 1, padding: "14px 16px 88px 16px", boxSizing: "border-box" }}>
        {/* A. REFINED HEADER */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "10px",
            borderBottom: `1px solid ${THEME.colors.border}`,
            marginBottom: "6px",
          }}
        >
          {/* Left: Brand Identity & Meeting Status */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <OiULogoMark size={20} color={THEME.colors.textPrimary} />
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 800,
                  letterSpacing: "-0.4px",
                  color: THEME.colors.textPrimary,
                }}
              >
                OiU
              </span>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 7px",
                  borderRadius: THEME.radius.pill,
                  backgroundColor: headerStatus.bg,
                  border: `1px solid ${headerStatus.border}`,
                  fontSize: "10.5px",
                  fontWeight: 700,
                  color: headerStatus.color,
                }}
              >
                <span
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    backgroundColor: headerStatus.color,
                  }}
                />
                <span>{headerStatus.text}</span>
              </div>
            </div>
          </div>

          {/* Right: Kickstart Captions & Settings */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <button
              onClick={handleKickstartCaptions}
              title={captionKickstartFeedback ? "Captions kickstarted!" : "Reconnect Google Meet Captions"}
              aria-label="Reconnect captions"
              style={{
                width: "30px",
                height: "30px",
                backgroundColor: captionKickstartFeedback ? THEME.colors.accentSageLight : THEME.colors.surface,
                border: `1px solid ${captionKickstartFeedback ? THEME.colors.accentSageBorder : THEME.colors.border}`,
                cursor: "pointer",
                borderRadius: THEME.radius.sm,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: THEME.shadows.sm,
                transition: THEME.transitions.fast,
              }}
            >
              <RefreshIcon
                size={13}
                color={captionKickstartFeedback ? THEME.colors.accentSageDark : THEME.colors.textSecondary}
                style={{
                  transform: captionKickstartFeedback ? "rotate(180deg)" : "none",
                  transition: "transform 0.4s ease",
                }}
              />
            </button>

            <button
              onClick={() => setCurrentView("settings")}
              title="Open Preferences"
              aria-label="Open Preferences"
              style={{
                width: "30px",
                height: "30px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                cursor: "pointer",
                borderRadius: THEME.radius.sm,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: THEME.shadows.sm,
                transition: THEME.transitions.fast,
              }}
            >
              <SettingsIcon size={14} color={THEME.colors.textPrimary} />
            </button>
          </div>
        </header>

        {/* B. AURA SIGNAL ARC LISTENING INSTRUMENT (Hero Area) */}
        <AuraSignalArc
          state={signalState}
          audioLevel={audioLevel}
          isVoiceActive={isVoiceActive}
          targetName={profile.displayName}
          onClick={!isConfigured ? () => setCurrentView("settings") : undefined}
        />

        {/* C. AUDIO VISUALIZER (Waveform Horizon) */}
        <AudioWaveform
          isListening={isListening}
          isVoiceActive={isVoiceActive}
          audioLevel={audioLevel}
          segmentsCount={transcripts.length}
          currentTimeString={currentTimeString}
          statusText={getWaveformStatus()}
        />

        {/* D. ACTIVE ALERT / ATTENTION SPOTLIGHT (Rendered ONLY when an alert is active or selected) */}
        <DetectionCard
          activeAlert={activeAlert}
          alertsHistory={alertsHistory}
          currentAlertIndex={currentAlertIndex}
          profile={profile}
          suggestions={[]}
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

        {/* E. MONITOR MATRIX (Structured Parameters - No Pill Clutter) */}
        <section style={{ marginBottom: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "6px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: THEME.colors.textMuted,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                fontFamily: THEME.typography.monoFamily,
              }}
            >
              Monitor Matrix
            </span>

            <button
              onClick={() => setCurrentView("settings")}
              style={{
                background: "none",
                border: "none",
                color: THEME.colors.accentLavenderDark,
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                padding: "2px 0",
                display: "flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              <EditPencilIcon size={11} color={THEME.colors.accentLavenderDark} />
              <span>Edit Parameters ↗</span>
            </button>
          </div>

          <div
            style={{
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.md,
              padding: "10px 14px",
              boxShadow: THEME.shadows.card,
            }}
          >
            {isConfigured ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                {/* Target Name */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11.5px", color: THEME.colors.textSecondary, fontWeight: 500 }}>
                    Target Identity
                  </span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: THEME.colors.textPrimary }}>
                    {profile.displayName}
                  </span>
                </div>

                {/* Roll Numbers / Identifiers */}
                {profile.identifiers && profile.identifiers.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderTop: `1px solid ${THEME.colors.borderSubtle}`,
                      paddingTop: "6px",
                    }}
                  >
                    <span style={{ fontSize: "11.5px", color: THEME.colors.textSecondary, fontWeight: 500 }}>
                      Roll / Reg IDs
                    </span>
                    <span
                      style={{
                        fontSize: "11.5px",
                        fontWeight: 700,
                        color: THEME.colors.accentPeachDark,
                        fontFamily: THEME.typography.monoFamily,
                      }}
                    >
                      {profile.identifiers.map((id) => `#${id}`).join(" · ")}
                    </span>
                  </div>
                )}

                {/* Phonetic Aliases */}
                {profile.aliases && profile.aliases.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderTop: `1px solid ${THEME.colors.borderSubtle}`,
                      paddingTop: "6px",
                    }}
                  >
                    <span style={{ fontSize: "11.5px", color: THEME.colors.textSecondary, fontWeight: 500 }}>
                      Phonetic Aliases
                    </span>
                    <span style={{ fontSize: "11.5px", color: THEME.colors.textPrimary, fontWeight: 500 }}>
                      {profile.aliases.join(", ")}
                    </span>
                  </div>
                )}

                {/* Monitored Keywords */}
                {profile.keywords && profile.keywords.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderTop: `1px solid ${THEME.colors.borderSubtle}`,
                      paddingTop: "6px",
                    }}
                  >
                    <span style={{ fontSize: "11.5px", color: THEME.colors.textSecondary, fontWeight: 500 }}>
                      Watch Keywords
                    </span>
                    <span style={{ fontSize: "11.5px", color: THEME.colors.accentLavenderDark, fontWeight: 600 }}>
                      {profile.keywords.join(", ")}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="aura-interactive-card"
                onClick={() => setCurrentView("settings")}
                style={{
                  padding: "4px 0",
                  fontSize: "11.5px",
                  color: THEME.colors.accentPeachDark,
                  cursor: "pointer",
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                Make OiU yours — set your name and keywords in Preferences to start monitoring ↗
              </div>
            )}
          </div>
        </section>

        {/* F. RECENT CALLOUTS SECTION */}
        <section style={{ marginBottom: "14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span
                style={{
                  width: "5px",
                  height: "5px",
                  backgroundColor: THEME.colors.accentLavenderDark,
                  borderRadius: "50%",
                }}
              />
              <span
                style={{
                  fontSize: "11.5px",
                  fontWeight: 700,
                  color: THEME.colors.textPrimary,
                  letterSpacing: "0.2px",
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
                  color: THEME.colors.accentLavenderDark,
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                <span>View all ({alertsHistory.length})</span>
                <span>→</span>
              </button>
            )}
          </div>

          {mostRecentAlert ? (
            <div
              className="aura-interactive-card"
              onClick={() => {
                setActiveAlert(mostRecentAlert);
                setCurrentAlertIndex(0);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.md,
                padding: "10px 12px",
                cursor: "pointer",
                boxShadow: THEME.shadows.card,
                transition: THEME.transitions.fast,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0, marginRight: "6px" }}>
                <div
                  style={{
                    fontSize: "10.5px",
                    color: THEME.colors.accentLavenderDark,
                    fontWeight: 700,
                    fontFamily: THEME.typography.monoFamily,
                  }}
                >
                  {new Date(mostRecentAlert.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div
                  style={{
                    fontSize: "12.5px",
                    color: THEME.colors.textPrimary,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  "{mostRecentAlert.transcriptExcerpt}"
                </div>
              </div>
              <ChevronRightIcon size={13} color={THEME.colors.textMuted} />
            </div>
          ) : (
            <div
              style={{
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.md,
                padding: "11px 13px",
                fontSize: "11.5px",
                color: THEME.colors.textSecondary,
                boxShadow: THEME.shadows.card,
              }}
            >
              All quiet for now. No mentions recorded in this session.
            </div>
          )}
        </section>

        {/* G. LIVE STREAM ENTRY ROW */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "8px" }}>
            <span
              style={{
                width: "5px",
                height: "5px",
                backgroundColor: THEME.colors.accentLavenderDark,
                borderRadius: "50%",
              }}
            />
            <span
              style={{
                fontSize: "11.5px",
                fontWeight: 700,
                color: THEME.colors.textPrimary,
                letterSpacing: "0.2px",
                textTransform: "uppercase",
              }}
            >
              Meeting Stream
            </span>
          </div>

          <div
            className="aura-interactive-card"
            onClick={() => setCurrentView("transcript")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.md,
              padding: "10px 12px",
              cursor: "pointer",
              boxShadow: THEME.shadows.card,
              transition: THEME.transitions.fast,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: THEME.radius.xs,
                  backgroundColor: THEME.colors.accentLavenderLight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MessageSquareIcon size={13} color={THEME.colors.accentLavenderDark} />
              </div>
              <span style={{ fontSize: "12.5px", color: THEME.colors.textPrimary, fontWeight: 600 }}>
                Open Meeting Stream
              </span>
              {transcripts.length > 0 && (
                <span
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 700,
                    backgroundColor: THEME.colors.bgSubtle,
                    color: THEME.colors.accentLavenderDark,
                    padding: "1px 7px",
                    borderRadius: THEME.radius.pill,
                    border: `1px solid ${THEME.colors.border}`,
                  }}
                >
                  {transcripts.length} turns
                </span>
              )}
            </div>
            <ChevronRightIcon size={13} color={THEME.colors.textMuted} />
          </div>
        </section>
      </div>

      {/* H. FLOATING BOTTOM LISTENING CONTROLS */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "10px 16px 12px 16px",
          backgroundColor: "rgba(250, 249, 246, 0.95)",
          backdropFilter: "blur(12px)",
          borderTop: `1px solid ${THEME.colors.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 100,
        }}
      >
        {!isConfigured ? (
          <button
            onClick={() => setCurrentView("settings")}
            style={{
              width: "100%",
              maxWidth: "380px",
              padding: "11px 18px",
              backgroundColor: THEME.colors.accentLavender,
              border: `1px solid ${THEME.colors.accentLavenderBorder}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.textPrimary,
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              boxShadow: THEME.shadows.sm,
              transition: THEME.transitions.fast,
            }}
          >
            <UserIcon size={13} color={THEME.colors.textPrimary} />
            <span>Configure Profile to Start</span>
          </button>
        ) : isListening ? (
          <button
            onClick={handleStopListening}
            style={{
              width: "100%",
              maxWidth: "380px",
              padding: "11px 18px",
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.accentCoralBorder}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.accentCoralDark,
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              boxShadow: THEME.shadows.sm,
              transition: THEME.transitions.fast,
            }}
          >
            <StopSquareIcon size={12} color={THEME.colors.accentCoralDark} />
            <span>Stop Listening</span>
          </button>
        ) : (
          <button
            onClick={handleStartListening}
            style={{
              width: "100%",
              maxWidth: "380px",
              padding: "11px 18px",
              backgroundColor: THEME.colors.accentLavender,
              border: `1px solid ${THEME.colors.accentLavenderBorder}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.textPrimary,
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              boxShadow: THEME.shadows.sm,
              transition: THEME.transitions.fast,
            }}
          >
            <MicrophoneIcon size={14} color={THEME.colors.textPrimary} />
            <span>Start Listening</span>
          </button>
        )}
      </div>
    </div>
  );
};
