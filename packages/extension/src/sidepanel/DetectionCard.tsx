import React, { useState } from "react";
import { MeetingEvent, UserProfile } from "@oiu/shared";
import { THEME } from "./theme";
import {
  BellIcon,
  PlaySolidIcon,
  LightningIcon,
  BriefcaseIcon,
  QuestionCircleIcon,
  CopyIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from "./icons";
import {
  SuggestedResponse,
  extractCoreCalloutOrQuestion,
} from "../services/aiService";

interface DetectionCardProps {
  activeAlert: MeetingEvent | null;
  alertsHistory: MeetingEvent[];
  currentAlertIndex: number;
  profile: UserProfile;
  suggestions: SuggestedResponse[];
  isGeneratingAi: boolean;
  geminiApiKey: string;
  priorContextTranscripts: Array<{ id: string; speakerId?: string; text: string }>;
  onCopySuggestion: (text: string, index: number) => void;
  copiedSuggestionIdx: number | null;
  onNavigateAlert: (newIndex: number) => void;
  onDismissAlert: () => void;
  onPlayChime: () => void;
  onRegenerateAi: (event: MeetingEvent) => void;
  onOpenSettings: () => void;
}

export const DetectionCard: React.FC<DetectionCardProps> = ({
  activeAlert,
  alertsHistory,
  currentAlertIndex,
  profile,
  suggestions,
  isGeneratingAi,
  geminiApiKey,
  priorContextTranscripts,
  onCopySuggestion,
  copiedSuggestionIdx,
  onNavigateAlert,
  onDismissAlert,
  onPlayChime,
  onRegenerateAi,
  onOpenSettings,
}) => {
  const [showRawCaption, setShowRawCaption] = useState(false);
  const [showPriorContext, setShowPriorContext] = useState(false);
  const [selectedToneIndex, setSelectedToneIndex] = useState<number>(0);

  // If no alert at all, render clean standing-by empty card
  if (!activeAlert && alertsHistory.length === 0) {
    return (
      <div
        style={{
          backgroundColor: THEME.colors.bgSecondary,
          border: `1px solid ${THEME.colors.border}`,
          borderRadius: THEME.radius.lg,
          padding: "24px 18px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          margin: "12px 0 16px 0",
        }}
      >
        <div
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "50%",
            backgroundColor: THEME.colors.surface,
            border: `1px solid ${THEME.colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "12px",
          }}
        >
          <BellIcon size={20} color={THEME.colors.textMuted} />
        </div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: THEME.colors.textPrimary, marginBottom: "4px" }}>
          Standing By
        </div>
        <div style={{ fontSize: "12px", color: THEME.colors.textSecondary, maxWidth: "260px", lineHeight: 1.45 }}>
          OiU is actively monitoring your meeting for your name, registration ID, or monitored keywords.
        </div>
      </div>
    );
  }

  // Active or selected alert from history
  const displayAlert =
    alertsHistory.length > 0 && alertsHistory[currentAlertIndex]
      ? alertsHistory[currentAlertIndex]
      : activeAlert || alertsHistory[0];

  if (!displayAlert) return null;

  const {
    coreText,
    isQuestion,
    activeFollowUp,
    relationReason,
    addressedToOther,
    otherTarget,
  } = extractCoreCalloutOrQuestion(displayAlert.transcriptExcerpt, profile);

  // Calculate relative timestamp
  const secondsAgo = Math.max(0, Math.round((Date.now() - displayAlert.timestampMs) / 1000));
  const relativeTime =
    secondsAgo < 10
      ? "Just now"
      : secondsAgo < 60
      ? `${secondsAgo}s ago`
      : `${Math.round(secondsAgo / 60)}m ago`;

  const confidenceScore = Math.round((displayAlert.confidence || 0.95) * 100);

  // Alert Title based on event type
  const getAlertTitle = () => {
    switch (displayAlert.type) {
      case "DIRECT_QUESTION":
        return "Question for you!";
      case "NAME_MENTION":
        return "You were called!";
      case "IDENTIFIER_MENTION":
        return "Your ID was called!";
      case "KEYWORD_MENTION":
        return "Monitored Keyword!";
      case "ATTENDANCE_CALL":
        return "Attendance Check!";
      default:
        return "You were called!";
    }
  };

  return (
    <div
      style={{
        backgroundColor: THEME.colors.bgSecondary,
        border: `1px solid ${THEME.colors.border}`,
        borderRadius: THEME.radius.lg,
        padding: "16px",
        margin: "12px 0 16px 0",
        position: "relative",
      }}
    >
      {/* Top Header Row: Bell Squircle + Title + Play Action Button */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Green-tinted squircle with bell icon matching reference */}
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              backgroundColor: THEME.colors.greenMutedBg,
              border: `1px solid ${THEME.colors.greenBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <BellIcon size={20} color={THEME.colors.accentGreen} />
          </div>

          <div>
            <div
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: THEME.colors.textPrimary,
                letterSpacing: "-0.2px",
                lineHeight: 1.25,
              }}
            >
              {getAlertTitle()}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: THEME.colors.textSecondary,
                marginTop: "3px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>{relativeTime}</span>
              <span>·</span>
              <span>{confidenceScore}% confidence</span>
              {currentAlertIndex > 0 && (
                <span
                  style={{
                    backgroundColor: THEME.colors.surfaceHighlight,
                    color: THEME.colors.accentAmber,
                    padding: "1px 5px",
                    borderRadius: THEME.radius.xs,
                    fontSize: "10px",
                    fontWeight: 600,
                    marginLeft: "4px",
                  }}
                >
                  Past #{currentAlertIndex + 1}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Play & Dismiss Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={onPlayChime}
            title="Replay alert chime"
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: THEME.colors.accentGreen,
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: `0 2px 10px ${THEME.colors.greenGlow}`,
              transition: "transform 0.12s ease, background-color 0.12s ease",
            }}
          >
            <PlaySolidIcon size={13} color="#090A0B" style={{ marginLeft: "2px" }} />
          </button>
          <button
            onClick={onDismissAlert}
            title="Dismiss & Silence Alert"
            style={{
              background: "none",
              border: "none",
              color: THEME.colors.textMuted,
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CloseIcon size={14} color={THEME.colors.textMuted} />
          </button>
        </div>
      </div>

      {/* Transcript Evidence Quote (Green vertical line + Italic quote) */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: "10px",
          marginBottom: "14px",
        }}
      >
        <div
          style={{
            width: "3px",
            backgroundColor: THEME.colors.accentGreen,
            borderRadius: "2px",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: "13.5px",
              fontStyle: "italic",
              fontWeight: 500,
              color: THEME.colors.textPrimary,
              lineHeight: 1.45,
            }}
          >
            "{coreText || displayAlert.transcriptExcerpt}"
          </div>

          {/* Toggle raw caption if cleaned */}
          {displayAlert.transcriptExcerpt !== coreText && (
            <button
              onClick={() => setShowRawCaption(!showRawCaption)}
              style={{
                background: "none",
                border: "none",
                color: THEME.colors.textSecondary,
                fontSize: "10px",
                cursor: "pointer",
                padding: "4px 0 0 0",
                textDecoration: "underline",
              }}
            >
              {showRawCaption ? "Hide raw caption" : "View raw caption"}
            </button>
          )}

          {showRawCaption && (
            <div
              style={{
                marginTop: "6px",
                padding: "6px 8px",
                backgroundColor: THEME.colors.surface,
                borderRadius: THEME.radius.sm,
                fontSize: "11px",
                color: THEME.colors.textSecondary,
                fontStyle: "normal",
                border: `1px solid ${THEME.colors.borderSubtle}`,
                maxHeight: "60px",
                overflowY: "auto",
              }}
            >
              {displayAlert.transcriptExcerpt}
            </div>
          )}
        </div>
      </div>

      {/* Connected Follow-up Sentence Badge (if any) */}
      {activeFollowUp && (
        <div
          style={{
            marginBottom: "12px",
            padding: "6px 10px",
            backgroundColor: THEME.colors.blueMutedBg,
            borderRadius: THEME.radius.sm,
            border: "1px solid #1D3B5C",
            fontSize: "11px",
            color: "#93C5FD",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: 600 }}>🔗 Follow-up: "{activeFollowUp}"</span>
          <span style={{ fontSize: "9px", opacity: 0.85 }}>{relationReason}</span>
        </div>
      )}

      {/* Shifted to Another Participant Warning */}
      {addressedToOther && (
        <div
          style={{
            marginBottom: "12px",
            padding: "6px 10px",
            backgroundColor: THEME.colors.amberMutedBg,
            borderRadius: THEME.radius.sm,
            border: `1px solid ${THEME.colors.amberBorder}`,
            fontSize: "11px",
            color: "#FCD34D",
          }}
        >
          ⚠️ Speaker addressed {otherTarget || "another person"}. Question may have moved on.
        </div>
      )}

      {/* Suggested Response (Single Full-Visibility Card with Room to Read) */}
      <div style={{ marginTop: "14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          {/* Tone / Style Switcher Pills (Direct / Professional / Clarification) */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {suggestions.map((sug, i) => {
              const isSelected = selectedToneIndex === i;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedToneIndex(i)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: THEME.radius.xs,
                    border: `1px solid ${isSelected ? THEME.colors.greenBorder : THEME.colors.borderSubtle}`,
                    backgroundColor: isSelected ? THEME.colors.greenMutedBg : THEME.colors.surface,
                    color: isSelected ? THEME.colors.accentGreen : THEME.colors.textSecondary,
                    fontSize: "11px",
                    fontWeight: isSelected ? 600 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    transition: "all 0.15s ease",
                  }}
                >
                  {sug.label === "Direct" && <LightningIcon size={12} color={isSelected ? THEME.colors.accentGreen : THEME.colors.textSecondary} />}
                  {sug.label === "Professional" && <BriefcaseIcon size={12} color={isSelected ? THEME.colors.accentGreen : THEME.colors.textSecondary} />}
                  {sug.label === "Clarification" && <QuestionCircleIcon size={12} color={isSelected ? THEME.colors.accentGreen : THEME.colors.textSecondary} />}
                  <span>{sug.label}</span>
                </button>
              );
            })}
          </div>

          {/* Regenerate AI button */}
          {geminiApiKey && (
            <button
              onClick={() => onRegenerateAi(displayAlert)}
              disabled={isGeneratingAi}
              style={{
                background: "none",
                border: "none",
                color: THEME.colors.accentGreen,
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                padding: "2px 4px",
                display: "flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              <LightningIcon size={11} color={THEME.colors.accentGreen} />
              <span>{isGeneratingAi ? "Generating..." : "Regenerate"}</span>
            </button>
          )}
        </div>

        {/* Real-time AI Generation status pill */}
        {isGeneratingAi && (
          <div
            style={{
              marginBottom: "8px",
              padding: "4px 8px",
              backgroundColor: THEME.colors.greenMutedBg,
              borderRadius: THEME.radius.sm,
              border: `1px solid ${THEME.colors.greenBorder}`,
              fontSize: "10.5px",
              color: THEME.colors.accentGreen,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: THEME.colors.accentGreen,
                boxShadow: `0 0 6px ${THEME.colors.accentGreen}`,
              }}
            />
            <span>Thinking... Querying Google Gemini AI for this new question</span>
          </div>
        )}

        {/* The Full Answer Card - No Truncation, Generous Room to Read */}
        {(() => {
          const currentSug = suggestions[selectedToneIndex] || suggestions[0];
          if (!currentSug) return null;
          const isCopied = copiedSuggestionIdx === selectedToneIndex;

          return (
            <div
              style={{
                backgroundColor: THEME.colors.surface,
                border: `1px solid ${THEME.colors.borderSubtle}`,
                borderRadius: THEME.radius.md,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  lineHeight: "1.55",
                  color: THEME.colors.textPrimary,
                  fontWeight: 400,
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                  marginBottom: "12px",
                }}
              >
                "{currentSug.text}"
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: "8px",
                  borderTop: `1px solid ${THEME.colors.borderSubtle}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10.5px", color: THEME.colors.textMuted }}>
                    {currentSug.label} response
                  </span>
                  {currentSug.source === "gemini" && (
                    <span
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 600,
                        color: THEME.colors.accentGreen,
                        backgroundColor: THEME.colors.greenMutedBg,
                        border: `1px solid ${THEME.colors.greenBorder}`,
                        borderRadius: "3px",
                        padding: "1px 5px",
                      }}
                    >
                      ✨ Gemini AI
                    </span>
                  )}
                  {currentSug.source === "wikipedia" && (
                    <span
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 500,
                        color: "#93C5FD",
                        backgroundColor: THEME.colors.blueMutedBg,
                        border: "1px solid #1D3B5C",
                        borderRadius: "3px",
                        padding: "1px 5px",
                      }}
                    >
                      📖 Encyclopedia
                    </span>
                  )}
                </div>

                <button
                  onClick={() => onCopySuggestion(currentSug.text, selectedToneIndex)}
                  title="Copy full answer to clipboard"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    backgroundColor: isCopied ? THEME.colors.greenMutedBg : THEME.colors.surfaceHighlight,
                    border: `1px solid ${isCopied ? THEME.colors.greenBorder : THEME.colors.borderActive}`,
                    borderRadius: THEME.radius.sm,
                    color: isCopied ? THEME.colors.accentGreen : THEME.colors.textPrimary,
                    fontSize: "11.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {isCopied ? (
                    <>
                      <CheckIcon size={13} color={THEME.colors.accentGreen} />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon size={13} color={THEME.colors.textSecondary} />
                      <span>Copy Answer</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Missing Gemini Key prompt */}
        {!geminiApiKey && isQuestion && (
          <button
            onClick={onOpenSettings}
            style={{
              width: "100%",
              marginTop: "8px",
              padding: "7px 10px",
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.sm,
              color: THEME.colors.textSecondary,
              fontSize: "10.5px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>💡 Add free Gemini API Key for deep factual answers</span>
            <span style={{ color: THEME.colors.accentGreen, fontWeight: 600 }}>Add Key →</span>
          </button>
        )}
      </div>

      {/* Prior Speech Context Drawer ("What You Missed") */}
      {priorContextTranscripts.length > 0 && (
        <div style={{ marginTop: "12px", borderTop: `1px solid ${THEME.colors.borderSubtle}`, paddingTop: "8px" }}>
          <button
            onClick={() => setShowPriorContext(!showPriorContext)}
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
            <span>{showPriorContext ? "▲ Hide prior context" : "▼ What you missed (prior speech)"}</span>
          </button>

          {showPriorContext && (
            <div
              style={{
                marginTop: "8px",
                padding: "8px 10px",
                backgroundColor: THEME.colors.surface,
                borderRadius: THEME.radius.sm,
                border: `1px solid ${THEME.colors.borderSubtle}`,
                fontSize: "11px",
                color: THEME.colors.textSecondary,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {priorContextTranscripts.map((t) => (
                <div key={t.id}>
                  <strong style={{ color: THEME.colors.textPrimary }}>{t.speakerId || "Speaker"}:</strong> {t.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alert Pagination (Previous / Next Alert) */}
      {alertsHistory.length > 1 && (
        <div
          style={{
            marginTop: "12px",
            paddingTop: "10px",
            borderTop: `1px solid ${THEME.colors.borderSubtle}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            disabled={currentAlertIndex >= alertsHistory.length - 1}
            onClick={() => onNavigateAlert(Math.min(alertsHistory.length - 1, currentAlertIndex + 1))}
            style={{
              background: "none",
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.xs,
              padding: "3px 8px",
              color: currentAlertIndex >= alertsHistory.length - 1 ? THEME.colors.textMuted : THEME.colors.textSecondary,
              cursor: currentAlertIndex >= alertsHistory.length - 1 ? "not-allowed" : "pointer",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <ChevronLeftIcon size={12} color="currentColor" />
            <span>Prev</span>
          </button>

          <span style={{ fontSize: "11px", color: THEME.colors.textSecondary }}>
            Alert {currentAlertIndex + 1} of {alertsHistory.length}
          </span>

          <button
            disabled={currentAlertIndex <= 0}
            onClick={() => onNavigateAlert(Math.max(0, currentAlertIndex - 1))}
            style={{
              background: "none",
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.xs,
              padding: "3px 8px",
              color: currentAlertIndex <= 0 ? THEME.colors.textMuted : THEME.colors.textSecondary,
              cursor: currentAlertIndex <= 0 ? "not-allowed" : "pointer",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>Next</span>
            <ChevronRightIcon size={12} color="currentColor" />
          </button>
        </div>
      )}
    </div>
  );
};

