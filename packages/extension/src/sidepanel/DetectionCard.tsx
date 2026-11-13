import React, { useState } from "react";
import { MeetingEvent, UserProfile } from "@oiu/shared";
import { THEME } from "./theme";
import {
  BellIcon,
  PlaySolidIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from "./icons";
import {
  SuggestedResponse,
  extractCoreCalloutOrQuestion,
} from "../services/aiService";

// Suggested-response controls remain absent from this alert-focused component.
// Keep transcript trigger highlighting from main.
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedCallout(text: string, profile: UserProfile): React.ReactNode {
  if (!text) return text;

  const rawTerms = [
    profile.displayName,
    ...(profile.aliases || []),
    ...(profile.identifiers || []).flatMap((id) => {
      const trimmed = id.trim();
      const withoutHash = trimmed.replace(/^#+/, "");
      return withoutHash && withoutHash !== trimmed ? [trimmed, withoutHash] : [trimmed];
    }),
    ...(profile.keywords || []),
  ];

  const seen = new Set<string>();
  const terms: string[] = [];
  for (const item of rawTerms) {
    const clean = (item || "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      terms.push(clean);
    }
  }

  if (terms.length === 0) return text;

  // Match longest triggers first so e.g. "Tathagat" wins over shorter substrings
  terms.sort((a, b) => b.length - a.length);
  const pattern = terms.map(escapeRegex).join("|");
  const splitRegex = new RegExp(`(?<![A-Za-z0-9])(${pattern})(?![A-Za-z0-9])`, "gi");
  const parts = text.split(splitRegex);

  if (parts.length <= 1) return text;

  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark
        key={idx}
        style={{
          backgroundColor: THEME.colors.accentPeachLight,
          color: THEME.colors.textPrimary,
          padding: "0 5px",
          borderRadius: "2px",
          fontWeight: 700,
        }}
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

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
  onRegenerateAi: (event: MeetingEvent) => void;
  onOpenSettings: () => void;
  onPlayChime?: () => void;
}

export const DetectionCard: React.FC<DetectionCardProps> = ({
  activeAlert,
  alertsHistory,
  currentAlertIndex,
  profile,
  priorContextTranscripts,
  onNavigateAlert,
  onDismissAlert,
  onPlayChime,
}) => {
  const [showPriorContext, setShowPriorContext] = useState(false);

  // Determine which alert to display: either activeAlert or explicitly selected alert from history
  const displayAlert =
    activeAlert ||
    (alertsHistory.length > 0 && currentAlertIndex >= 0 && currentAlertIndex < alertsHistory.length
      ? alertsHistory[currentAlertIndex]
      : null);

  // If no alert is active or selected, do not render a conflicting empty placeholder card
  if (!displayAlert) {
    return null;
  }

  const {
    coreText,
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

  // Alert Title based on event type with contextual precision
  const getAlertDetails = () => {
    switch (displayAlert.type) {
      case "DIRECT_QUESTION":
        return {
          title: "Question directed to you",
          bg: THEME.colors.accentPeachLight,
          border: THEME.colors.accentPeachBorder,
          accent: THEME.colors.accentPeachDark,
          badgeText: THEME.colors.accentPeachDark,
        };
      case "NAME_MENTION":
        return {
          title: "Direct callout addressed to you",
          bg: THEME.colors.accentLavenderLight,
          border: THEME.colors.accentLavenderBorder,
          accent: THEME.colors.accentLavenderDark,
          badgeText: THEME.colors.accentLavenderDark,
        };
      case "IDENTIFIER_MENTION":
        return {
          title: "Your roll number was called",
          bg: THEME.colors.accentPeachLight,
          border: THEME.colors.accentPeachBorder,
          accent: THEME.colors.accentPeachDark,
          badgeText: THEME.colors.accentPeachDark,
        };
      case "KEYWORD_MENTION":
        return {
          title: "Monitored keyword spoken",
          bg: THEME.colors.accentLavenderLight,
          border: THEME.colors.accentLavenderBorder,
          accent: THEME.colors.accentLavenderDark,
          badgeText: THEME.colors.accentLavenderDark,
        };
      case "ATTENDANCE_CALL":
        return {
          title: "Attendance callout in progress",
          bg: THEME.colors.accentPeachLight,
          border: THEME.colors.accentPeachBorder,
          accent: THEME.colors.accentCoralDark,
          badgeText: THEME.colors.accentPeachDark,
        };
      default:
        return {
          title: "Important mention flagged",
          bg: THEME.colors.accentLavenderLight,
          border: THEME.colors.accentLavenderBorder,
          accent: THEME.colors.accentLavenderDark,
          badgeText: THEME.colors.accentLavenderDark,
        };
    }
  };

  const alertDetails = getAlertDetails();

  return (
    <div
      className="aura-card-enter"
      style={{
        backgroundColor: THEME.colors.surface,
        border: `1px solid ${alertDetails.border}`,
        borderLeft: `4px solid ${alertDetails.accent}`,
        borderRadius: THEME.radius.md,
        padding: "14px 15px",
        margin: "8px 0 14px 0",
        position: "relative",
        boxShadow: THEME.shadows.cardHover,
        transition: THEME.transitions.normal,
      }}
    >
      {/* Top Header Row: AURA Badge + Metadata + Play/Dismiss Actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              backgroundColor: alertDetails.bg,
              border: `1px solid ${alertDetails.border}`,
              color: alertDetails.badgeText,
              fontSize: "11px",
              fontWeight: 700,
              padding: "2.5px 8px",
              borderRadius: THEME.radius.pill,
            }}
          >
            <BellIcon size={11} color={alertDetails.badgeText} />
            <span>{alertDetails.title}</span>
          </div>

          <div
            style={{
              fontSize: "11px",
              color: THEME.colors.textMuted,
              fontWeight: 500,
            }}
          >
            {relativeTime}
            {currentAlertIndex > 0 && (
              <span
                style={{
                  marginLeft: "4px",
                  backgroundColor: THEME.colors.bgSubtle,
                  color: THEME.colors.textSecondary,
                  padding: "1px 5px",
                  borderRadius: THEME.radius.xs,
                  fontWeight: 600,
                  fontSize: "10.5px",
                }}
              >
                #{currentAlertIndex + 1}
              </span>
            )}
          </div>
        </div>

        {/* Right Play & Dismiss Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          {onPlayChime && (
            <button
              type="button"
              onClick={onPlayChime}
              title="Replay alert chime"
              aria-label="Replay alert chime"
              style={{
                width: "28px",
                height: "28px",
                borderRadius: THEME.radius.sm,
                backgroundColor: THEME.colors.accentLavenderLight,
                border: `1px solid ${THEME.colors.accentLavenderBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: THEME.transitions.fast,
              }}
            >
              <PlaySolidIcon size={10} color={THEME.colors.accentLavenderDark} style={{ marginLeft: "1px" }} />
            </button>
          )}
          <button
            type="button"
            onClick={onDismissAlert}
            title="Dismiss Alert"
            aria-label="Dismiss Alert"
            style={{
              width: "28px",
              height: "28px",
              backgroundColor: THEME.colors.bgSubtle,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.sm,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: THEME.transitions.fast,
            }}
          >
            <CloseIcon size={12} color={THEME.colors.textSecondary} />
          </button>
        </div>
      </div>

      {/* Question / Callout Spotlight Box */}
      <div
        style={{
          backgroundColor: THEME.colors.surfaceSubtle,
          border: `1px solid ${THEME.colors.borderSubtle}`,
          borderRadius: THEME.radius.md,
          padding: "12px 14px",
          marginBottom: "10px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontSize: "13.5px",
            fontWeight: 600,
            color: THEME.colors.textPrimary,
            lineHeight: 1.5,
          }}
        >
          "{renderHighlightedCallout(coreText || displayAlert.transcriptExcerpt, profile)}"
        </div>
      </div>

      {/* Connected Follow-up Sentence Badge (if any) */}
      {activeFollowUp && (
        <div
          style={{
            marginBottom: "8px",
            padding: "6px 10px",
            backgroundColor: THEME.colors.accentBlueLight,
            borderRadius: THEME.radius.sm,
            border: `1px solid ${THEME.colors.accentBlueBorder}`,
            fontSize: "11px",
            color: THEME.colors.accentBlueDark,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: 600 }}>🔗 Follow-up: "{activeFollowUp}"</span>
          {relationReason && <span style={{ fontSize: "9.5px", opacity: 0.85 }}>{relationReason}</span>}
        </div>
      )}

      {/* Shifted to Another Participant Warning */}
      {addressedToOther && (
        <div
          style={{
            marginBottom: "8px",
            padding: "6px 10px",
            backgroundColor: THEME.colors.amberMutedBg,
            borderRadius: THEME.radius.sm,
            border: `1px solid ${THEME.colors.amberBorder}`,
            fontSize: "11px",
            color: THEME.colors.accentAmber,
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span>Speaker addressed {otherTarget || "another person"}. Question may have moved on.</span>
        </div>
      )}

      {/* Prior Speech Context Drawer ("What You Missed") */}
      {priorContextTranscripts && priorContextTranscripts.length > 0 && (
        <div style={{ marginTop: "8px", borderTop: `1px solid ${THEME.colors.borderSubtle}`, paddingTop: "6px" }}>
          <button
            onClick={() => setShowPriorContext(!showPriorContext)}
            style={{
              background: "none",
              border: "none",
              color: THEME.colors.accentLavenderDark,
              fontSize: "11px",
              fontWeight: 600,
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
                marginTop: "6px",
                padding: "8px 10px",
                backgroundColor: THEME.colors.bgSubtle,
                borderRadius: THEME.radius.sm,
                border: `1px solid ${THEME.colors.borderSubtle}`,
                fontSize: "11px",
                color: THEME.colors.textSecondary,
                display: "flex",
                flexDirection: "column",
                gap: "4px",
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
            marginTop: "10px",
            paddingTop: "8px",
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
              background: THEME.colors.bgSubtle,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.xs,
              padding: "3px 8px",
              color: currentAlertIndex >= alertsHistory.length - 1 ? THEME.colors.textMuted : THEME.colors.textPrimary,
              cursor: currentAlertIndex >= alertsHistory.length - 1 ? "not-allowed" : "pointer",
              fontSize: "10.5px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "3px",
            }}
          >
            <ChevronLeftIcon size={11} color="currentColor" />
            <span>Prev</span>
          </button>

          <span style={{ fontSize: "10.5px", color: THEME.colors.textSecondary, fontWeight: 500 }}>
            Alert {currentAlertIndex + 1} of {alertsHistory.length}
          </span>

          <button
            disabled={currentAlertIndex <= 0}
            onClick={() => onNavigateAlert(Math.max(0, currentAlertIndex - 1))}
            style={{
              background: THEME.colors.bgSubtle,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.xs,
              padding: "3px 8px",
              color: currentAlertIndex <= 0 ? THEME.colors.textMuted : THEME.colors.textPrimary,
              cursor: currentAlertIndex <= 0 ? "not-allowed" : "pointer",
              fontSize: "10.5px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "3px",
            }}
          >
            <span>Next</span>
            <ChevronRightIcon size={11} color="currentColor" />
          </button>
        </div>
      )}
    </div>
  );
};
