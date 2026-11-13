import React from "react";
import { MeetingEvent } from "@oiu/shared";
import { THEME } from "./theme";
import { ArrowLeftIcon, BellIcon, ChevronRightIcon, SparklesIcon } from "./icons";

interface HistoryViewProps {
  alertsHistory: MeetingEvent[];
  onSelectAlert: (index: number) => void;
  onClearHistory: () => void;
  onClose: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  alertsHistory,
  onSelectAlert,
  onClearHistory,
  onClose,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: THEME.colors.bg,
        color: THEME.colors.textPrimary,
        boxSizing: "border-box",
        padding: "18px 16px 24px 16px",
        overflowY: "auto",
        fontFamily: THEME.typography.fontFamily,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "14px",
          borderBottom: `1px solid ${THEME.colors.border}`,
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
          <div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: THEME.colors.textPrimary, letterSpacing: "-0.2px" }}>
              Alert History
            </div>
            <div style={{ fontSize: "11px", color: THEME.colors.textSecondary }}>
              {alertsHistory.length} saved alert{alertsHistory.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {alertsHistory.length > 0 && (
          <button
            onClick={onClearHistory}
            style={{
              background: THEME.colors.accentCoralLight,
              border: `1px solid ${THEME.colors.accentCoralBorder}`,
              borderRadius: THEME.radius.sm,
              color: THEME.colors.accentCoralDark,
              fontSize: "11px",
              fontWeight: 700,
              padding: "5px 10px",
              cursor: "pointer",
              transition: THEME.transitions.fast,
            }}
          >
            Clear All
          </button>
        )}
      </div>

      {/* History List */}
      {alertsHistory.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: THEME.colors.textSecondary,
            textAlign: "center",
            padding: "40px 16px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "12px",
              boxShadow: THEME.shadows.sm,
            }}
          >
            <SparklesIcon size={22} color={THEME.colors.accentLavenderDark} />
          </div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: THEME.colors.textPrimary, marginBottom: "4px" }}>
            All quiet for now
          </div>
          <div style={{ fontSize: "12px", color: THEME.colors.textSecondary, maxWidth: "260px", lineHeight: 1.5 }}>
            No important mentions have been detected during this session yet.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {alertsHistory.map((alt, idx) => {
            const timeStr = new Date(alt.timestampMs).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={alt.id || idx}
                className="aura-interactive-card"
                onClick={() => {
                  onSelectAlert(idx);
                  onClose();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: THEME.colors.surface,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.md,
                  padding: "12px 14px",
                  cursor: "pointer",
                  boxShadow: THEME.shadows.card,
                  transition: THEME.transitions.fast,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", flex: 1, minWidth: 0, marginRight: "10px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: THEME.radius.sm,
                      backgroundColor: THEME.colors.accentLavenderLight,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: "1px",
                      flexShrink: 0,
                    }}
                  >
                    <BellIcon size={13} color={THEME.colors.accentLavenderDark} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", marginBottom: "3px" }}>
                      <span style={{ fontWeight: 700, color: THEME.colors.textPrimary }}>{timeStr}</span>
                      <span style={{ color: THEME.colors.textMuted }}>·</span>
                      <span style={{ color: THEME.colors.accentLavenderDark, fontWeight: 600 }}>{alt.explanation}</span>
                    </div>
                    <div
                      style={{
                        fontSize: "12.5px",
                        color: THEME.colors.textPrimary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: 500,
                      }}
                    >
                      "{alt.transcriptExcerpt}"
                    </div>
                  </div>
                </div>

                <ChevronRightIcon size={14} color={THEME.colors.textMuted} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
