import React from "react";
import { MeetingEvent } from "@oiu/shared";
import { THEME } from "./theme";
import { ArrowLeftIcon, WaveformSmallIcon, ChevronRightIcon } from "./icons";

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
        padding: "16px",
        overflowY: "auto",
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
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
            <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "-0.2px" }}>Alert History</div>
            <div style={{ fontSize: "11px", color: THEME.colors.textSecondary }}>
              {alertsHistory.length} saved alert{alertsHistory.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {alertsHistory.length > 0 && (
          <button
            onClick={onClearHistory}
            style={{
              background: "none",
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.xs,
              color: THEME.colors.accentRed,
              fontSize: "11px",
              padding: "4px 8px",
              cursor: "pointer",
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
            fontSize: "13px",
            textAlign: "center",
            padding: "32px 16px",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              backgroundColor: THEME.colors.surface,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "10px",
            }}
          >
            <WaveformSmallIcon size={20} color={THEME.colors.textMuted} />
          </div>
          <div>No alerts recorded yet.</div>
          <div style={{ fontSize: "11px", color: THEME.colors.textMuted, marginTop: "4px" }}>
            Alerts will appear here when your name or monitored topics are called.
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
                onClick={() => {
                  onSelectAlert(idx);
                  onClose();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: THEME.colors.bgSecondary,
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: THEME.radius.md,
                  padding: "12px 14px",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", flex: 1, minWidth: 0, marginRight: "10px" }}>
                  <div style={{ marginTop: "2px" }}>
                    <WaveformSmallIcon size={14} color={THEME.colors.accentGreen} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", marginBottom: "3px" }}>
                      <span style={{ fontWeight: 600, color: THEME.colors.textPrimary }}>{timeStr}</span>
                      <span style={{ color: THEME.colors.textMuted }}>·</span>
                      <span style={{ color: THEME.colors.textSecondary }}>{alt.explanation}</span>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontStyle: "italic",
                        color: THEME.colors.textSecondary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
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

