import React from "react";
import { THEME } from "./theme";
import { WaveformSmallIcon, ClockIcon } from "./icons";

interface AudioWaveformProps {
  isListening: boolean;
  isVoiceActive: boolean;
  audioLevel: number;
  segmentsCount: number;
  currentTimeString: string;
}

// 22 balanced vertical tick lines for the brutalist audio meter
const BAR_PROFILES = [
  0.2, 0.35, 0.5, 0.4, 0.65, 0.85, 0.95, 0.7, 0.6, 0.8, 1.0, 0.75, 0.9,
  0.85, 0.7, 0.95, 0.8, 0.6, 0.7, 0.5, 0.35, 0.2
];

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isListening,
  isVoiceActive,
  audioLevel,
  segmentsCount,
  currentTimeString,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 0 8px 0",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Brutalist Audio Meter Container */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "3.5px",
          height: "28px",
          width: "100%",
          padding: "0 12px",
          boxSizing: "border-box",
        }}
      >
        {BAR_PROFILES.map((profile, idx) => {
          const hasLiveAudio = isListening && audioLevel > 0.05;
          let heightScale = 0.16;

          if (!isListening) {
            heightScale = 0.14;
          } else if (hasLiveAudio) {
            // Genuine real-time audio reactivity across the 22 bars (no fake idle looping)
            const waveMod = 0.75 + 0.25 * Math.abs(Math.sin(idx * 0.8 + audioLevel * 18));
            heightScale = Math.min(1.0, Math.max(0.22, audioLevel * profile * waveMod * 3.4));
          } else {
            // Flat resting line when meeting audio is silent
            heightScale = 0.16;
          }

          const barColor = !isListening
            ? "#2E2E34"
            : hasLiveAudio
            ? THEME.colors.accentYellow
            : "#3E3E46";

          return (
            <div
              key={idx}
              style={{
                width: "3px",
                height: "100%",
                maxHeight: "26px",
                backgroundColor: barColor,
                borderRadius: "1px",
                transformOrigin: "center",
                transform: `scaleY(${heightScale})`,
                transition: "transform 0.06s ease-out, background-color 0.1s ease",
              }}
            />
          );
        })}
      </div>

      {/* Monospace Minimalist Status Ticker */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          marginTop: "10px",
          fontSize: "11.5px",
          fontFamily: THEME.typography.monoFamily,
          color: "#CCCCCC",
          fontWeight: 600,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
        }}
      >
        {/* Status Indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "1px",
              backgroundColor: isListening ? THEME.colors.accentYellow : THEME.colors.textMuted,
              boxShadow: isListening && isVoiceActive ? `0 0 8px ${THEME.colors.accentYellow}` : "none",
            }}
          />
          <span style={{ color: isListening ? THEME.colors.accentYellow : "#8E8E93", fontWeight: 700 }}>
            {isListening ? (isVoiceActive ? "LISTENING" : "STANDBY") : "OFFLINE"}
          </span>
        </div>

        {/* Turn Segments */}
        <span style={{ color: "#55555A" }}>·</span>
        <span style={{ color: "#E0E0E0" }}>{segmentsCount} TURNS</span>
        <span style={{ color: "#55555A" }}>·</span>
        {/* Live Clock */}
        <span style={{ color: "#AAAAAA" }}>{currentTimeString}</span>
      </div>
    </div>
  );
};

