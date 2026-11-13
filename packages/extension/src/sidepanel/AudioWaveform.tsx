import React from "react";
import { THEME } from "./theme";
import { WaveformSmallIcon } from "./icons";

interface AudioWaveformProps {
  isListening: boolean;
  isVoiceActive: boolean;
  audioLevel: number;
  segmentsCount: number;
  currentTimeString: string;
  statusText?: string;
}

// 24 balanced vertical bars for the soft AURA visualizer
const BAR_PROFILES = [
  0.22, 0.35, 0.5, 0.45, 0.7, 0.85, 0.95, 0.8, 0.65, 0.85, 1.0, 0.9, 0.95,
  0.85, 0.7, 0.9, 0.8, 0.6, 0.68, 0.52, 0.38, 0.28, 0.22, 0.18
];

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isListening,
  isVoiceActive,
  audioLevel,
  segmentsCount,
  currentTimeString,
  statusText,
}) => {
  const hasLiveAudio = isListening && audioLevel > 0.04;

  const displayStatus =
    statusText ||
    (isListening
      ? hasLiveAudio
        ? "Active Speech Feed"
        : "Listening for Speech..."
      : "Audio Monitoring Standby");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 12px 10px 12px",
        width: "100%",
        boxSizing: "border-box",
        backgroundColor: THEME.colors.surface,
        borderRadius: THEME.radius.md,
        border: `1px solid ${THEME.colors.border}`,
        boxShadow: THEME.shadows.card,
        margin: "4px 0 12px 0",
      }}
    >
      {/* Top subtle indicators row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          marginBottom: "6px",
          paddingBottom: "5px",
          borderBottom: `1px solid ${THEME.colors.borderSubtle}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <WaveformSmallIcon
            size={13}
            color={hasLiveAudio ? THEME.colors.accentSageDark : THEME.colors.accentLavenderDark}
          />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.2px",
              color: hasLiveAudio ? THEME.colors.accentSageDark : THEME.colors.textSecondary,
              fontFamily: THEME.typography.fontFamily,
            }}
          >
            {displayStatus}
          </span>
        </div>

        <div
          style={{
            fontSize: "11px",
            color: THEME.colors.textMuted,
            fontFamily: THEME.typography.monoFamily,
            fontWeight: 600,
          }}
        >
          {currentTimeString}
        </div>
      </div>

      {/* AURA Audio Meter Bars */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "3.5px",
          height: "22px",
          width: "100%",
          padding: "0 2px",
          boxSizing: "border-box",
        }}
        aria-label="Real-time meeting audio visualizer"
      >
        {BAR_PROFILES.map((profile, idx) => {
          let heightScale = 0.16;

          if (!isListening) {
            heightScale = 0.14;
          } else if (hasLiveAudio) {
            const waveMod = 0.75 + 0.25 * Math.abs(Math.sin(idx * 0.75 + audioLevel * 14));
            heightScale = Math.min(1.0, Math.max(0.2, audioLevel * profile * waveMod * 3.2));
          } else {
            heightScale = 0.16;
          }

          const barColor = !isListening
            ? THEME.colors.border
            : hasLiveAudio
            ? THEME.colors.accentSage
            : THEME.colors.accentLavender;

          const barOpacity = !isListening ? 0.65 : hasLiveAudio ? 0.95 : 0.45;

          return (
            <div
              key={idx}
              style={{
                width: "4px",
                height: `${Math.round(heightScale * 18) + 3}px`,
                backgroundColor: barColor,
                opacity: barOpacity,
                borderRadius: "2px",
                transition: "height 0.08s ease-out, background-color 0.2s ease, opacity 0.2s ease",
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
