import React, { useState } from "react";
import { UserProfile, formatCommaSeparatedList, parseCommaSeparatedList, validateProfile } from "@oiu/shared";
import { THEME } from "./theme";
import {
  ArrowLeftIcon,
  UserIcon,
  HashIcon,
  TagIcon,
  LightningIcon,
  ExternalLinkIcon,
  CheckIcon,
  ZapIcon,
} from "./icons";
import { testGeminiApiKey } from "../services/aiService";

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

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  geminiApiKey,
  onSaveProfile,
  onSaveApiKey,
  onTestAlert,
  onPlayChime,
  onTurnOnCaptions,
  onKickstartCaptions,
  onResetSession,
  onClearTranscripts,
  onClearAlertsHistory,
  onClose,
}) => {
  // Profile state
  const [nameInput, setNameInput] = useState(profile.displayName || "");
  const [aliasesInput, setAliasesInput] = useState(formatCommaSeparatedList(profile.aliases));
  const [identifiersInput, setIdentifiersInput] = useState(formatCommaSeparatedList(profile.identifiers));
  const [keywordsInput, setKeywordsInput] = useState(formatCommaSeparatedList(profile.keywords || []));
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState(false);
  const [kickstartFeedback, setKickstartFeedback] = useState(false);

  // API Key state
  const [apiKeyInput, setApiKeyInput] = useState(geminiApiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiSuccessMsg, setApiSuccessMsg] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; message: string } | null>(null);

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
    setTimeout(() => setProfileSuccessMsg(false), 2200);
  };

  const handleApiKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveApiKey(apiKeyInput.trim());
    setApiSuccessMsg(true);
    setTimeout(() => setApiSuccessMsg(false), 2200);
  };

  const handleTestConnection = async () => {
    setIsTestingApi(true);
    setApiTestResult(null);
    try {
      const res = await testGeminiApiKey(apiKeyInput.trim());
      setApiTestResult(res);
      if (res.success) {
        onSaveApiKey(apiKeyInput.trim());
      }
    } catch (e: any) {
      setApiTestResult({ success: false, message: e?.message || "Test failed" });
    } finally {
      setIsTestingApi(false);
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
        padding: "16px",
        overflowY: "auto",
      }}
    >
      {/* Header with Back button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          paddingBottom: "14px",
          borderBottom: `1px solid ${THEME.colors.border}`,
          marginBottom: "18px",
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: `1px solid ${THEME.colors.border}`,
            borderRadius: THEME.radius.sm,
            padding: "5px 8px",
            color: THEME.colors.textPrimary,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: THEME.colors.surface,
          }}
          title="Back to Assistant"
        >
          <ArrowLeftIcon size={14} color={THEME.colors.textPrimary} />
        </button>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "-0.2px" }}>Settings</div>
          <div style={{ fontSize: "11px", color: THEME.colors.textSecondary }}>Preferences & Profile Configuration</div>
        </div>
      </div>

      {/* SECTION 1: Profile & Target Identifiers */}
      <div
        style={{
          backgroundColor: THEME.colors.bgSecondary,
          border: `1px solid ${THEME.colors.border}`,
          borderRadius: THEME.radius.lg,
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <UserIcon size={16} color={THEME.colors.accentGreen} />
          <span style={{ fontSize: "13.5px", fontWeight: 600 }}>Target Profile & Identifiers</span>
        </div>

        {profileSuccessMsg && (
          <div
            style={{
              padding: "7px 10px",
              marginBottom: "12px",
              backgroundColor: THEME.colors.greenMutedBg,
              border: `1px solid ${THEME.colors.greenBorder}`,
              borderRadius: THEME.radius.sm,
              fontSize: "11.5px",
              color: THEME.colors.accentGreen,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <CheckIcon size={14} color={THEME.colors.accentGreen} />
            <span>Profile saved successfully!</span>
          </div>
        )}

        {profileError && (
          <div
            style={{
              padding: "7px 10px",
              marginBottom: "12px",
              backgroundColor: THEME.colors.redMutedBg,
              border: `1px solid ${THEME.colors.redBorder}`,
              borderRadius: THEME.radius.sm,
              fontSize: "11.5px",
              color: THEME.colors.accentRed,
            }}
          >
            {profileError}
          </div>
        )}

        <form onSubmit={handleProfileSubmit}>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 500, color: THEME.colors.textSecondary, marginBottom: "5px" }}>
              Display Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Aryan"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                fontSize: "13px",
                color: THEME.colors.textPrimary,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 500, color: THEME.colors.textSecondary, marginBottom: "5px" }}>
              Phonetic Aliases (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. Ari, Aryan S, Tathagat"
              value={aliasesInput}
              onChange={(e) => setAliasesInput(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                fontSize: "13px",
                color: THEME.colors.textPrimary,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            <div style={{ fontSize: "10px", color: THEME.colors.textMuted, marginTop: "4px" }}>
              Handles common speech-to-text variations of your name.
            </div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 500, color: THEME.colors.textSecondary, marginBottom: "5px" }}>
              Registration / Employee IDs (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. 117, 10325210117, EMP-402"
              value={identifiersInput}
              onChange={(e) => setIdentifiersInput(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                fontSize: "13px",
                color: THEME.colors.textPrimary,
                fontFamily: THEME.typography.monoFamily,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 500, color: THEME.colors.textSecondary, marginBottom: "5px" }}>
              Custom Alert Keywords (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. quarterly budget, project titan, architecture"
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                fontSize: "13px",
                color: THEME.colors.textPrimary,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            <div style={{ fontSize: "10px", color: THEME.colors.textMuted, marginTop: "4px" }}>
              OiU monitors meeting speech and alerts you if any of these topics are asked or mentioned.
            </div>
          </div>

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "9px 14px",
              backgroundColor: THEME.colors.surfaceHighlight,
              border: `1px solid ${THEME.colors.borderActive}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.textPrimary,
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Save Profile Changes
          </button>
        </form>
      </div>

      {/* SECTION 2: AI Answer Engine (Free Gemini API) */}
      <div
        style={{
          backgroundColor: THEME.colors.bgSecondary,
          border: `1px solid ${THEME.colors.border}`,
          borderRadius: THEME.radius.lg,
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <LightningIcon size={16} color={THEME.colors.accentGreen} />
            <span style={{ fontSize: "13.5px", fontWeight: 600 }}>AI Answer Engine (Gemini Flash)</span>
          </div>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: THEME.radius.xs,
              backgroundColor: geminiApiKey ? THEME.colors.greenMutedBg : THEME.colors.surface,
              color: geminiApiKey ? THEME.colors.accentGreen : THEME.colors.textSecondary,
              border: `1px solid ${geminiApiKey ? THEME.colors.greenBorder : THEME.colors.border}`,
            }}
          >
            {geminiApiKey ? "ACTIVE" : "OPTIONAL"}
          </span>
        </div>

        <p style={{ margin: "0 0 12px 0", fontSize: "11.5px", color: THEME.colors.textSecondary, lineHeight: 1.45 }}>
          Generates deep, factual answers to direct questions using Google Gemini Flash.
        </p>

        {apiSuccessMsg && (
          <div
            style={{
              padding: "7px 10px",
              marginBottom: "12px",
              backgroundColor: THEME.colors.greenMutedBg,
              border: `1px solid ${THEME.colors.greenBorder}`,
              borderRadius: THEME.radius.sm,
              fontSize: "11.5px",
              color: THEME.colors.accentGreen,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <CheckIcon size={14} color={THEME.colors.accentGreen} />
            <span>API Key saved securely!</span>
          </div>
        )}

        {apiTestResult && (
          <div
            style={{
              padding: "8px 12px",
              marginBottom: "12px",
              backgroundColor: apiTestResult.success ? THEME.colors.greenMutedBg : "rgba(239, 68, 68, 0.12)",
              border: `1px solid ${apiTestResult.success ? THEME.colors.greenBorder : "rgba(239, 68, 68, 0.4)"}`,
              borderRadius: THEME.radius.sm,
              fontSize: "11.5px",
              color: apiTestResult.success ? THEME.colors.accentGreen : "#FCA5A5",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {apiTestResult.success ? (
              <CheckIcon size={14} color={THEME.colors.accentGreen} />
            ) : (
              <span>⚠️</span>
            )}
            <span>{apiTestResult.message}</span>
          </div>
        )}

        <form onSubmit={handleApiKeySubmit}>
          <div style={{ marginBottom: "10px" }}>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 500, color: THEME.colors.textSecondary, marginBottom: "5px" }}>
              Google Gemini API Key
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showApiKey ? "text" : "password"}
                placeholder="AIzaSy..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 60px 8px 10px",
                  backgroundColor: THEME.colors.surface,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.sm,
                  fontSize: "12.5px",
                  color: THEME.colors.textPrimary,
                  fontFamily: THEME.typography.monoFamily,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                style={{
                  position: "absolute",
                  right: "8px",
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
                {showApiKey ? "Hide" : "Show"}
              </button>
            </div>
            <div style={{ marginTop: "6px", fontSize: "11px", color: THEME.colors.textSecondary }}>
              Don't have a key?{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                style={{ color: THEME.colors.accentGreen, textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "2px" }}
              >
                <span>Get free key at Google AI Studio</span>
                <ExternalLinkIcon size={10} color={THEME.colors.accentGreen} />
              </a>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTestingApi || !apiKeyInput.trim()}
              style={{
                flex: 1,
                padding: "9px 12px",
                backgroundColor: THEME.colors.greenMutedBg,
                border: `1px solid ${THEME.colors.greenBorder}`,
                borderRadius: THEME.radius.md,
                color: THEME.colors.accentGreen,
                fontSize: "12px",
                fontWeight: 600,
                cursor: isTestingApi || !apiKeyInput.trim() ? "not-allowed" : "pointer",
                opacity: isTestingApi || !apiKeyInput.trim() ? 0.6 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
              }}
            >
              <LightningIcon size={13} color={THEME.colors.accentGreen} />
              <span>{isTestingApi ? "Testing..." : "Test AI"}</span>
            </button>

            <button
              type="submit"
              style={{
                flex: 1,
                padding: "9px 12px",
                backgroundColor: THEME.colors.surfaceHighlight,
                border: `1px solid ${THEME.colors.borderActive}`,
                borderRadius: THEME.radius.md,
                color: THEME.colors.textPrimary,
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Save Key
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 3: Audio & Meeting Preferences */}
      <div
        style={{
          backgroundColor: THEME.colors.bgSecondary,
          border: `1px solid ${THEME.colors.border}`,
          borderRadius: THEME.radius.lg,
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div style={{ fontSize: "13.5px", fontWeight: 600, marginBottom: "12px" }}>
          Audio & Verification
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={onPlayChime}
            style={{
              padding: "8px 12px",
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.textPrimary,
              fontSize: "12px",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Test Alert Chime (Web Audio Synthesizer)</span>
            <span style={{ color: THEME.colors.accentGreen, fontWeight: 600 }}>Play ♫</span>
          </button>

          <button
            onClick={onTestAlert}
            style={{
              padding: "8px 12px",
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.textPrimary,
              fontSize: "12px",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Trigger Full Synthetic Alert</span>
            <span style={{ color: THEME.colors.accentAmber, fontWeight: 600 }}>Trigger</span>
          </button>

          <button
            onClick={() => {
              setKickstartFeedback(true);
              setTimeout(() => setKickstartFeedback(false), 2000);
              if (onKickstartCaptions) {
                onKickstartCaptions();
              } else {
                onTurnOnCaptions();
              }
            }}
            style={{
              padding: "8px 12px",
              backgroundColor: kickstartFeedback ? THEME.colors.greenMutedBg : THEME.colors.surface,
              border: `1px solid ${kickstartFeedback ? THEME.colors.greenBorder : THEME.colors.border}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.textPrimary,
              fontSize: "12px",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ZapIcon size={13} color={THEME.colors.accentGreen} />
              <span>Kickstart / Reconnect Meet Captions (Fixes stalled captions)</span>
            </div>
            <span style={{ color: THEME.colors.accentGreen, fontWeight: 600 }}>
              {kickstartFeedback ? "Kickstarted!" : "Reconnect"}
            </span>
          </button>
        </div>
      </div>

      {/* SECTION 4: Data & Maintenance */}
      <div
        style={{
          backgroundColor: THEME.colors.bgSecondary,
          border: `1px solid ${THEME.colors.border}`,
          borderRadius: THEME.radius.lg,
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div style={{ fontSize: "13.5px", fontWeight: 600, marginBottom: "12px" }}>
          Session & Storage
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={onClearTranscripts}
            style={{
              padding: "8px 12px",
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.textSecondary,
              fontSize: "12px",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Clear Live Transcript History
          </button>

          <button
            onClick={onClearAlertsHistory}
            style={{
              padding: "8px 12px",
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.textSecondary,
              fontSize: "12px",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Clear Alert History
          </button>

          <button
            onClick={onResetSession}
            style={{
              padding: "8px 12px",
              backgroundColor: THEME.colors.redMutedBg,
              border: `1px solid ${THEME.colors.redBorder}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.accentRed,
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Reset OiU Session State
          </button>
        </div>
      </div>

      {/* SECTION 5: About OiU */}
      <div style={{ textAlign: "center", padding: "12px 0 24px 0", fontSize: "11px", color: THEME.colors.textMuted }}>
        <div>OiU — Meeting Awareness Copilot v0.1.0</div>
        <div style={{ marginTop: "4px" }}>Zero-Impact Local Processing Architecture</div>
      </div>
    </div>
  );
};

