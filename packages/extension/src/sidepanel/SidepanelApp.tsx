import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  SessionInfo,
  UserProfile,
  DEFAULT_PROFILE,
  formatCommaSeparatedList,
  parseCommaSeparatedList,
  validateProfile,
  ExtensionMessage,
  TranscriptSegment,
  MeetingEvent,
  EventDetector,
  DialogueAnalysis,
  getDialogueAnalysis,
  ParsedSentence,
} from "@oiu/shared";
import {
  extractCoreCalloutOrQuestion,
  generateSmartResponses,
  getInstantSmartResponses,
  SuggestedResponse,
} from "../services/aiService.js";

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

function getSuggestionsForEvent(event: MeetingEvent, currentProfile: UserProfile): SuggestedResponse[] {
  return getInstantSmartResponses(event, currentProfile);
}

export const SidepanelApp: React.FC = () => {
  const [session, setSession] = useState<SessionInfo>({
    sessionId: "",
    tabId: -1,
    meetingPlatform: "google_meet",
    state: "INACTIVE",
  });

  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [aliasesInput, setAliasesInput] = useState("");
  const [identifiersInput, setIdentifiersInput] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSavedMsg, setProfileSavedMsg] = useState(false);
  const [isCheckingTab, setIsCheckingTab] = useState(false);

  // Audio & Alert State
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [packetsCount, setPacketsCount] = useState<number>(0);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [activeAlert, setActiveAlert] = useState<MeetingEvent | null>(null);
  const [alertsHistory, setAlertsHistory] = useState<MeetingEvent[]>([]);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(true);
  const [copiedSuggestionIdx, setCopiedSuggestionIdx] = useState<number | null>(null);
  const [showWhatYouMissed, setShowWhatYouMissed] = useState(false);
  const [lastSpeechTime, setLastSpeechTime] = useState<number>(0);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [liveDialogue, setLiveDialogue] = useState<DialogueAnalysis | null>(null);

  // Gemini AI Key & Smart Responses State
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [isEditingAiKey, setIsEditingAiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [aiKeySavedMsg, setAiKeySavedMsg] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiResponsesMap, setAiResponsesMap] = useState<Record<string, SuggestedResponse[]>>({});
  const [currentAlertIndex, setCurrentAlertIndex] = useState<number>(0);
  const [showRawExcerpt, setShowRawExcerpt] = useState<boolean>(false);

  const geminiApiKeyRef = useRef(geminiApiKey);
  geminiApiKeyRef.current = geminiApiKey;

  const transcriptsRef = useRef(transcripts);
  transcriptsRef.current = transcripts;

  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript container to bottom when speech arrives
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcripts]);

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
    setShowRawExcerpt(false);
    setAlertsHistory((prev) => [event, ...prev.slice(0, 9)]);
    playAlertChime();

    // 0ms INSTANT smart grounded responses populated immediately
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

  const profileRef = React.useRef<UserProfile>(profile);
  profileRef.current = profile;

  const sessionRef = React.useRef<SessionInfo>(session);
  sessionRef.current = session;

  const detectorRef = React.useRef<EventDetector>(new EventDetector(profile));

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

  // Sync state ONCE on mount - completely eliminated recursive dependency loops
  useEffect(() => {
    // 1. Load saved profile, previous alerted hashes, and Gemini API key once on mount
    chrome.storage.local.get([PROFILE_STORAGE_KEY, ALERTED_HASHES_STORAGE_KEY, GEMINI_API_KEY_STORAGE], (res) => {
      if (res?.[PROFILE_STORAGE_KEY]) {
        const saved = res[PROFILE_STORAGE_KEY] as UserProfile;
        setProfile(saved);
        detectorRef.current.updateProfile(saved);
        setNameInput(saved.displayName || "");
        setAliasesInput(formatCommaSeparatedList(saved.aliases));
        setIdentifiersInput(formatCommaSeparatedList(saved.identifiers));
        setKeywordsInput(formatCommaSeparatedList(saved.keywords || []));
      } else {
        setIsEditingProfile(true);
      }

      if (res?.[ALERTED_HASHES_STORAGE_KEY] && Array.isArray(res[ALERTED_HASHES_STORAGE_KEY])) {
        detectorRef.current.importAlertedHashes(res[ALERTED_HASHES_STORAGE_KEY]);
        console.log(`[OiU] Restored ${res[ALERTED_HASHES_STORAGE_KEY].length} alerted hashes across sidepanel open.`);
      }

      if (res?.[GEMINI_API_KEY_STORAGE]) {
        setGeminiApiKey(res[GEMINI_API_KEY_STORAGE]);
        setApiKeyInput(res[GEMINI_API_KEY_STORAGE]);
      }
    });

    // 2. Fetch session state once on mount
    chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.session) setSession(response.session);
    });

    // 3. Attach message listener ONCE on mount
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

  const handleSaveProfile = () => {
    const newProfile: UserProfile = {
      displayName: nameInput.trim(),
      aliases: parseCommaSeparatedList(aliasesInput),
      identifiers: parseCommaSeparatedList(identifiersInput),
      keywords: parseCommaSeparatedList(keywordsInput),
    };

    const validation = validateProfile(newProfile);
    if (!validation.valid) {
      setProfileError(validation.errors[0]);
      return;
    }

    setProfileError(null);

    chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: newProfile }, () => {
      setProfile(newProfile);
      detectorRef.current.updateProfile(newProfile);
      setIsEditingProfile(false);
      setProfileSavedMsg(true);
      setTimeout(() => setProfileSavedMsg(false), 2500);

      chrome.runtime.sendMessage({
        type: "PROFILE_UPDATED",
        payload: newProfile,
      }).catch(() => {});
    });
  };

  const handleSaveApiKey = () => {
    const key = apiKeyInput.trim();
    chrome.storage.local.set({ [GEMINI_API_KEY_STORAGE]: key }, () => {
      setGeminiApiKey(key);
      setIsEditingAiKey(false);
      setAiKeySavedMsg(true);
      setTimeout(() => setAiKeySavedMsg(false), 2500);

      // If there is an active alert, immediately re-run AI generation with the new key!
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
      setIsEditingProfile(true);
      setProfileError("Please configure your display name before starting.");
      return;
    }

    // Immediately update local React state and ref so listening is instant
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
    setPacketsCount(0);
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

  const handleClearTranscripts = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTranscripts([]);
  };

  const handleTestAlert = () => {
    const testName = profile.displayName || "Aryan";
    const testEvent: MeetingEvent = {
      id: `test_${Date.now()}`,
      sessionId: session.sessionId || "test_session",
      type: "NAME_MENTION",
      transcriptExcerpt: `${testName}, can you hear us on the call?`,
      evidenceSegmentIds: ["seg_test"],
      timestampMs: Date.now(),
      confidence: 0.99,
      urgency: "high",
      explanation: `Test alert for ${testName}.`,
    };
    triggerAlert(testEvent);
  };

  const handleTurnOnCaptions = () => {
    if (session.tabId && session.tabId > 0) {
      chrome.tabs.sendMessage(session.tabId, { type: "TOGGLE_MEET_CAPTIONS" }).catch(() => {});
    } else {
      chrome.tabs.query({ url: "*://meet.google.com/*" }, (tabs) => {
        if (tabs && tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_MEET_CAPTIONS" }).catch(() => {});
        }
      });
    }
  };

  const isListening = session.state === "LISTENING";
  const isMeetReady = session.state === "SUPPORTED_TAB_READY";

  const getStatusBadgeStyle = () => {
    switch (session.state) {
      case "LISTENING":
        return { bg: "#dcfce7", text: "#15803d", dot: "#22c55e", label: "Listening" };
      case "SUPPORTED_TAB_READY":
        return { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6", label: "Meet Ready" };
      case "CONNECTING":
        return { bg: "#fef3c7", text: "#b45309", dot: "#f59e0b", label: "Connecting" };
      case "ERROR":
        return { bg: "#fee2e2", text: "#b91c1c", dot: "#ef4444", label: "Error" };
      case "STOPPED":
        return { bg: "#f3f4f6", text: "#4b5563", dot: "#9ca3af", label: "Stopped" };
      default:
        return { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af", label: "Inactive" };
    }
  };

  const badge = getStatusBadgeStyle();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 16, boxSizing: "border-box", overflowY: "auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>OiU</h1>
          <span style={{ fontSize: 11, color: "#6b7280" }}>Meeting Copilot</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={fetchSessionState}
            title="Refresh status"
            style={{
              background: "none",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "3px 6px",
              cursor: "pointer",
              fontSize: 12,
              color: isCheckingTab ? "#2563eb" : "#6b7280",
            }}
          >
            {isCheckingTab ? "..." : "↻"}
          </button>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 9999,
              backgroundColor: badge.bg,
              color: badge.text,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: badge.dot,
              }}
            />
            {badge.label}
          </div>
        </div>
      </div>

      {/* ERROR / ISOLATION NOTICE */}
      {session.state === "ERROR" && (
        <div
          style={{
            backgroundColor: "#fff7ed",
            border: "1px solid #f97316",
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <strong style={{ fontSize: 13, color: "#9a3412" }}>OiU Paused (Chrome is Unaffected)</strong>
          </div>
          <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#7c2d12", lineHeight: 1.4 }}>
            {session.errorMessage || "Google Meet connection was paused or tab was closed."}
          </p>
          <button
            onClick={handleResetSession}
            style={{
              padding: "6px 12px",
              backgroundColor: "#ea580c",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reset OiU
          </button>
        </div>
      )}

      {/* ACTIVE ALERT CARD (Top Priority Alert Banner) */}
      {activeAlert && (() => {
        const displayAlert = (alertsHistory.length > 0 && alertsHistory[currentAlertIndex]) ? alertsHistory[currentAlertIndex] : activeAlert;
        const {
          coreText,
          isQuestion,
          topic,
          activeFollowUp,
          relationToPrevious,
          relationReason,
          addressedToOther,
          otherTarget,
        } = extractCoreCalloutOrQuestion(displayAlert.transcriptExcerpt, profile);
        const suggestions = aiResponsesMap[displayAlert.id] || getSuggestionsForEvent(displayAlert, profile);

        return (
          <div
            style={{
              backgroundColor: currentAlertIndex === 0 ? "#fef2f2" : "#fffbeb",
              border: currentAlertIndex === 0 ? "3px solid #dc2626" : "2px solid #d97706",
              borderRadius: 8,
              padding: 14,
              marginBottom: 16,
              boxShadow: currentAlertIndex === 0 ? "0 8px 24px rgba(220, 38, 38, 0.25)" : "0 4px 14px rgba(217, 119, 6, 0.2)",
              transition: "all 0.25s ease",
            }}
          >
            {/* Banner if reviewing a past alert */}
            {currentAlertIndex > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                  padding: "6px 10px",
                  backgroundColor: "#fef3c7",
                  border: "1px solid #fde68a",
                  borderRadius: 6,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e" }}>
                  ⏮ Viewing Past Alert #{currentAlertIndex + 1} ({alertsHistory.length - currentAlertIndex} of {alertsHistory.length})
                </span>
                <button
                  onClick={() => setCurrentAlertIndex(0)}
                  style={{
                    backgroundColor: "#dc2626",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 4,
                    padding: "3px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Return to Live Alert ➔
                </button>
              </div>
            )}

            {/* Alert Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>{currentAlertIndex === 0 ? "🚨" : "⏮"}</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong style={{ fontSize: 15, color: currentAlertIndex === 0 ? "#991b1b" : "#92400e" }}>
                      {displayAlert.type === "NAME_MENTION" && "You were called!"}
                      {displayAlert.type === "IDENTIFIER_MENTION" && "Your ID was called!"}
                      {displayAlert.type === "KEYWORD_MENTION" && "Monitored Keyword Mentioned!"}
                      {displayAlert.type === "ATTENDANCE_CALL" && "Roll Call / Attendance check!"}
                      {displayAlert.type === "DIRECT_QUESTION" && "Question for you!"}
                    </strong>
                    {currentAlertIndex === 0 ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          backgroundColor: "#dc2626",
                          color: "#ffffff",
                          padding: "2px 7px",
                          borderRadius: 4,
                          letterSpacing: "0.5px",
                          boxShadow: "0 0 6px rgba(220, 38, 38, 0.6)",
                        }}
                      >
                        ● LIVE NOW
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: "#fef3c7", color: "#b45309", padding: "1px 6px", borderRadius: 4 }}>
                        PAST #{currentAlertIndex + 1}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: currentAlertIndex === 0 ? "#7f1d1d" : "#78350f", marginTop: 2 }}>
                    Triggered at {new Date(displayAlert.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    {currentAlertIndex === 0 ? " (Current Live Turn)" : ` (${Math.max(1, Math.round((Date.now() - displayAlert.timestampMs) / 60000))}m ago)`}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  stopAlertSound();
                  setActiveAlert(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#991b1b",
                  cursor: "pointer",
                  padding: "0 4px",
                }}
                title="Dismiss Alert"
              >
                ✕
              </button>
            </div>

            {/* Pagination Controls across previous and current alerts */}
            {alertsHistory.length > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                  padding: "4px 8px",
                  backgroundColor: currentAlertIndex === 0 ? "#fee2e2" : "#fef3c7",
                  borderRadius: 6,
                  border: currentAlertIndex === 0 ? "1px solid #fca5a5" : "1px solid #fde68a",
                }}
              >
                <button
                  disabled={currentAlertIndex >= alertsHistory.length - 1}
                  onClick={() => setCurrentAlertIndex((i) => Math.min(alertsHistory.length - 1, i + 1))}
                  style={{
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: currentAlertIndex >= alertsHistory.length - 1 ? "#f3f4f6" : "#ffffff",
                    color: currentAlertIndex >= alertsHistory.length - 1 ? "#9ca3af" : "#991b1b",
                    border: "1px solid #fca5a5",
                    borderRadius: 4,
                    cursor: currentAlertIndex >= alertsHistory.length - 1 ? "not-allowed" : "pointer",
                  }}
                >
                  ◀ Previous Alert
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: currentAlertIndex === 0 ? "#991b1b" : "#92400e" }}>
                    {currentAlertIndex === 0 ? "Latest Alert" : `Alert ${currentAlertIndex + 1} of ${alertsHistory.length}`}
                  </span>
                  {currentAlertIndex > 0 && (
                    <button
                      onClick={() => setCurrentAlertIndex(0)}
                      style={{
                        padding: "1px 6px",
                        fontSize: 10,
                        fontWeight: 600,
                        backgroundColor: "#dc2626",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 3,
                        cursor: "pointer",
                      }}
                    >
                      Go to Current ↗
                    </button>
                  )}
                </div>
                <button
                  disabled={currentAlertIndex <= 0}
                  onClick={() => setCurrentAlertIndex((i) => Math.max(0, i - 1))}
                  style={{
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: currentAlertIndex <= 0 ? "#f3f4f6" : "#ffffff",
                    color: currentAlertIndex <= 0 ? "#9ca3af" : "#991b1b",
                    border: "1px solid #fca5a5",
                    borderRadius: 4,
                    cursor: currentAlertIndex <= 0 ? "not-allowed" : "pointer",
                  }}
                >
                  Next Alert ▶
                </button>
              </div>
            )}

            {/* Clean Core Question / Callout Box (Cleans up caption mess!) */}
            <div
              style={{
                backgroundColor: "#ffffff",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid #fecaca",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#991b1b", textTransform: "uppercase" }}>
                  {isQuestion ? "❓ Direct Question Asked:" : "📣 Speech Callout:"}
                </span>
                {displayAlert.transcriptExcerpt !== coreText && (
                  <button
                    onClick={() => setShowRawExcerpt(!showRawExcerpt)}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: 10,
                      color: "#991b1b",
                      textDecoration: "underline",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {showRawExcerpt ? "Hide raw text" : "View raw caption"}
                  </button>
                )}
              </div>

              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.35 }}>
                "{coreText || displayAlert.transcriptExcerpt}"
              </div>

              {/* Connected Follow-up Sentence (e.g. "tatha 117 aur ine Aryan 17") */}
              {activeFollowUp && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "6px 8px",
                    backgroundColor: "#eff6ff",
                    borderRadius: 4,
                    border: "1px solid #bfdbfe",
                    fontSize: 11,
                    color: "#1e40af",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 10, textTransform: "uppercase" }}>🔗 Connected Follow-up:</span>
                    <span style={{ fontSize: 9, fontWeight: 700, backgroundColor: "#dbeafe", color: "#1d4ed8", padding: "1px 5px", borderRadius: 3 }}>
                      {relationReason || "Connected"}
                    </span>
                  </div>
                  <div style={{ fontStyle: "italic", fontWeight: 600 }}>"{activeFollowUp}"</div>
                </div>
              )}

              {/* Addressed to other participant warning (e.g. "Swagat roll 118 you answer") */}
              {addressedToOther && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "6px 8px",
                    backgroundColor: "#fef3c7",
                    borderRadius: 4,
                    border: "1px solid #fde68a",
                    fontSize: 11,
                    color: "#92400e",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 10, textTransform: "uppercase", marginBottom: 2 }}>
                    ⚠️ Speaker Shifted to Another Participant
                  </div>
                  <div>Addressed to {otherTarget || "another student"}. This question may no longer be for you.</div>
                </div>
              )}

              {showRawExcerpt && displayAlert.transcriptExcerpt !== coreText && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed #fecaca", fontSize: 10, color: "#6b7280", fontStyle: "italic", maxHeight: 50, overflowY: "auto" }}>
                  Raw stream: "{displayAlert.transcriptExcerpt}"
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7f1d1d", marginBottom: 10 }}>
              <span>{displayAlert.explanation}</span>
              <span>{Math.round(displayAlert.confidence * 100)}% confidence</span>
            </div>

            {/* Grounded Response Suggestions */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#991b1b", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Suggested Responses (1-Click Copy)
                </div>
                {geminiApiKey && (
                  <button
                    onClick={() => handleRegenerateAi(displayAlert)}
                    disabled={isGeneratingAi}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#2563eb",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ⚡ Regenerate AI
                  </button>
                )}
              </div>

              {isGeneratingAi && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "6px 8px", backgroundColor: "#eff6ff", borderRadius: 4, border: "1px solid #bfdbfe", fontSize: 11, color: "#1d4ed8", fontWeight: 600 }}>
                  <span>⚡</span>
                  <span>Formulating intelligent answer with Gemini Flash...</span>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map((sug, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: "#ffffff",
                      borderRadius: 6,
                      padding: "6px 8px",
                      border: "1px solid #fecaca",
                      fontSize: 12,
                      color: "#1f2937",
                    }}
                  >
                    <div style={{ flex: 1, marginRight: 8 }}>
                      <span style={{ fontWeight: 600, color: "#991b1b", marginRight: 6 }}>
                        {sug.label}:
                      </span>
                      <span>"{sug.text}"</span>
                    </div>
                    <button
                      onClick={() => handleCopySuggestion(sug.text, i)}
                      style={{
                        padding: "3px 8px",
                        backgroundColor: copiedSuggestionIdx === i ? "#16a34a" : "#f3f4f6",
                        color: copiedSuggestionIdx === i ? "#ffffff" : "#374151",
                        border: "1px solid #d1d5db",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {copiedSuggestionIdx === i ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                ))}
              </div>

              {!geminiApiKey && isQuestion && (
                <div
                  onClick={() => setIsEditingAiKey(true)}
                  style={{
                    marginTop: 6,
                    padding: "6px 8px",
                    backgroundColor: "#fef3c7",
                    borderRadius: 4,
                    border: "1px solid #fde68a",
                    fontSize: 10,
                    color: "#92400e",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>💡 Add your free Gemini key below for instant factual AI answers!</span>
                  <span style={{ fontWeight: 700, color: "#b45309" }}>Add Key →</span>
                </div>
              )}
            </div>

            {/* Context Recovery ("What you missed") */}
            {transcripts.length > 1 && (
              <div style={{ marginBottom: 10 }}>
                <button
                  onClick={() => setShowWhatYouMissed(!showWhatYouMissed)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 11,
                    color: "#991b1b",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {showWhatYouMissed ? "Hide prior context" : "🔍 What you missed (prior speech)"}
                </button>
                {showWhatYouMissed && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: 8,
                      backgroundColor: "#ffffff",
                      borderRadius: 6,
                      border: "1px solid #fecaca",
                      fontSize: 11,
                    color: "#4b5563",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {transcripts.slice(-4, -1).map((t) => (
                    <div key={t.id}>
                      <strong style={{ color: "#1f2937" }}>{t.speakerId || "Speaker"}:</strong> {t.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => {
              stopAlertSound();
              setActiveAlert(null);
            }}
            style={{
              width: "100%",
              padding: "7px 12px",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Dismiss & Silence Alert
          </button>
        </div>
      );
    })()}

      {/* Main Status & Controls Card */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          padding: 16,
          marginBottom: 16,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        {isListening ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: "#22c55e",
                  boxShadow: "0 0 0 3px rgba(34, 197, 94, 0.2)",
                }}
              />
              <strong style={{ fontSize: 14, color: "#15803d" }}>Actively Listening</strong>
              <span style={{ fontSize: 10, color: "#166534", backgroundColor: "#dcfce7", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>
                Zero-Impact
              </span>
            </div>

            <p style={{ margin: "0 0 12px 0", fontSize: 12, color: "#4b5563", lineHeight: 1.4 }}>
              Monitoring for: <strong>{profile.displayName || "Name"}</strong>
              {profile.identifiers.length > 0 && ` (${profile.identifiers.join(", ")})`}
            </p>

            {/* Real-time Current Spoken Dialogue & Sentence Flow */}
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                backgroundColor: "#f8fafc",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13 }}>💬</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
                    Current Dialogue
                  </span>
                </div>
                {liveDialogue?.activeSentence ? (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      backgroundColor: liveDialogue.activeSentence.relation === "connected" ? "#dbeafe" : "#f1f5f9",
                      color: liveDialogue.activeSentence.relation === "connected" ? "#1e40af" : "#475569",
                      padding: "2px 6px",
                      borderRadius: 4,
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    {liveDialogue.activeSentence.relation === "connected" ? "🔗 CONNECTED" : "● LIVE ACTIVE"}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: "#64748b" }}>Live Call Stream</span>
                )}
              </div>

              {liveDialogue && liveDialogue.sentences.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Previous Sentences in this dialogue sequence */}
                  {liveDialogue.previousSentences.map((s, idx) => (
                    <div
                      key={s.id || idx}
                      style={{
                        fontSize: 11,
                        color: "#475569",
                        padding: "5px 8px",
                        borderLeft: "3px solid #94a3b8",
                        backgroundColor: "#f1f5f9",
                        borderRadius: "0 4px 4px 0",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: "#64748b", marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, color: "#475569" }}>
                          [✓ OLD / COMPLETED]
                        </span>
                        <span>{s.isQuestion ? "❓ Question asked" : "Speech turn"}</span>
                      </div>
                      <div style={{ color: "#334155" }}>"{s.text}"</div>
                    </div>
                  ))}

                  {/* Active / Current Live Sentence */}
                  <div
                    style={{
                      fontSize: 12,
                      color: "#0f172a",
                      padding: "7px 10px",
                      borderLeft: liveDialogue.activeSentence.relation === "connected" ? "3px solid #2563eb" : "3px solid #16a34a",
                      backgroundColor: liveDialogue.activeSentence.relation === "connected" ? "#eff6ff" : "#f0fdf4",
                      borderRadius: "0 4px 4px 0",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, marginBottom: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span
                          style={{
                            fontWeight: 800,
                            color: "#ffffff",
                            backgroundColor: liveDialogue.activeSentence.relation === "connected" ? "#2563eb" : "#16a34a",
                            padding: "1px 5px",
                            borderRadius: 3,
                          }}
                        >
                          ● CURRENT
                        </span>
                        <span style={{ fontWeight: 600, color: "#334155" }}>
                          {liveDialogue.activeSentence.speakerId || "Speaker"}
                        </span>
                      </div>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 9,
                          color: liveDialogue.activeSentence.relation === "connected" ? "#1d4ed8" : "#059669",
                        }}
                      >
                        {liveDialogue.activeSentence.relationReason}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, lineHeight: 1.35 }}>
                      "{liveDialogue.activeSentence.text}"
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "#64748b", padding: "4px 0", lineHeight: 1.4 }}>
                  <div>Listening for dialogue... Captions will show here with Old vs New and Connected vs Disconnected differentiation.</div>
                  <div style={{ marginTop: 8, padding: "8px 10px", backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6, color: "#0369a1" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 11 }}>💡 Google Meet Captions</span>
                      <button
                        onClick={handleTurnOnCaptions}
                        style={{
                          padding: "3px 8px",
                          fontSize: 10,
                          fontWeight: 700,
                          backgroundColor: "#0284c7",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >
                        Turn On Meet Captions
                      </button>
                    </div>
                    <div style={{ fontSize: 10, marginTop: 4, color: "#0c4a6e" }}>
                      Meet captions must be ON so OiU can read the speech. You can also press <strong>C</strong> in Meet.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live Audio & Speech Activity Meter */}
            <div
              style={{
                marginBottom: 12,
                padding: "8px 10px",
                backgroundColor: "#f0fdf4",
                borderRadius: 6,
                border: "1px solid #bbf7d0",
              }}
            >
              <style>{`
                @keyframes oiuWaveActive {
                  0% { transform: scaleY(0.2); }
                  50% { transform: scaleY(1.0); }
                  100% { transform: scaleY(0.28); }
                }
                @keyframes oiuWaveIdle {
                  0% { transform: scaleY(0.18); opacity: 0.45; }
                  50% { transform: scaleY(0.42); opacity: 0.8; }
                  100% { transform: scaleY(0.18); opacity: 0.45; }
                }
              `}</style>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: isVoiceActive ? "#16a34a" : "#22c55e",
                      boxShadow: isVoiceActive
                        ? "0 0 0 4px rgba(22, 163, 74, 0.4)"
                        : "0 0 0 3px rgba(34, 197, 94, 0.3)",
                      transition: "all 0.2s ease",
                    }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#166534" }}>
                    Live Audio & Speech Activity
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: isVoiceActive ? "#15803d" : "#166534",
                    fontWeight: 700,
                    backgroundColor: isVoiceActive ? "#bbf7d0" : "#dcfce7",
                    padding: "1px 6px",
                    borderRadius: 4,
                    transition: "all 0.2s ease",
                  }}
                >
                  {isVoiceActive ? "● VOICE ACTIVE" : "LISTENING"}
                </span>
              </div>

              {/* Dynamic visual audio wave activity bars */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 16, margin: "6px 0" }}>
                {[0.4, 0.75, 1.0, 0.65, 0.9, 0.5, 0.95, 0.7, 0.45, 0.85, 0.9, 0.55, 0.8, 0.4].map((scale, i) => {
                  const dynamicHeight = Math.max(
                    0.18,
                    audioLevel > 0.04
                      ? Math.min(1.0, audioLevel * scale * 2.5)
                      : isVoiceActive
                      ? scale * 0.7
                      : scale * 0.25
                  );
                  return (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: "100%",
                        backgroundColor: isVoiceActive || audioLevel > 0.05 ? "#16a34a" : "#22c55e",
                        borderRadius: 2,
                        transformOrigin: "bottom",
                        transform: `scaleY(${dynamicHeight})`,
                        transition: "transform 0.08s ease",
                        animation: isVoiceActive
                          ? `oiuWaveActive 0.5s ease-in-out infinite alternate ${i * 0.04}s`
                          : `oiuWaveIdle 2s ease-in-out infinite alternate ${i * 0.08}s`,
                      }}
                    />
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#15803d" }}>
                <span>Real-time voice stream active</span>
                <span>{transcripts.length} speech segments captured</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleStopListening}
                style={{
                  flex: 2,
                  padding: "9px 14px",
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Stop Listening
              </button>
              <button
                onClick={handleTestAlert}
                title="Trigger a test alert"
                style={{
                  flex: 1,
                  padding: "9px 8px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontWeight: 500,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Test Alert
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ margin: "0 0 12px 0", fontSize: 13, color: isMeetReady ? "#1e3a8a" : "#4b5563" }}>
              {isMeetReady
                ? "Google Meet detected and ready!"
                : "Open or switch to Google Meet to begin."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleStartListening}
                style={{
                  flex: 2,
                  padding: "9px 14px",
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Start Listening
              </button>
              <button
                onClick={handleTestAlert}
                title="Test how alerts look and sound"
                style={{
                  flex: 1,
                  padding: "9px 8px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontWeight: 500,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Test Alert
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live Transcript (Collapsible with Clear option) */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          padding: 12,
          marginBottom: 16,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        <div
          onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Live Transcript</span>
            <span
              style={{
                fontSize: 11,
                padding: "1px 6px",
                borderRadius: 9999,
                backgroundColor: "#f3f4f6",
                color: "#6b7280",
              }}
            >
              {transcripts.length}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {transcripts.length > 0 && (
              <button
                onClick={handleClearTranscripts}
                style={{
                  backgroundColor: "#fee2e2",
                  border: "1px solid #fca5a5",
                  borderRadius: 4,
                  color: "#dc2626",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "2px 8px",
                }}
                title="Clear all transcripts"
              >
                Clear
              </button>
            )}
            <span style={{ fontSize: 12, color: "#6b7280" }}>{isTranscriptOpen ? "▲" : "▼"}</span>
          </div>
        </div>

        {isTranscriptOpen && (
          <div
            ref={transcriptContainerRef}
            style={{
              marginTop: 10,
              maxHeight: 220,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingRight: 2,
            }}
          >
            {transcripts.length === 0 ? (
              <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic", padding: "6px 0", lineHeight: 1.4 }}>
                {isListening ? "Listening... Speech from call will appear here in real time." : "No transcripts yet."}
              </div>
            ) : (
              transcripts.map((t, idx) => {
                const isNewest = idx === transcripts.length - 1;
                const secondsAgo = Math.max(0, Math.round((Date.now() - t.endMs) / 1000));
                const relativeTime = secondsAgo < 5 ? "Just now" : secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.round(secondsAgo / 60)}m ago`;

                return (
                  <div
                    key={t.id}
                    style={{
                      fontSize: 12,
                      backgroundColor: isNewest ? "#eff6ff" : "#ffffff",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: isNewest ? "2px solid #3b82f6" : "1px solid #e2e8f0",
                      boxShadow: isNewest ? "0 2px 8px rgba(59, 130, 246, 0.18)" : "0 1px 2px rgba(0,0,0,0.03)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700, color: isNewest ? "#1d4ed8" : "#475569" }}>
                          {t.speakerId || "Speaker"} {isNewest && "(Active Now)"}
                        </span>
                        {isNewest ? (
                          <span style={{ fontSize: 9, fontWeight: 800, backgroundColor: "#2563eb", color: "#ffffff", padding: "1px 5px", borderRadius: 3, letterSpacing: 0.5 }}>
                            ● CURRENT
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, fontWeight: 600, backgroundColor: "#f1f5f9", color: "#64748b", padding: "1px 4px", borderRadius: 3 }}>
                            PAST
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {!t.isFinal ? (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#059669", backgroundColor: "#d1fae5", padding: "1px 5px", borderRadius: 3 }}>
                            ● Speaking...
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, color: "#6b7280" }}>✓</span>
                        )}
                        <span style={{ color: isNewest ? "#1e40af" : "#94a3b8" }}>
                          {relativeTime} ({new Date(t.endMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })})
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        lineHeight: 1.45,
                        color: isNewest ? "#0f172a" : "#334155",
                        fontWeight: isNewest ? 600 : 400,
                        fontSize: isNewest ? 12.5 : 12,
                      }}
                    >
                      {t.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* AI Answer Engine & Free Gemini Key Settings Card */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          padding: 16,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>
              AI Answer Engine (Free Gemini API)
            </h2>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 4,
              backgroundColor: geminiApiKey ? "#dcfce7" : "#fef3c7",
              color: geminiApiKey ? "#15803d" : "#b45309",
            }}
          >
            {geminiApiKey ? "ACTIVE (FREE)" : "OPTIONAL"}
          </span>
        </div>

        {aiKeySavedMsg && (
          <div
            style={{
              padding: "6px 10px",
              marginBottom: 10,
              backgroundColor: "#dcfce7",
              color: "#166534",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            ✓ Gemini API Key saved successfully.
          </div>
        )}

        <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#4b5563", lineHeight: 1.4 }}>
          Generate instant, accurate, factual answers to direct questions asked in Google Meet (e.g. <em>"What is mitochondria?"</em>).
        </p>

        {isEditingAiKey ? (
          <div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                Google Gemini API Key (100% Free)
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                Don't have a key?{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#2563eb", fontWeight: 600 }}
                >
                  Get free API key at Google AI Studio ↗
                </a>{" "}
                (Takes 10 seconds, zero billing required)
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSaveApiKey}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Save API Key
              </button>
              <button
                onClick={() => {
                  setApiKeyInput(geminiApiKey);
                  setIsEditingAiKey(false);
                }}
                style={{
                  padding: "7px 12px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 500,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#374151" }}>
              {geminiApiKey ? (
                <span style={{ color: "#15803d", fontWeight: 600 }}>
                  ✓ Gemini Flash Active ({geminiApiKey.substring(0, 7)}••••)
                </span>
              ) : (
                <span style={{ color: "#6b7280" }}>
                  Using grounded topic templates (Add key for full AI answers)
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setApiKeyInput(geminiApiKey);
                setIsEditingAiKey(true);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#2563eb",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {geminiApiKey ? "Update Key" : "Add Free Key"}
            </button>
          </div>
        )}
      </div>

      {/* Recent Alerts History */}
      {alertsHistory.length > 0 && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            padding: 12,
            marginBottom: 16,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Recent Alerts</span>
            <button
              onClick={() => setAlertsHistory([])}
              style={{ background: "none", border: "none", color: "#6b7280", fontSize: 11, cursor: "pointer" }}
            >
              Clear
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {alertsHistory.map((alt) => (
              <div
                key={alt.id}
                style={{
                  padding: "6px 8px",
                  borderRadius: 4,
                  backgroundColor: "#fef2f2",
                  borderLeft: "2px solid #ef4444",
                  fontSize: 11,
                  color: "#991b1b",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                  {new Date(alt.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {alt.explanation}
                </div>
                <div style={{ color: "#374151", fontStyle: "italic" }}>"{alt.transcriptExcerpt}"</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profile / Target Identifiers Card */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          padding: 16,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>
            Target Profile & Identifiers
          </h2>
          {!isEditingProfile && (
            <button
              onClick={() => setIsEditingProfile(true)}
              style={{
                background: "none",
                border: "none",
                color: "#2563eb",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Edit
            </button>
          )}
        </div>

        {profileSavedMsg && (
          <div
            style={{
              padding: "6px 10px",
              marginBottom: 10,
              backgroundColor: "#dcfce7",
              color: "#166534",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            Profile saved successfully.
          </div>
        )}

        {isEditingProfile ? (
          <div>
            {profileError && (
              <div
                style={{
                  padding: "6px 10px",
                  marginBottom: 10,
                  backgroundColor: "#fee2e2",
                  color: "#991b1b",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                {profileError}
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                Display Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Aryan"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                Aliases (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. Ari, Aryan S"
                value={aliasesInput}
                onChange={(e) => setAliasesInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                Registration / Employee IDs (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. 21BCE1042, EMP-4021, 117"
                value={identifiersInput}
                onChange={(e) => setIdentifiersInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                Custom Alert Keywords (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. project alpha, budget, sprint, architecture, deadline"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                OiU alerts you whenever your name, IDs, or any of these custom keywords are spoken.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSaveProfile}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Save Profile
              </button>
              {profile.displayName && (
                <button
                  onClick={() => {
                    setNameInput(profile.displayName);
                    setAliasesInput(formatCommaSeparatedList(profile.aliases));
                    setIdentifiersInput(formatCommaSeparatedList(profile.identifiers));
                    setKeywordsInput(formatCommaSeparatedList(profile.keywords || []));
                    setIsEditingProfile(false);
                  }}
                  style={{
                    padding: "7px 12px",
                    backgroundColor: "#f3f4f6",
                    color: "#374151",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: 500,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Display Name</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                {profile.displayName || <span style={{ color: "#9ca3af" }}>Not configured</span>}
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Aliases</div>
              <div style={{ fontSize: 13, color: "#374151" }}>
                {profile.aliases.length > 0 ? (
                  profile.aliases.map((a, i) => (
                    <span
                      key={i}
                      style={{
                        display: "inline-block",
                        backgroundColor: "#f3f4f6",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 11,
                        marginRight: 4,
                        marginTop: 2,
                      }}
                    >
                      {a}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "#9ca3af" }}>None</span>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Registration / ID Numbers</div>
              <div style={{ fontSize: 13, color: "#374151" }}>
                {profile.identifiers.length > 0 ? (
                  profile.identifiers.map((id, i) => (
                    <span
                      key={i}
                      style={{
                        display: "inline-block",
                        backgroundColor: "#f3f4f6",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 11,
                        marginRight: 4,
                        marginTop: 2,
                        fontFamily: "monospace",
                      }}
                    >
                      {id}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "#9ca3af" }}>None</span>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Custom Monitored Keywords</div>
              <div style={{ fontSize: 13, color: "#374151" }}>
                {(profile.keywords || []).length > 0 ? (
                  profile.keywords.map((kw, i) => (
                    <span
                      key={i}
                      style={{
                        display: "inline-block",
                        backgroundColor: "#e0f2fe",
                        color: "#0369a1",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 11,
                        marginRight: 4,
                        marginTop: 2,
                        fontWeight: 600,
                      }}
                    >
                      🏷️ {kw}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "#9ca3af" }}>None (alert on name & IDs only)</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Answer Engine & Free Gemini Key Settings Card */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          padding: 16,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>
              AI Answer Engine (Free Gemini API)
            </h2>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 4,
              backgroundColor: geminiApiKey ? "#dcfce7" : "#fef3c7",
              color: geminiApiKey ? "#15803d" : "#b45309",
            }}
          >
            {geminiApiKey ? "ACTIVE (FREE)" : "OPTIONAL"}
          </span>
        </div>

        {aiKeySavedMsg && (
          <div
            style={{
              padding: "6px 10px",
              marginBottom: 10,
              backgroundColor: "#dcfce7",
              color: "#166534",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            ✓ Gemini API Key saved successfully.
          </div>
        )}

        <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#4b5563", lineHeight: 1.4 }}>
          Generate instant, accurate, factual answers to direct questions asked in Google Meet (e.g. <em>"What is mitochondria?"</em>).
        </p>

        {isEditingAiKey ? (
          <div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                Google Gemini API Key (100% Free)
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                Don't have a key?{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#2563eb", fontWeight: 600 }}
                >
                  Get free API key at Google AI Studio ↗
                </a>{" "}
                (Takes 10 seconds, zero billing required)
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSaveApiKey}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Save API Key
              </button>
              <button
                onClick={() => {
                  setApiKeyInput(geminiApiKey);
                  setIsEditingAiKey(false);
                }}
                style={{
                  padding: "7px 12px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 500,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#374151" }}>
              {geminiApiKey ? (
                <span style={{ color: "#15803d", fontWeight: 600 }}>
                  ✓ Gemini Flash Active ({geminiApiKey.substring(0, 7)}••••)
                </span>
              ) : (
                <span style={{ color: "#6b7280" }}>
                  Using grounded topic templates (Add key for full AI answers)
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setApiKeyInput(geminiApiKey);
                setIsEditingAiKey(true);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#2563eb",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {geminiApiKey ? "Update Key" : "Add Free Key"}
            </button>
          </div>
        )}
      </div>


    </div>
  );
};
