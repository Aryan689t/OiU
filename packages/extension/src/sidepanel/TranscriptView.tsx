import React, { useRef, useEffect, useState } from "react";
import { TranscriptSegment, DialogueAnalysis } from "@oiu/shared";
import { THEME } from "./theme";
import { ArrowLeftIcon, MessageSquareIcon, ZapIcon } from "./icons";

interface TranscriptViewProps {
  transcripts: TranscriptSegment[];
  liveDialogue: DialogueAnalysis | null;
  isListening: boolean;
  onClearTranscripts: () => void;
  onTurnOnCaptions: () => void;
  onKickstartCaptions?: () => void;
  onClose: () => void;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  transcripts,
  liveDialogue,
  isListening,
  onClearTranscripts,
  onTurnOnCaptions,
  onKickstartCaptions,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [kickstartFeedback, setKickstartFeedback] = useState(false);

  const handleKickstart = () => {
    setKickstartFeedback(true);
    setTimeout(() => setKickstartFeedback(false), 2000);
    if (onKickstartCaptions) {
      onKickstartCaptions();
    } else {
      onTurnOnCaptions();
    }
  };

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcripts]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: THEME.colors.bg,
        color: THEME.colors.textPrimary,
        boxSizing: "border-box",
        padding: "18px 16px 20px 16px",
        overflowY: "hidden",
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
          marginBottom: "14px",
          flexShrink: 0,
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
              Meeting Stream
            </div>
            <div style={{ fontSize: "11px", color: THEME.colors.textSecondary }}>
              {transcripts.length} transcript segment{transcripts.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {isListening && (
            <button
              onClick={handleKickstart}
              title="Kickstart Meet Captions"
              style={{
                backgroundColor: kickstartFeedback ? THEME.colors.accentSageLight : THEME.colors.surface,
                border: `1px solid ${kickstartFeedback ? THEME.colors.accentSageBorder : THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                color: kickstartFeedback ? THEME.colors.accentSageDark : THEME.colors.textPrimary,
                fontSize: "11px",
                fontWeight: 600,
                padding: "5px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                boxShadow: THEME.shadows.sm,
                transition: THEME.transitions.fast,
              }}
            >
              <ZapIcon size={11} color={kickstartFeedback ? THEME.colors.accentSageDark : THEME.colors.accentLavenderDark} />
              <span>{kickstartFeedback ? "Kickstarted!" : "Kickstart"}</span>
            </button>
          )}

          {transcripts.length > 0 && (
            <button
              onClick={onClearTranscripts}
              style={{
                background: THEME.colors.surface,
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.sm,
                color: THEME.colors.textSecondary,
                fontSize: "11px",
                fontWeight: 600,
                padding: "5px 10px",
                cursor: "pointer",
                boxShadow: THEME.shadows.sm,
                transition: THEME.transitions.fast,
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Current Dialogue Live Analysis Card (if available) */}
      {liveDialogue && liveDialogue.sentences.length > 0 && (
        <div
          style={{
            backgroundColor: THEME.colors.surface,
            border: `1px solid ${THEME.colors.border}`,
            borderRadius: THEME.radius.md,
            padding: "12px",
            marginBottom: "12px",
            flexShrink: 0,
            boxShadow: THEME.shadows.card,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: THEME.colors.textSecondary, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Active Dialogue Turn
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: THEME.radius.pill,
                backgroundColor:
                  liveDialogue.activeSentence.relation === "connected"
                    ? THEME.colors.accentBlueLight
                    : THEME.colors.accentSageLight,
                color:
                  liveDialogue.activeSentence.relation === "connected"
                    ? THEME.colors.accentBlueDark
                    : THEME.colors.accentSageDark,
              }}
            >
              {liveDialogue.activeSentence.relation === "connected" ? "🔗 CONNECTED" : "● LIVE ACTIVE"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {liveDialogue.previousSentences.map((s, i) => (
              <div
                key={s.id || i}
                style={{
                  padding: "6px 10px",
                  backgroundColor: THEME.colors.bgSubtle,
                  borderLeft: `2.5px solid ${THEME.colors.border}`,
                  borderRadius: "0 6px 6px 0",
                  fontSize: "11.5px",
                  color: THEME.colors.textSecondary,
                }}
              >
                <div style={{ fontSize: "9.5px", color: THEME.colors.textMuted, marginBottom: "2px" }}>
                  {s.speakerId || "Speaker"}
                </div>
                <div>"{s.text}"</div>
              </div>
            ))}

            <div
              style={{
                padding: "8px 10px",
                backgroundColor: THEME.colors.surfaceSubtle,
                borderLeft: `3px solid ${
                  liveDialogue.activeSentence.relation === "connected"
                    ? THEME.colors.accentBlue
                    : THEME.colors.accentSage
                }`,
                borderRadius: "0 6px 6px 0",
                fontSize: "12px",
                color: THEME.colors.textPrimary,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "3px" }}>
                <span style={{ fontWeight: 700, color: THEME.colors.textPrimary }}>
                  ● {liveDialogue.activeSentence.speakerId || "Speaker"}
                </span>
                <span style={{ color: THEME.colors.textSecondary }}>
                  {liveDialogue.activeSentence.relationReason}
                </span>
              </div>
              <div style={{ fontWeight: 600 }}>"{liveDialogue.activeSentence.text}"</div>
            </div>
          </div>
        </div>
      )}

      {/* Transcript Stream Scroll Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          paddingRight: "2px",
        }}
      >
        {transcripts.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "40px 16px",
              color: THEME.colors.textSecondary,
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
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
              <MessageSquareIcon size={20} color={THEME.colors.accentLavenderDark} />
            </div>
            <div style={{ fontSize: "14.5px", fontWeight: 700, color: THEME.colors.textPrimary, marginBottom: "4px" }}>
              Your conversation will appear here
            </div>
            <div style={{ fontSize: "12px", color: THEME.colors.textSecondary, maxWidth: "260px", lineHeight: 1.5 }}>
              Transcript content will be displayed in real time as participants speak.
            </div>

            {isListening && (
              <button
                onClick={handleKickstart}
                style={{
                  marginTop: "16px",
                  padding: "8px 16px",
                  backgroundColor: kickstartFeedback ? THEME.colors.accentSageLight : THEME.colors.surface,
                  border: `1px solid ${kickstartFeedback ? THEME.colors.accentSageBorder : THEME.colors.border}`,
                  borderRadius: THEME.radius.md,
                  color: kickstartFeedback ? THEME.colors.accentSageDark : THEME.colors.textPrimary,
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: THEME.shadows.sm,
                  transition: THEME.transitions.fast,
                }}
              >
                <ZapIcon size={13} color={kickstartFeedback ? THEME.colors.accentSageDark : THEME.colors.accentLavenderDark} />
                <span>{kickstartFeedback ? "Captions Kickstarted!" : "Kickstart Meeting Captions"}</span>
              </button>
            )}
          </div>
        ) : (
          transcripts.map((t, idx) => {
            const isNewest = idx === transcripts.length - 1;
            const timeStr = new Date(t.endMs).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });

            return (
              <div
                key={t.id}
                style={{
                  padding: "10px 14px",
                  backgroundColor: THEME.colors.surface,
                  border: `1px solid ${isNewest ? THEME.colors.accentLavenderBorder : THEME.colors.border}`,
                  borderRadius: THEME.radius.md,
                  fontSize: "12.5px",
                  boxShadow: isNewest ? THEME.shadows.cardHover : THEME.shadows.card,
                  transition: THEME.transitions.fast,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10.5px", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 700, color: THEME.colors.textPrimary }}>
                    {t.speakerId || "Speaker"} {isNewest && "(Active)"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {!t.isFinal ? (
                      <span style={{ color: THEME.colors.accentSageDark, fontWeight: 700 }}>● Live</span>
                    ) : (
                      <span style={{ color: THEME.colors.textMuted }}>✓</span>
                    )}
                    <span style={{ color: THEME.colors.textMuted }}>{timeStr}</span>
                  </div>
                </div>
                <div style={{ color: THEME.colors.textPrimary, lineHeight: 1.5, fontWeight: 400 }}>
                  {t.text}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
