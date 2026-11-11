import React, { useState, useEffect } from "react";
import { UserProfile, formatCommaSeparatedList, parseCommaSeparatedList, validateProfile } from "@oiu/shared";
import { THEME } from "./theme";
import {
  ArrowLeftIcon,
  UserIcon,
  CheckIcon,
  MicrophoneIcon,
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
  // Navigation tab state
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
      setGroqTestResult({ success: false, message: e?.message || "Test failed" });
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
        padding: "20px 18px",
        overflowY: "auto",
        fontFamily: THEME.typography.fontFamily,
      }}
    >
      {/* 1. TOP HEADER & EDITORIAL TITLE (Matching "New York Philharmonic" brutalist/editorial aesthetic) */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.sm,
              padding: "6px 12px",
              color: THEME.colors.textSecondary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 500,
              backgroundColor: THEME.colors.surface,
              transition: "all 0.2s ease",
            }}
            title="Return to live assistant"
          >
            <ArrowLeftIcon size={13} color={THEME.colors.textSecondary} />
            <span>Back</span>
          </button>

          <span
            style={{
              fontFamily: THEME.typography.monoFamily,
              fontSize: "10.5px",
              fontWeight: 600,
              letterSpacing: "1px",
              color: THEME.colors.accentYellow,
              textTransform: "uppercase",
            }}
          >
            OiU v1.0
          </span>
        </div>

        {/* Big Bold Headline in Oswald (Condensed Grotesque) */}
        <h1
          style={{
            fontFamily: THEME.typography.displayFont,
            fontSize: "28px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            lineHeight: 1.05,
            color: "#FFFFFF",
            margin: "0 0 6px 0",
          }}
        >
          SETTINGS & PREFERENCES
        </h1>

        {/* Editorial Subtitle in Serif/Lora */}
        <p
          style={{
            fontFamily: THEME.typography.serifFont,
            fontSize: "13.5px",
            lineHeight: 1.6,
            color: THEME.colors.textSecondary,
            margin: "0 0 14px 0",
          }}
        >
          Configure your meeting identity, pure audio intelligence, and alert preferences.
        </p>

        {/* High-Contrast Cyber Yellow Accent Line (Matching reference Image 3) */}
        <div
          style={{
            width: "100%",
            height: "3px",
            backgroundColor: THEME.colors.accentYellow,
            borderRadius: "1px",
          }}
        />
      </div>

      {/* 2. MINIMALIST SEGMENTED NAVIGATION BAR */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "4px",
          backgroundColor: THEME.colors.surface,
          padding: "3px",
          borderRadius: THEME.radius.md,
          border: `1px solid ${THEME.colors.border}`,
          marginBottom: "24px",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          style={{
            padding: "8px 6px",
            borderRadius: THEME.radius.sm,
            border: "none",
            backgroundColor: activeTab === "profile" ? THEME.colors.bg : "transparent",
            color: activeTab === "profile" ? THEME.colors.accentYellow : THEME.colors.textSecondary,
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.15s ease",
            boxShadow: activeTab === "profile" ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
          }}
        >
          Profile
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audio")}
          style={{
            padding: "8px 6px",
            borderRadius: THEME.radius.sm,
            border: "none",
            backgroundColor: activeTab === "audio" ? THEME.colors.bg : "transparent",
            color: activeTab === "audio" ? THEME.colors.accentYellow : THEME.colors.textSecondary,
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.15s ease",
            boxShadow: activeTab === "audio" ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
          }}
        >
          Audio AI
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("system")}
          style={{
            padding: "8px 6px",
            borderRadius: THEME.radius.sm,
            border: "none",
            backgroundColor: activeTab === "system" ? THEME.colors.bg : "transparent",
            color: activeTab === "system" ? THEME.colors.accentYellow : THEME.colors.textSecondary,
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.15s ease",
            boxShadow: activeTab === "system" ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
          }}
        >
          System
        </button>
      </div>

      {/* 3. TAB CONTENT */}

      {/* === TAB 1: PROFILE & IDENTITY === */}
      {activeTab === "profile" && (
        <form onSubmit={handleProfileSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {profileSuccessMsg && (
            <div
              style={{
                padding: "10px 14px",
                backgroundColor: THEME.colors.yellowMutedBg,
                border: `1px solid ${THEME.colors.yellowBorder}`,
                borderRadius: THEME.radius.sm,
                fontSize: "12px",
                fontWeight: 600,
                color: THEME.colors.accentYellow,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <CheckIcon size={14} color={THEME.colors.accentYellow} />
              <span>Profile updated successfully</span>
            </div>
          )}

          {profileError && (
            <div
              style={{
                padding: "10px 14px",
                backgroundColor: THEME.colors.redMutedBg,
                border: `1px solid ${THEME.colors.redBorder}`,
                borderRadius: THEME.radius.sm,
                fontSize: "12px",
                color: THEME.colors.accentRed,
              }}
            >
              {profileError}
            </div>
          )}

          {/* Display Name */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: THEME.colors.textSecondary,
                marginBottom: "6px",
              }}
            >
              Display Name <span style={{ color: THEME.colors.accentYellow }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Aryan"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                fontSize: "14px",
                color: "#FFFFFF",
                boxSizing: "border-box",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = THEME.colors.accentYellow)}
              onBlur={(e) => (e.target.style.borderColor = THEME.colors.border)}
            />
            <div style={{ fontSize: "11px", color: THEME.colors.textMuted, marginTop: "5px" }}>
              Your exact name as spoken by hosts and professors.
            </div>
          </div>

          {/* Phonetic Aliases */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: THEME.colors.textSecondary,
                marginBottom: "6px",
              }}
            >
              Phonetic Aliases
            </label>
            <input
              type="text"
              placeholder="e.g. Ari, Tathagat, vansh"
              value={aliasesInput}
              onChange={(e) => setAliasesInput(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                fontSize: "13.5px",
                color: "#FFFFFF",
                boxSizing: "border-box",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = THEME.colors.accentYellow)}
              onBlur={(e) => (e.target.style.borderColor = THEME.colors.border)}
            />
            <div style={{ fontSize: "11px", color: THEME.colors.textMuted, marginTop: "5px" }}>
              Alternative spellings or nicknames (comma-separated).
            </div>
          </div>

          {/* Registration / Roll IDs */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: THEME.colors.textSecondary,
                marginBottom: "6px",
              }}
            >
              Registration / Roll IDs
            </label>
            <input
              type="text"
              placeholder="e.g. 117, 10325210117"
              value={identifiersInput}
              onChange={(e) => setIdentifiersInput(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                fontSize: "13.5px",
                fontFamily: THEME.typography.monoFamily,
                color: "#FFFFFF",
                boxSizing: "border-box",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = THEME.colors.accentYellow)}
              onBlur={(e) => (e.target.style.borderColor = THEME.colors.border)}
            />
            <div style={{ fontSize: "11px", color: THEME.colors.textMuted, marginTop: "5px" }}>
              Identifiers spoken during roll calls or attendance.
            </div>
          </div>

          {/* Custom Keywords */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: THEME.colors.textSecondary,
                marginBottom: "6px",
              }}
            >
              Custom Alert Keywords
            </label>
            <input
              type="text"
              placeholder="e.g. Attendance, Project Titan, Viva"
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                fontSize: "13.5px",
                color: "#FFFFFF",
                boxSizing: "border-box",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = THEME.colors.accentYellow)}
              onBlur={(e) => (e.target.style.borderColor = THEME.colors.border)}
            />
            <div style={{ fontSize: "11px", color: THEME.colors.textMuted, marginTop: "5px" }}>
              Key topics that trigger immediate alerts when spoken.
            </div>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            style={{
              marginTop: "8px",
              width: "100%",
              padding: "13px 18px",
              backgroundColor: THEME.colors.accentYellow,
              border: "none",
              borderRadius: THEME.radius.sm,
              color: "#000000",
              fontSize: "13px",
              fontWeight: 800,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Save Profile Changes
          </button>
        </form>
      )}

      {/* === TAB 2: AUDIO ENGINE (GROQ WHISPER) === */}
      {activeTab === "audio" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <MicrophoneIcon size={16} color={THEME.colors.accentYellow} />
              <span
                style={{
                  fontFamily: THEME.typography.displayFont,
                  fontSize: "18px",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}
              >
                Pure Audio Intelligence
              </span>
            </div>
            <p
              style={{
                fontFamily: THEME.typography.serifFont,
                fontSize: "13px",
                lineHeight: 1.6,
                color: THEME.colors.textSecondary,
                margin: 0,
              }}
            >
              Listens directly to incoming meeting audio via Groq Whisper Large V3. Completely independent of Google Meet captions.
            </p>
          </div>

          {/* Listening Mode Selector */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: THEME.colors.textSecondary,
                marginBottom: "8px",
              }}
            >
              Listening Mode
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button
                type="button"
                onClick={() => handleModeChange("audio_only")}
                style={{
                  padding: "12px 14px",
                  borderRadius: THEME.radius.sm,
                  backgroundColor: listeningMode === "audio_only" ? THEME.colors.yellowMutedBg : THEME.colors.surface,
                  border: `1px solid ${listeningMode === "audio_only" ? THEME.colors.accentYellow : THEME.colors.border}`,
                  color: listeningMode === "audio_only" ? THEME.colors.accentYellow : THEME.colors.textSecondary,
                  fontSize: "12.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <div>🎤 Pure Audio</div>
                <div style={{ fontSize: "10.5px", fontWeight: 400, opacity: 0.8, marginTop: "3px" }}>
                  Zero Captions · 100% Invisible
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange("dual")}
                style={{
                  padding: "12px 14px",
                  borderRadius: THEME.radius.sm,
                  backgroundColor: listeningMode === "dual" ? THEME.colors.yellowMutedBg : THEME.colors.surface,
                  border: `1px solid ${listeningMode === "dual" ? THEME.colors.accentYellow : THEME.colors.border}`,
                  color: listeningMode === "dual" ? THEME.colors.accentYellow : THEME.colors.textSecondary,
                  fontSize: "12.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <div>✨ Dual Mode</div>
                <div style={{ fontSize: "10.5px", fontWeight: 400, opacity: 0.8, marginTop: "3px" }}>
                  Audio + Captions Companion
                </div>
              </button>
            </div>
          </div>

          {/* Groq API Key Form */}
          <form onSubmit={handleGroqSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {groqSuccessMsg && (
              <div
                style={{
                  padding: "10px 14px",
                  backgroundColor: THEME.colors.yellowMutedBg,
                  border: `1px solid ${THEME.colors.yellowBorder}`,
                  borderRadius: THEME.radius.sm,
                  fontSize: "12px",
                  color: THEME.colors.accentYellow,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <CheckIcon size={14} color={THEME.colors.accentYellow} />
                <span>Groq API Key saved successfully</span>
              </div>
            )}

            {groqTestResult && (
              <div
                style={{
                  padding: "10px 14px",
                  backgroundColor: groqTestResult.success ? THEME.colors.yellowMutedBg : THEME.colors.redMutedBg,
                  border: `1px solid ${groqTestResult.success ? THEME.colors.yellowBorder : THEME.colors.redBorder}`,
                  borderRadius: THEME.radius.sm,
                  fontSize: "12px",
                  color: groqTestResult.success ? THEME.colors.accentYellow : THEME.colors.accentRed,
                }}
              >
                {groqTestResult.message}
              </div>
            )}

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  color: THEME.colors.textSecondary,
                  marginBottom: "6px",
                }}
              >
                Groq API Key (Whisper Large V3 Turbo)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showGroqKey ? "text" : "password"}
                  placeholder="gsk_..."
                  value={groqKeyInput}
                  onChange={(e) => setGroqKeyInput(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 60px 12px 14px",
                    backgroundColor: THEME.colors.surface,
                    border: `1px solid ${THEME.colors.border}`,
                    borderRadius: THEME.radius.sm,
                    fontSize: "13px",
                    color: "#FFFFFF",
                    fontFamily: THEME.typography.monoFamily,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = THEME.colors.accentYellow)}
                  onBlur={(e) => (e.target.style.borderColor = THEME.colors.border)}
                />
                <button
                  type="button"
                  onClick={() => setShowGroqKey(!showGroqKey)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: THEME.colors.textSecondary,
                    fontSize: "11px",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                >
                  {showGroqKey ? "Hide" : "Show"}
                </button>
              </div>

              <div style={{ marginTop: "6px", fontSize: "11px", color: THEME.colors.textMuted }}>
                100% Free ·{" "}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: THEME.colors.accentYellow, textDecoration: "none", fontWeight: 600 }}
                >
                  Get free Groq key in 10s (No card required) ↗
                </a>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                disabled={isTestingGroq || !groqKeyInput.trim()}
                onClick={handleTestGroq}
                style={{
                  flex: 1,
                  padding: "11px 14px",
                  backgroundColor: THEME.colors.surface,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  color: "#FFFFFF",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: isTestingGroq || !groqKeyInput.trim() ? "not-allowed" : "pointer",
                  opacity: isTestingGroq || !groqKeyInput.trim() ? 0.5 : 1,
                }}
              >
                {isTestingGroq ? "Testing..." : "Test Connection"}
              </button>

              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: "11px 14px",
                  backgroundColor: THEME.colors.accentYellow,
                  border: "none",
                  borderRadius: THEME.radius.sm,
                  color: "#000000",
                  fontSize: "12px",
                  fontWeight: 800,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
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
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <span
              style={{
                fontFamily: THEME.typography.displayFont,
                fontSize: "18px",
                fontWeight: 700,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              System Verification & Maintenance
            </span>
            <p
              style={{
                fontFamily: THEME.typography.serifFont,
                fontSize: "13px",
                lineHeight: 1.6,
                color: THEME.colors.textSecondary,
                margin: "4px 0 0 0",
              }}
            >
              Verify audio synthesizers, trigger synthetic alerts, or purge cached meeting transcripts.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              type="button"
              onClick={onPlayChime}
              style={{
                padding: "14px 16px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                color: "#FFFFFF",
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                textAlign: "left",
              }}
            >
              <span>Test Audio Chime Synthesizer</span>
              <span style={{ color: THEME.colors.accentYellow, fontWeight: 700 }}>Play ♫</span>
            </button>

            <button
              type="button"
              onClick={onTestAlert}
              style={{
                padding: "14px 16px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                color: "#FFFFFF",
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                textAlign: "left",
              }}
            >
              <span>Trigger Synthetic Mention Alert</span>
              <span style={{ color: THEME.colors.accentYellow, fontWeight: 700 }}>Trigger</span>
            </button>

            <button
              type="button"
              onClick={onClearTranscripts}
              style={{
                padding: "14px 16px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                color: THEME.colors.textSecondary,
                fontSize: "13px",
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
                padding: "14px 16px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                color: THEME.colors.textSecondary,
                fontSize: "13px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Clear Alert History
            </button>

            <button
              type="button"
              onClick={onResetSession}
              style={{
                marginTop: "10px",
                padding: "14px 16px",
                backgroundColor: THEME.colors.redMutedBg,
                border: `1px solid ${THEME.colors.redBorder}`,
                borderRadius: THEME.radius.sm,
                color: THEME.colors.accentRed,
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Reset OiU Session State
            </button>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{ marginTop: "auto", paddingTop: "30px", textAlign: "center", fontSize: "11px", color: THEME.colors.textMuted }}>
        <div>OiU Meeting Copilot · Zero-Impact Local Engine</div>
      </div>
    </div>
  );
};
