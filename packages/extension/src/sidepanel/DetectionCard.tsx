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

// Feature flag: Question answering / suggested responses deactivated to focus 100% on the alert engine
const ENABLE_SUGGESTED_RESPONSES = false;

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
          backgroundColor: THEME.colors.surface,
          border: `1px solid #333338`,
          borderRadius: THEME.radius.sm,
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          margin: "12px 0 18px 0",
          boxSizing: "border-box",
          boxShadow: "0 2px 14px rgba(0,0,0,0.4)",
        }}
      >
        {/* Solid Inverted Yellow Tag */}
        <div
          style={{
            display: "inline-block",
            backgroundColor: THEME.colors.accentYellow,
            color: "#000000",
            padding: "3px 9px",
            borderRadius: "2px",
            fontFamily: THEME.typography.displayFont,
            fontSize: "12px",
            fontWeight: 800,
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginBottom: "10px",
          }}
        >
          STANDBY // ACTIVE
        </div>

        <div
          style={{
            fontSize: "20px",
            fontWeight: 700,
            fontFamily: THEME.typography.displayFont,
            color: "#FFFFFF",
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          Monitoring for callouts
        </div>

        <div
          style={{
            fontSize: "13.5px",
            fontFamily: THEME.typography.monoFamily,
            color: "#E2E2E6",
            maxWidth: "320px",
            lineHeight: 1.6,
            fontWeight: 600,
          }}
        >
          WATCHING FOR: <span style={{ color: THEME.colors.accentYellow, fontWeight: 800 }}>{profile.displayName?.toUpperCase() || "NAME"}</span>
          {profile.identifiers?.length > 0 ? (
            <span style={{ color: THEME.colors.accentYellow, fontWeight: 800 }}> · #{profile.identifiers.join(", #")}</span>
          ) : ""}
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
        border: `1.5px solid ${THEME.colors.accentYellow}`,
        borderRadius: THEME.radius.md,
        padding: "16px",
        margin: "10px 0 16px 0",
        position: "relative",
        boxShadow: "0 0 20px rgba(255, 230, 0, 0.12)",
      }}
    >
      {/* Top Header Row: Inverted Yellow Badge + Metadata + Play Action */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        <div>
          {/* Brutalist Inverted Tag with Tall Condensed Grotesque Display Font */}
          <div
            style={{
              display: "inline-block",
              backgroundColor: THEME.colors.accentYellow,
              color: "#000000",
              fontSize: "12px",
              fontFamily: THEME.typography.displayFont,
              fontWeight: 700,
              padding: "2px 8px 1px 8px",
              borderRadius: "2px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              marginBottom: "6px",
              lineHeight: 1.3,
            }}
          >
            {getAlertTitle()}
          </div>

          <div
            style={{
              fontSize: "10.5px",
              fontFamily: THEME.typography.monoFamily,
              color: "#8E8E93",
              letterSpacing: "0.4px",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>{relativeTime.toUpperCase()}</span>
            {currentAlertIndex > 0 && (
              <span
                style={{
                  backgroundColor: THEME.colors.surfaceHighlight,
                  color: THEME.colors.accentYellow,
                  padding: "1px 5px",
                  borderRadius: THEME.radius.xs,
                  fontWeight: 700,
                }}
              >
                #{currentAlertIndex + 1}
              </span>
            )}
          </div>
        </div>

        {/* Right Play & Dismiss Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={onPlayChime}
            title="Replay alert chime"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "3px",
              backgroundColor: THEME.colors.accentYellow,
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: `0 0 10px ${THEME.colors.yellowGlow}`,
              transition: "transform 0.1s ease",
            }}
          >
            <PlaySolidIcon size={12} color="#000000" style={{ marginLeft: "1px" }} />
          </button>
          <button
            onClick={onDismissAlert}
            title="Dismiss & Silence Alert"
            style={{
              background: "none",
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: "3px",
              color: THEME.colors.textSecondary,
              cursor: "pointer",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CloseIcon size={12} color={THEME.colors.textSecondary} />
          </button>
        </div>
      </div>

      {/* Question / Callout Spotlight Box */}
      <div
        style={{
          backgroundColor: "#161618",
          border: "1px solid #28282D",
          borderRadius: "4px",
          padding: "16px 18px",
          marginBottom: "12px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontFamily: THEME.typography.serifFont,
            fontSize: "18px",
            fontWeight: 500,
            color: "#FFFFFF",
            lineHeight: 1.55,
            letterSpacing: "-0.1px",
          }}
        >
          "{coreText || displayAlert.transcriptExcerpt}"
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

      {/* Suggested Response (Deactivated as per user request - focusing 100% on the core alert engine) */}
      {ENABLE_SUGGESTED_RESPONSES && (
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
      )}

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

