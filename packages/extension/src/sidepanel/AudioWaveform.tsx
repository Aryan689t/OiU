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
  // Voice is observed only when actively speaking (user mic or remote speaker)
  const hasLiveVoice = isListening && (isVoiceActive || audioLevel > 0.04);

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
      <style>{`
        @keyframes oiuWaveDancing {
          0% { transform: scaleY(0.22); }
          50% { transform: scaleY(0.96); }
          100% { transform: scaleY(0.32); }
        }
      `}</style>

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
          let heightScale = 0.16;

          if (hasLiveVoice) {
            const effectiveVol = audioLevel > 0.04 ? audioLevel : 0.42;
            const waveMod = 0.75 + 0.25 * Math.abs(Math.sin(idx * 0.8 + effectiveVol * 18));
            heightScale = Math.min(1.0, Math.max(0.26, effectiveVol * profile * waveMod * 3.2));
          } else {
            // Mics muted or open without voice: completely flat resting line
            heightScale = 0.16;
          }

          // When voice is observed -> turns bright yellow. When quiet / muted -> dark gray
          const barColor = hasLiveVoice
            ? THEME.colors.accentYellow
            : isListening
            ? "#3E3E46"
            : "#252529";

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
                transition: "transform 0.07s ease-out, background-color 0.1s ease",
                // ONLY animates when voice is actually observed! Zero motion during silence or mute!
                animation: hasLiveVoice
                  ? `oiuWaveDancing 0.38s ease-in-out infinite alternate ${idx * 0.032}s`
                  : "none",
                boxShadow: hasLiveVoice ? `0 0 6px rgba(255, 230, 0, 0.45)` : "none",
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
              backgroundColor: isListening
                ? hasLiveVoice
                  ? THEME.colors.accentYellow
                  : "#55555A"
                : THEME.colors.textMuted,
              boxShadow: isListening && hasLiveVoice ? `0 0 8px ${THEME.colors.accentYellow}` : "none",
              transition: "background-color 0.12s ease, box-shadow 0.12s ease",
            }}
          />
          <span
            style={{
              color: isListening ? (hasLiveVoice ? THEME.colors.accentYellow : "#8E8E93") : "#66666A",
              fontWeight: 700,
              transition: "color 0.12s ease",
            }}
          >
            {isListening ? (hasLiveVoice ? "VOICE ACTIVE" : "STANDBY") : "OFFLINE"}
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

