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
        padding: "16px",
        overflowY: "hidden",
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
            <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "-0.2px" }}>Live Meeting Stream</div>
            <div style={{ fontSize: "11px", color: THEME.colors.textSecondary }}>
              {transcripts.length} transcript segments captured
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {isListening && (
            <button
              onClick={handleKickstart}
              title="Kickstart Meet Captions (Fixes stalled captions)"
              style={{
                background: "none",
                border: `1px solid ${kickstartFeedback ? THEME.colors.greenBorder : THEME.colors.border}`,
                borderRadius: THEME.radius.xs,
                color: kickstartFeedback ? THEME.colors.accentGreen : THEME.colors.textSecondary,
                fontSize: "11px",
                padding: "4px 8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                backgroundColor: kickstartFeedback ? THEME.colors.greenMutedBg : THEME.colors.surface,
                transition: "all 0.15s ease",
              }}
            >
              <ZapIcon size={11} color={kickstartFeedback ? THEME.colors.accentGreen : THEME.colors.textSecondary} />
              <span>{kickstartFeedback ? "Kickstarted!" : "Kickstart"}</span>
            </button>
          )}

          {transcripts.length > 0 && (
            <button
              onClick={onClearTranscripts}
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
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Current Dialogue Live Analysis Card */}
      {liveDialogue && liveDialogue.sentences.length > 0 && (
        <div
          style={{
            backgroundColor: THEME.colors.bgSecondary,
            border: `1px solid ${THEME.colors.border}`,
            borderRadius: THEME.radius.md,
            padding: "12px",
            marginBottom: "12px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: THEME.colors.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Active Dialogue Sequence
            </span>
            <span
              style={{
                fontSize: "9.5px",
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: THEME.radius.xs,
                backgroundColor:
                  liveDialogue.activeSentence.relation === "connected"
                    ? THEME.colors.blueMutedBg
                    : THEME.colors.greenMutedBg,
                color:
                  liveDialogue.activeSentence.relation === "connected"
                    ? "#93C5FD"
                    : THEME.colors.accentGreen,
              }}
            >
              {liveDialogue.activeSentence.relation === "connected" ? "🔗 CONNECTED" : "● LIVE ACTIVE"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {/* Previous completed sentences */}
            {liveDialogue.previousSentences.map((s, i) => (
              <div
                key={s.id || i}
                style={{
                  padding: "5px 8px",
                  backgroundColor: THEME.colors.surface,
                  borderLeft: `2px solid ${THEME.colors.textMuted}`,
                  borderRadius: "0 4px 4px 0",
                  fontSize: "11px",
                  color: THEME.colors.textSecondary,
                }}
              >
                <div style={{ fontSize: "9px", color: THEME.colors.textMuted, marginBottom: "2px" }}>
                  [COMPLETED] {s.speakerId || "Speaker"}
                </div>
                <div>"{s.text}"</div>
              </div>
            ))}

            {/* Current active sentence */}
            <div
              style={{
                padding: "7px 10px",
                backgroundColor: THEME.colors.surfaceHighlight,
                borderLeft: `3px solid ${
                  liveDialogue.activeSentence.relation === "connected"
                    ? "#3B82F6"
                    : THEME.colors.accentGreen
                }`,
                borderRadius: "0 4px 4px 0",
                fontSize: "12px",
                color: THEME.colors.textPrimary,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9.5px", marginBottom: "3px" }}>
                <span style={{ fontWeight: 700, color: THEME.colors.accentGreen }}>
                  ● CURRENT: {liveDialogue.activeSentence.speakerId || "Speaker"}
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
          paddingRight: "4px",
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
              padding: "24px 12px",
              color: THEME.colors.textSecondary,
            }}
          >
            <MessageSquareIcon size={24} color={THEME.colors.textMuted} style={{ marginBottom: "8px" }} />
            <div style={{ fontSize: "13px" }}>
              {isListening ? "Listening for speech..." : "Transcript stream idle."}
            </div>
            <div style={{ fontSize: "11px", color: THEME.colors.textMuted, marginTop: "4px", maxWidth: "260px" }}>
              Captions from Google Meet will stream here in real time.
            </div>

            {isListening && (
              <button
                onClick={handleKickstart}
                style={{
                  marginTop: "14px",
                  padding: "7px 14px",
                  backgroundColor: kickstartFeedback ? THEME.colors.greenMutedBg : THEME.colors.surface,
                  border: `1px solid ${kickstartFeedback ? THEME.colors.greenBorder : THEME.colors.borderActive}`,
                  borderRadius: THEME.radius.md,
                  color: THEME.colors.accentGreen,
                  fontSize: "11.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <ZapIcon size={13} color={THEME.colors.accentGreen} />
                <span>{kickstartFeedback ? "Captions Kickstarted!" : "Kickstart / Connect Captions"}</span>
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
                  padding: "9px 12px",
                  backgroundColor: isNewest ? THEME.colors.surfaceHighlight : THEME.colors.bgSecondary,
                  border: `1px solid ${isNewest ? THEME.colors.borderActive : THEME.colors.borderSubtle}`,
                  borderRadius: THEME.radius.md,
                  fontSize: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 700, color: isNewest ? THEME.colors.accentGreen : THEME.colors.textSecondary }}>
                    {t.speakerId || "Speaker"} {isNewest && "(Active)"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {!t.isFinal ? (
                      <span style={{ color: THEME.colors.accentGreen, fontWeight: 700 }}>● Speaking...</span>
                    ) : (
                      <span style={{ color: THEME.colors.textMuted }}>✓</span>
                    )}
                    <span style={{ color: THEME.colors.textMuted }}>{timeStr}</span>
                  </div>
                </div>
                <div style={{ color: isNewest ? THEME.colors.textPrimary : THEME.colors.textSecondary, lineHeight: 1.45 }}>
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

