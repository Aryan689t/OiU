import React, { useState, useEffect } from "react";
import { UserProfile, formatCommaSeparatedList, parseCommaSeparatedList, validateProfile } from "@oiu/shared";
import { THEME } from "./theme";
import {
  ArrowLeftIcon,
  UserIcon,
  CheckIcon,
  MicrophoneIcon,
  HashIcon,
  TagIcon,
  SparklesIcon,
} from "./icons";
import {
  GROQ_API_KEY_STORAGE,
  LISTENING_MODE_STORAGE,
  testGroqApiKey,
} from "../audio/audioEngine";

interface SettingsViewProps {
  profile: UserProfile;
  geminiApiKey: string;
  onSaveProfile: (profile: UserProfile) => void;
  onSaveApiKey: (key: string) => void;
  onTestAlert: () => void;
  onPlayChime: () => void;
  onTurnOnCaptions: () => void;
  onKickstartCaptions?: () => void;
  onResetSession: () => void;
  onClearTranscripts: () => void;
  onClearAlertsHistory: () => void;
  onClose: () => void;
}

type SettingsTab = "profile" | "audio" | "system";

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  onSaveProfile,
  onTestAlert,
  onPlayChime,
  onResetSession,
  onClearTranscripts,
  onClearAlertsHistory,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  // Profile form state
  const [nameInput, setNameInput] = useState(profile.displayName || "");
  const [aliasesInput, setAliasesInput] = useState(formatCommaSeparatedList(profile.aliases));
  const [identifiersInput, setIdentifiersInput] = useState(formatCommaSeparatedList(profile.identifiers));
  const [keywordsInput, setKeywordsInput] = useState(formatCommaSeparatedList(profile.keywords || []));
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState(false);

  // Pure Audio Engine & Groq Whisper state
  const [groqKeyInput, setGroqKeyInput] = useState("");
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [groqSuccessMsg, setGroqSuccessMsg] = useState(false);
  const [isTestingGroq, setIsTestingGroq] = useState(false);
  const [groqTestResult, setGroqTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [listeningMode, setListeningMode] = useState<"audio_only" | "dual">("audio_only");

  // Confirm state for reset session
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([GROQ_API_KEY_STORAGE, LISTENING_MODE_STORAGE], (res) => {
        if (res?.[GROQ_API_KEY_STORAGE]) {
          setGroqKeyInput(res[GROQ_API_KEY_STORAGE]);
        }
        if (res?.[LISTENING_MODE_STORAGE]) {
          setListeningMode(res[LISTENING_MODE_STORAGE]);
        }
      });
    }
  }, []);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    onSaveProfile(newProfile);
    setProfileSuccessMsg(true);
    setTimeout(() => setProfileSuccessMsg(false), 2400);
  };

  const handleGroqSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ [GROQ_API_KEY_STORAGE]: groqKeyInput.trim() }, () => {
        setGroqSuccessMsg(true);
        setTimeout(() => setGroqSuccessMsg(false), 2400);
      });
    }
  };

  const handleTestGroq = async () => {
    setIsTestingGroq(true);
    setGroqTestResult(null);
    try {
      const res = await testGroqApiKey(groqKeyInput.trim());
      setGroqTestResult(res);
      if (res.success && typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ [GROQ_API_KEY_STORAGE]: groqKeyInput.trim() });
      }
    } catch (e: any) {
      setGroqTestResult({ success: false, message: e?.message || "Connection test failed." });
    } finally {
      setIsTestingGroq(false);
    }
  };

  const handleModeChange = (mode: "audio_only" | "dual") => {
    setListeningMode(mode);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ [LISTENING_MODE_STORAGE]: mode });
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: THEME.colors.bg,
        color: THEME.colors.textPrimary,
        boxSizing: "border-box",
        padding: "16px 16px 36px 16px",
        overflowY: "auto",
        fontFamily: THEME.typography.fontFamily,
      }}
    >
      {/* 1. TOP HEADER & NAVIGATION */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <button
            onClick={onClose}
            aria-label="Back to assistant"
            style={{
              background: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.sm,
              padding: "6px 12px",
              color: THEME.colors.textPrimary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 600,
              boxShadow: THEME.shadows.sm,
              transition: THEME.transitions.fast,
            }}
          >
            <ArrowLeftIcon size={14} color={THEME.colors.textPrimary} />
            <span>Back</span>
          </button>

          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.4px",
              color: THEME.colors.accentLavenderDark,
              backgroundColor: THEME.colors.accentLavenderLight,
              padding: "3px 8px",
              borderRadius: THEME.radius.pill,
            }}
          >
            OiU · AURA Design
          </span>
        </div>

        <h1
          style={{
            fontSize: "19px",
            fontWeight: 800,
            color: THEME.colors.textPrimary,
            margin: "0 0 3px 0",
            letterSpacing: "-0.3px",
          }}
        >
          Preferences
        </h1>

        <p
          style={{
            fontSize: "12px",
            lineHeight: 1.45,
            color: THEME.colors.textSecondary,
            margin: "0 0 12px 0",
          }}
        >
          Configure your meeting identity, audio speech engine, and diagnostics.
        </p>
      </div>

      {/* 2. AURA SEGMENTED TABS */}
      <div
        role="tablist"
        aria-label="Settings categories"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "4px",
          backgroundColor: THEME.colors.bgSubtle,
          padding: "3px",
          borderRadius: THEME.radius.md,
          border: `1px solid ${THEME.colors.border}`,
          marginBottom: "16px",
        }}
      >
        <button
          role="tab"
          aria-selected={activeTab === "profile"}
          type="button"
          onClick={() => setActiveTab("profile")}
          style={{
            padding: "8px 6px",
            borderRadius: THEME.radius.sm,
            border: "none",
            backgroundColor: activeTab === "profile" ? THEME.colors.surface : "transparent",
            color: activeTab === "profile" ? THEME.colors.textPrimary : THEME.colors.textSecondary,
            fontSize: "12px",
            fontWeight: activeTab === "profile" ? 700 : 500,
            cursor: "pointer",
            boxShadow: activeTab === "profile" ? THEME.shadows.sm : "none",
            transition: THEME.transitions.fast,
          }}
        >
          Profile
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "audio"}
          type="button"
          onClick={() => setActiveTab("audio")}
          style={{
            padding: "8px 6px",
            borderRadius: THEME.radius.sm,
            border: "none",
            backgroundColor: activeTab === "audio" ? THEME.colors.surface : "transparent",
            color: activeTab === "audio" ? THEME.colors.textPrimary : THEME.colors.textSecondary,
            fontSize: "12px",
            fontWeight: activeTab === "audio" ? 700 : 500,
            cursor: "pointer",
            boxShadow: activeTab === "audio" ? THEME.shadows.sm : "none",
            transition: THEME.transitions.fast,
          }}
        >
          Audio AI
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "system"}
          type="button"
          onClick={() => setActiveTab("system")}
          style={{
            padding: "8px 6px",
            borderRadius: THEME.radius.sm,
            border: "none",
            backgroundColor: activeTab === "system" ? THEME.colors.surface : "transparent",
            color: activeTab === "system" ? THEME.colors.textPrimary : THEME.colors.textSecondary,
            fontSize: "12px",
            fontWeight: activeTab === "system" ? 700 : 500,
            cursor: "pointer",
            boxShadow: activeTab === "system" ? THEME.shadows.sm : "none",
            transition: THEME.transitions.fast,
          }}
        >
          System
        </button>
      </div>

      {/* 3. TAB CONTENT */}

      {/* === TAB 1: COMPACT GROUPED PROFILE SETTINGS === */}
      {activeTab === "profile" && (
        <form onSubmit={handleProfileSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {profileSuccessMsg && (
            <div
              style={{
                padding: "10px 14px",
                backgroundColor: THEME.colors.accentSageLight,
                border: `1px solid ${THEME.colors.accentSageBorder}`,
                borderRadius: THEME.radius.sm,
                fontSize: "12px",
                fontWeight: 600,
                color: THEME.colors.accentSageDark,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <CheckIcon size={14} color={THEME.colors.accentSageDark} />
              <span>Profile updated successfully.</span>
            </div>
          )}

          {profileError && (
            <div
              style={{
                padding: "10px 14px",
                backgroundColor: THEME.colors.accentCoralLight,
                border: `1px solid ${THEME.colors.accentCoralBorder}`,
                borderRadius: THEME.radius.sm,
                fontSize: "12px",
                color: THEME.colors.accentCoralDark,
                fontWeight: 600,
              }}
            >
              {profileError}
            </div>
          )}

          {/* Grouped Form Container (Eliminates excessive separate cards & vertical scrolling) */}
          <div
            style={{
              backgroundColor: THEME.colors.surface,
              borderRadius: THEME.radius.md,
              border: `1px solid ${THEME.colors.border}`,
              padding: "14px",
              boxShadow: THEME.shadows.card,
              display: "flex",
              flexDirection: "column",
              gap: "13px",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: THEME.colors.textSecondary, paddingBottom: "6px", borderBottom: `1px solid ${THEME.colors.borderSubtle}` }}>
              Meeting Identity & Triggers
            </div>

            {/* Display Name */}
            <div>
              <label
                htmlFor="profile-name-input"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: THEME.colors.textPrimary,
                  marginBottom: "4px",
                }}
              >
                <UserIcon size={12} color={THEME.colors.accentLavenderDark} />
                <span>Display Name</span>
                <span style={{ color: THEME.colors.accentCoralDark }}>*</span>
              </label>
              <input
                id="profile-name-input"
                type="text"
                placeholder="e.g. Aryan"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.surfaceSubtle,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  fontSize: "13px",
                  color: THEME.colors.textPrimary,
                  boxSizing: "border-box",
                  outline: "none",
                  transition: THEME.transitions.fast,
                }}
                onFocus={(e) => (e.target.style.borderColor = THEME.colors.borderFocus)}
                onBlur={(e) => (e.target.style.borderColor = THEME.colors.border)}
              />
              <div style={{ fontSize: "11px", color: THEME.colors.textSecondary, marginTop: "3px" }}>
                Your primary spoken name in calls.
              </div>
            </div>

            {/* Phonetic Aliases */}
            <div>
              <label
                htmlFor="profile-aliases-input"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: THEME.colors.textPrimary,
                  marginBottom: "4px",
                }}
              >
                <UserIcon size={12} color={THEME.colors.accentLavenderDark} />
                <span>Phonetic Aliases & Nicknames</span>
              </label>
              <input
                id="profile-aliases-input"
                type="text"
                placeholder="e.g. Ari, Tatha, Tathagat"
                value={aliasesInput}
                onChange={(e) => setAliasesInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.surfaceSubtle,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  fontSize: "13px",
                  color: THEME.colors.textPrimary,
                  boxSizing: "border-box",
                  outline: "none",
                  transition: THEME.transitions.fast,
                }}
                onFocus={(e) => (e.target.style.borderColor = THEME.colors.borderFocus)}
                onBlur={(e) => (e.target.style.borderColor = THEME.colors.border)}
              />
              <div style={{ fontSize: "11px", color: THEME.colors.textSecondary, marginTop: "3px" }}>
                Nicknames or acoustic sound-alikes (comma-separated).
              </div>
            </div>

            {/* Registration / Roll IDs */}
            <div>
              <label
                htmlFor="profile-ids-input"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: THEME.colors.textPrimary,
                  marginBottom: "4px",
                }}
              >
                <HashIcon size={12} color={THEME.colors.accentLavenderDark} />
                <span>Registration / Roll Numbers</span>
              </label>
              <input
                id="profile-ids-input"
                type="text"
                placeholder="e.g. 117, CS117"
                value={identifiersInput}
                onChange={(e) => setIdentifiersInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.surfaceSubtle,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  fontSize: "13px",
                  fontFamily: THEME.typography.monoFamily,
                  color: THEME.colors.textPrimary,
                  boxSizing: "border-box",
                  outline: "none",
                  transition: THEME.transitions.fast,
                }}
                onFocus={(e) => (e.target.style.borderColor = THEME.colors.borderFocus)}
                onBlur={(e) => (e.target.style.borderColor = THEME.colors.border)}
              />
              <div style={{ fontSize: "11px", color: THEME.colors.textSecondary, marginTop: "3px" }}>
                Student ID or numbers spoken during attendance.
              </div>
            </div>

            {/* Custom Keywords */}
            <div>
              <label
                htmlFor="profile-keywords-input"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: THEME.colors.textPrimary,
                  marginBottom: "4px",
                }}
              >
                <TagIcon size={12} color={THEME.colors.accentLavenderDark} />
                <span>Monitored Keywords</span>
              </label>
              <input
                id="profile-keywords-input"
                type="text"
                placeholder="e.g. Attendance, Viva, Project"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.surfaceSubtle,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  fontSize: "13px",
                  color: THEME.colors.textPrimary,
                  boxSizing: "border-box",
                  outline: "none",
                  transition: THEME.transitions.fast,
                }}
                onFocus={(e) => (e.target.style.borderColor = THEME.colors.borderFocus)}
                onBlur={(e) => (e.target.style.borderColor = THEME.colors.border)}
              />
              <div style={{ fontSize: "11px", color: THEME.colors.textSecondary, marginTop: "3px" }}>
                Key meeting topics to watch for (comma-separated).
              </div>
            </div>
          </div>

          {/* Accessible Save Button */}
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "11px 16px",
              backgroundColor: THEME.colors.accentLavender,
              border: `1px solid ${THEME.colors.accentLavenderBorder}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.textPrimary,
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: THEME.shadows.sm,
              transition: THEME.transitions.fast,
            }}
          >
            Save Profile Changes
          </button>
        </form>
      )}

      {/* === TAB 2: AUDIO ENGINE (WITH TRUTHFUL DESCRIPTIONS) === */}
      {activeTab === "audio" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            style={{
              backgroundColor: THEME.colors.surface,
              borderRadius: THEME.radius.md,
              padding: "12px 14px",
              border: `1px solid ${THEME.colors.border}`,
              boxShadow: THEME.shadows.card,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
              <MicrophoneIcon size={15} color={THEME.colors.accentLavenderDark} />
              <span style={{ fontSize: "13.5px", fontWeight: 700, color: THEME.colors.textPrimary }}>
                Speech Capture & Transcription
              </span>
            </div>
            <p style={{ fontSize: "11.5px", lineHeight: 1.45, color: THEME.colors.textSecondary, margin: 0 }}>
              OiU processes audio stream levels in your browser. Speech is converted to text using Google Meet closed captions or via your optional Groq Whisper API key.
            </p>
          </div>

          {/* Listening Mode Selector */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "11.5px",
                fontWeight: 700,
                color: THEME.colors.textPrimary,
                marginBottom: "6px",
              }}
            >
              Listening Mode
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button
                type="button"
                onClick={() => handleModeChange("audio_only")}
                style={{
                  padding: "10px 12px",
                  borderRadius: THEME.radius.md,
                  backgroundColor: listeningMode === "audio_only" ? THEME.colors.accentLavenderLight : THEME.colors.surface,
                  border: `1.5px solid ${listeningMode === "audio_only" ? THEME.colors.accentLavenderBorder : THEME.colors.border}`,
                  color: THEME.colors.textPrimary,
                  cursor: "pointer",
                  textAlign: "left",
                  boxShadow: THEME.shadows.sm,
                  transition: THEME.transitions.fast,
                }}
              >
                <div style={{ fontSize: "12.5px", fontWeight: 700 }}>🎤 Audio Capture</div>
                <div style={{ fontSize: "10.5px", color: THEME.colors.textSecondary, marginTop: "2px", lineHeight: 1.3 }}>
                  Direct tab audio (Groq Whisper API)
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange("dual")}
                style={{
                  padding: "10px 12px",
                  borderRadius: THEME.radius.md,
                  backgroundColor: listeningMode === "dual" ? THEME.colors.accentPeachLight : THEME.colors.surface,
                  border: `1.5px solid ${listeningMode === "dual" ? THEME.colors.accentPeachBorder : THEME.colors.border}`,
                  color: THEME.colors.textPrimary,
                  cursor: "pointer",
                  textAlign: "left",
                  boxShadow: THEME.shadows.sm,
                  transition: THEME.transitions.fast,
                }}
              >
                <div style={{ fontSize: "12.5px", fontWeight: 700 }}>✨ Dual Mode</div>
                <div style={{ fontSize: "10.5px", color: THEME.colors.textSecondary, marginTop: "2px", lineHeight: 1.3 }}>
                  Google Meet captions + audio level
                </div>
              </button>
            </div>
          </div>

          {/* Groq API Key Form */}
          <form
            onSubmit={handleGroqSubmit}
            style={{
              backgroundColor: THEME.colors.surface,
              borderRadius: THEME.radius.md,
              padding: "14px",
              border: `1px solid ${THEME.colors.border}`,
              boxShadow: THEME.shadows.card,
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {groqSuccessMsg && (
              <div
                style={{
                  padding: "8px 12px",
                  backgroundColor: THEME.colors.accentSageLight,
                  border: `1px solid ${THEME.colors.accentSageBorder}`,
                  borderRadius: THEME.radius.sm,
                  fontSize: "11.5px",
                  color: THEME.colors.accentSageDark,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <CheckIcon size={13} color={THEME.colors.accentSageDark} />
                <span>Groq API Key saved successfully.</span>
              </div>
            )}

            {groqTestResult && (
              <div
                style={{
                  padding: "8px 12px",
                  backgroundColor: groqTestResult.success ? THEME.colors.accentSageLight : THEME.colors.accentCoralLight,
                  border: `1px solid ${groqTestResult.success ? THEME.colors.accentSageBorder : THEME.colors.accentCoralBorder}`,
                  borderRadius: THEME.radius.sm,
                  fontSize: "11.5px",
                  color: groqTestResult.success ? THEME.colors.accentSageDark : THEME.colors.accentCoralDark,
                }}
              >
                {groqTestResult.message}
              </div>
            )}

            <div>
              <label
                htmlFor="groq-api-key-input"
                style={{
                  display: "block",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  color: THEME.colors.textPrimary,
                  marginBottom: "4px",
                }}
              >
                Groq API Key (Whisper Large V3 Turbo)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="groq-api-key-input"
                  type={showGroqKey ? "text" : "password"}
                  placeholder="gsk_..."
                  value={groqKeyInput}
                  onChange={(e) => setGroqKeyInput(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 56px 9px 12px",
                    backgroundColor: THEME.colors.surfaceSubtle,
                    border: `1px solid ${THEME.colors.border}`,
                    borderRadius: THEME.radius.sm,
                    fontSize: "12.5px",
                    color: THEME.colors.textPrimary,
                    fontFamily: THEME.typography.monoFamily,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = THEME.colors.borderFocus)}
                  onBlur={(e) => (e.target.style.borderColor = THEME.colors.border)}
                />
                <button
                  type="button"
                  onClick={() => setShowGroqKey(!showGroqKey)}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: THEME.colors.textSecondary,
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "4px",
                  }}
                >
                  {showGroqKey ? "Hide" : "Show"}
                </button>
              </div>

              <div style={{ marginTop: "5px", fontSize: "11px", color: THEME.colors.textSecondary }}>
                Optional for audio-only transcription ·{" "}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: THEME.colors.accentLavenderDark, textDecoration: "none", fontWeight: 600 }}
                >
                  Get key on console.groq.com ↗
                </a>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "2px" }}>
              <button
                type="button"
                disabled={isTestingGroq || !groqKeyInput.trim()}
                onClick={handleTestGroq}
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.surfaceSubtle,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  color: THEME.colors.textPrimary,
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: isTestingGroq || !groqKeyInput.trim() ? "not-allowed" : "pointer",
                  opacity: isTestingGroq || !groqKeyInput.trim() ? 0.5 : 1,
                }}
              >
                {isTestingGroq ? "Testing..." : "Test Key"}
              </button>

              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.accentLavender,
                  border: `1px solid ${THEME.colors.accentLavenderBorder}`,
                  borderRadius: THEME.radius.sm,
                  color: THEME.colors.textPrimary,
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Save Key
              </button>
            </div>
          </form>
        </div>
      )}

      {/* === TAB 3: SYSTEM & DIAGNOSTICS === */}
      {activeTab === "system" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Diagnostic Controls */}
          <div
            style={{
              backgroundColor: THEME.colors.surface,
              borderRadius: THEME.radius.md,
              padding: "14px",
              border: `1px solid ${THEME.colors.border}`,
              boxShadow: THEME.shadows.card,
            }}
          >
            <div style={{ fontSize: "12.5px", fontWeight: 700, color: THEME.colors.textPrimary, marginBottom: "2px" }}>
              Diagnostics & Audio Verification
            </div>
            <div style={{ fontSize: "11px", color: THEME.colors.textSecondary, marginBottom: "10px" }}>
              Verify audio synthesizers and trigger synthetic detection tests.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              <button
                type="button"
                onClick={onPlayChime}
                style={{
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.surfaceSubtle,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  color: THEME.colors.textPrimary,
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: THEME.transitions.fast,
                }}
              >
                <span>Test Audio Chime Synthesizer</span>
                <span style={{ color: THEME.colors.accentLavenderDark, fontWeight: 700 }}>Play ♫</span>
              </button>

              <button
                type="button"
                onClick={onTestAlert}
                style={{
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.surfaceSubtle,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  color: THEME.colors.textPrimary,
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: THEME.transitions.fast,
                }}
              >
                <span>Trigger Synthetic Mention Alert</span>
                <span style={{ color: THEME.colors.accentLavenderDark, fontWeight: 700 }}>Trigger</span>
              </button>
            </div>
          </div>

          {/* Data Maintenance Controls */}
          <div
            style={{
              backgroundColor: THEME.colors.surface,
              borderRadius: THEME.radius.md,
              padding: "14px",
              border: `1px solid ${THEME.colors.border}`,
              boxShadow: THEME.shadows.card,
            }}
          >
            <div style={{ fontSize: "12.5px", fontWeight: 700, color: THEME.colors.textPrimary, marginBottom: "2px" }}>
              Cache Maintenance
            </div>
            <div style={{ fontSize: "11px", color: THEME.colors.textSecondary, marginBottom: "10px" }}>
              Manage local session transcript cache and alert logs.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              <button
                type="button"
                onClick={onClearTranscripts}
                style={{
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.surfaceSubtle,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  color: THEME.colors.textSecondary,
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                Clear Live Transcript Cache
              </button>

              <button
                type="button"
                onClick={onClearAlertsHistory}
                style={{
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.surfaceSubtle,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  color: THEME.colors.textSecondary,
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                Clear Alert History
              </button>
            </div>
          </div>

          {/* Reset Session Section with safety confirmation */}
          <div
            style={{
              backgroundColor: THEME.colors.surface,
              borderRadius: THEME.radius.md,
              padding: "14px",
              border: `1px solid ${THEME.colors.accentCoralBorder}`,
              boxShadow: THEME.shadows.card,
            }}
          >
            <div style={{ fontSize: "12.5px", fontWeight: 700, color: THEME.colors.accentCoralDark, marginBottom: "2px" }}>
              Session Reset
            </div>
            <div style={{ fontSize: "11px", color: THEME.colors.textSecondary, marginBottom: "10px" }}>
              Clears current session tokens and stops any active meeting listener.
            </div>

            {showResetConfirm ? (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    onResetSession();
                    setShowResetConfirm(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    backgroundColor: THEME.colors.accentCoral,
                    border: "none",
                    borderRadius: THEME.radius.sm,
                    color: "#FFFFFF",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    backgroundColor: THEME.colors.surfaceSubtle,
                    border: `1px solid ${THEME.colors.border}`,
                    borderRadius: THEME.radius.sm,
                    color: THEME.colors.textPrimary,
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  backgroundColor: THEME.colors.accentCoralLight,
                  border: `1px solid ${THEME.colors.accentCoralBorder}`,
                  borderRadius: THEME.radius.sm,
                  color: THEME.colors.accentCoralDark,
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Reset OiU Session
              </button>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{ marginTop: "auto", paddingTop: "20px", textAlign: "center", fontSize: "11px", color: THEME.colors.textMuted }}>
        <div>OiU Meeting Copilot · Client-Side Chrome Extension</div>
      </div>
    </div>
  );
};
