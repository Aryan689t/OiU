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

// 28 balanced vertical bars for the visualizer
const BAR_PROFILES = [
  0.15, 0.2, 0.35, 0.5, 0.4, 0.65, 0.85, 0.95, 0.7, 0.6, 0.8, 1.0, 0.75, 0.9,
  0.85, 0.7, 0.95, 0.8, 0.6, 0.7, 0.55, 0.4, 0.45, 0.3, 0.25, 0.2, 0.15, 0.1,
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
        padding: "18px 0 14px 0",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes oiuWaveDancing {
          0% { transform: scaleY(0.25); }
          50% { transform: scaleY(1.0); }
          100% { transform: scaleY(0.35); }
        }
        @keyframes oiuWaveAmbient {
          0% { transform: scaleY(0.3); opacity: 0.5; }
          50% { transform: scaleY(0.55); opacity: 0.85; }
          100% { transform: scaleY(0.3); opacity: 0.5; }
        }
      `}</style>

      {/* Waveform Bar Container */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "3px",
          height: "38px",
          width: "100%",
          padding: "0 16px",
          boxSizing: "border-box",
        }}
      >
        {BAR_PROFILES.map((profile, idx) => {
          let heightScale = 0.18;

          if (!isListening) {
            heightScale = 0.14;
          } else if (audioLevel > 0.04) {
            heightScale = Math.min(1.0, Math.max(0.22, audioLevel * profile * 2.8));
          } else if (isVoiceActive) {
            heightScale = Math.max(0.25, profile * 0.85);
          } else {
            // Ambient idle breathing when listening
            heightScale = Math.max(0.18, profile * 0.4);
          }

          const barColor = !isListening
            ? "#2A2E33"
            : isVoiceActive || audioLevel > 0.04
            ? "#F5F5F5"
            : "#71767D";

          return (
            <div
              key={idx}
              style={{
                width: "2.5px",
                height: "100%",
                maxHeight: "36px",
                backgroundColor: barColor,
                borderRadius: "2px",
                transformOrigin: "center",
                transform: `scaleY(${heightScale})`,
                transition: "transform 0.09s ease, background-color 0.15s ease",
                animation:
                  isListening && (isVoiceActive || audioLevel > 0.04)
                    ? `oiuWaveDancing 0.45s ease-in-out infinite alternate ${idx * 0.035}s`
                    : isListening
                    ? `oiuWaveAmbient 2.4s ease-in-out infinite alternate ${idx * 0.06}s`
                    : "none",
              }}
            />
          );
        })}
      </div>

      {/* Status Badges Row (Live Audio | 33 Segments | 08:37 PM) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "14px",
          marginTop: "16px",
          fontSize: "11px",
          color: THEME.colors.textSecondary,
          fontWeight: 500,
          letterSpacing: "0.2px",
        }}
      >
        {/* Live Audio indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: isListening ? THEME.colors.accentGreen : THEME.colors.textMuted,
              boxShadow:
                isListening && isVoiceActive
                  ? `0 0 8px ${THEME.colors.accentGreen}`
                  : "none",
              transition: "all 0.2s ease",
            }}
          />
          <span style={{ color: isListening ? THEME.colors.textPrimary : THEME.colors.textMuted }}>
            {isListening ? (isVoiceActive ? "Live Audio" : "Standing By") : "Offline"}
          </span>
        </div>

        <span style={{ color: THEME.colors.borderSubtle, userSelect: "none" }}>|</span>

        {/* Segments count */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <WaveformSmallIcon size={12} color={THEME.colors.textSecondary} />
          <span>{segmentsCount} Segments</span>
        </div>

        <span style={{ color: THEME.colors.borderSubtle, userSelect: "none" }}>|</span>

        {/* Clock / Session Time */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <ClockIcon size={12} color={THEME.colors.textSecondary} />
          <span>{currentTimeString}</span>
        </div>
      </div>
    </div>
  );
};

