import React, { useState } from "react";
import { THEME } from "./theme";

export type AuraSignalState =
  | "NOT_CONFIGURED"
  | "NO_MEETING"
  | "READY"
  | "LISTENING"
  | "ALERT"
  | "STOPPED"
  | "ERROR";

interface AuraSignalArcProps {
  state: AuraSignalState;
  audioLevel?: number;
  isVoiceActive?: boolean;
  targetName?: string;
  statusLabel?: string;
  statusSubtext?: string;
  onClick?: () => void;
}

/**
 * AURA Signal Arc
 * 
 * An original, precision acoustic instrument combining a calibrated 180° radial horizon,
 * frequency ticks, an interactive sound-reactive arc, and a focal status aperture.
 * Built entirely with lightweight SVG and CSS transforms.
 */
export const AuraSignalArc: React.FC<AuraSignalArcProps> = ({
  state,
  audioLevel = 0,
  isVoiceActive = false,
  targetName,
  statusLabel,
  statusSubtext,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Calibrated 25-tick acoustic horizon (180 degrees)
  const TICK_COUNT = 25;
  const radius = 54;
  const centerX = 80;
  const centerY = 74;

  // React smoothly to live measured audio level when listening
  const normalizedLevel = Math.min(1, Math.max(0, audioLevel));
  const activeTicks = state === "LISTENING"
    ? Math.max(2, Math.round(normalizedLevel * TICK_COUNT * 1.4))
    : state === "READY"
    ? 5
    : 0;

  const getInstrumentProfile = () => {
    switch (state) {
      case "ALERT":
        return {
          arcStroke: "#E26D5C",
          arcGlow: "rgba(226, 109, 92, 0.35)",
          tickActive: "#E26D5C",
          tickInactive: "#F2DFD9",
          centerColor: "#FFD5C2",
          badgeBg: THEME.colors.accentCoralLight,
          badgeBorder: THEME.colors.accentCoralBorder,
          badgeColor: THEME.colors.accentCoralDark,
          badgeLabel: "Attention Detected",
          headline: "Someone mentioned you",
          subtext: "Important callout flagged in live meeting stream",
        };
      case "LISTENING":
        return {
          arcStroke: isVoiceActive ? "#87BBA2" : "#BDA7E8",
          arcGlow: isVoiceActive ? "rgba(135, 187, 162, 0.4)" : "rgba(189, 167, 232, 0.35)",
          tickActive: isVoiceActive ? "#245840" : "#553A75",
          tickInactive: "#E5DFEC",
          centerColor: isVoiceActive ? "#87BBA2" : "#BDA7E8",
          badgeBg: isVoiceActive ? THEME.colors.accentSageLight : THEME.colors.accentLavenderLight,
          badgeBorder: isVoiceActive ? THEME.colors.accentSageBorder : THEME.colors.accentLavenderBorder,
          badgeColor: isVoiceActive ? THEME.colors.accentSageDark : THEME.colors.accentLavenderDark,
          badgeLabel: isVoiceActive ? "Speech Detected" : "Actively Listening",
          headline: targetName ? `Listening for ${targetName}` : "Listening to meeting",
          subtext: isVoiceActive
            ? "Voice presence detected on acoustic stream"
            : "Standing by for your name, roll number, or keywords",
        };
      case "READY":
        return {
          arcStroke: "#BDA7E8",
          arcGlow: "rgba(189, 167, 232, 0.2)",
          tickActive: "#7096D1",
          tickInactive: "#ECE7F2",
          centerColor: "#BDA7E8",
          badgeBg: THEME.colors.accentBlueLight,
          badgeBorder: THEME.colors.accentBlueBorder,
          badgeColor: THEME.colors.accentBlueDark,
          badgeLabel: "Google Meet Ready",
          headline: "Ready when you are",
          subtext: "Tab connected · Click Start Listening to begin monitoring",
        };
      case "NOT_CONFIGURED":
        return {
          arcStroke: "#FFD5C2",
          arcGlow: "rgba(255, 213, 194, 0.3)",
          tickActive: "#8C4022",
          tickInactive: "#F6EAE4",
          centerColor: "#FFD5C2",
          badgeBg: THEME.colors.accentPeachLight,
          badgeBorder: THEME.colors.accentPeachBorder,
          badgeColor: THEME.colors.accentPeachDark,
          badgeLabel: "Setup Required",
          headline: "Complete your setup",
          subtext: "Click here to configure your name and keywords in Preferences",
        };
      case "STOPPED":
        return {
          arcStroke: "#DDD5E6",
          arcGlow: "none",
          tickActive: "#76617B",
          tickInactive: "#EFEAF3",
          centerColor: "#D9D2E2",
          badgeBg: THEME.colors.bgSubtle,
          badgeBorder: THEME.colors.border,
          badgeColor: THEME.colors.textSecondary,
          badgeLabel: "Monitoring Stopped",
          headline: "Monitoring paused",
          subtext: "Session paused · Click Start Listening below to resume",
        };
      case "ERROR":
        return {
          arcStroke: "#E26D5C",
          arcGlow: "none",
          tickActive: "#8A281A",
          tickInactive: "#F2B4AA",
          centerColor: "#E26D5C",
          badgeBg: THEME.colors.accentCoralLight,
          badgeBorder: THEME.colors.accentCoralBorder,
          badgeColor: THEME.colors.accentCoralDark,
          badgeLabel: "Attention Needed",
          headline: "Monitoring issue",
          subtext: "Check microphone permissions or Google Meet connection",
        };
      case "NO_MEETING":
      default:
        return {
          arcStroke: "#E5DFEC",
          arcGlow: "none",
          tickActive: "#5C4960",
          tickInactive: "#ECE7F2",
          centerColor: "#E5DFEC",
          badgeBg: THEME.colors.bgSubtle,
          badgeBorder: THEME.colors.border,
          badgeColor: THEME.colors.textSecondary,
          badgeLabel: "Standby",
          headline: "Ready for your next meeting",
          subtext: "Open Google Meet (meet.google.com) to start monitoring",
        };
    }
  };

  const profile = getInstrumentProfile();
  const headline = statusLabel || profile.headline;
  const subtext = statusSubtext || profile.subtext;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={handleKeyDown}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 12px 14px 12px",
        cursor: onClick ? "pointer" : "default",
        outline: "none",
        transition: "transform 0.16s ease",
        transform: isHovered && onClick ? "translateY(-1px)" : "none",
      }}
    >
      {/* Precision Acoustic Arc Horizon Instrument */}
      <div
        style={{
          position: "relative",
          width: "160px",
          height: "88px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "6px",
        }}
      >
        <svg
          width="160"
          height="88"
          viewBox="0 0 160 88"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: "visible" }}
        >
          {/* Subtle Outer Instrument Guide Arc */}
          <path
            d="M 22 74 A 58 58 0 0 1 138 74"
            fill="none"
            stroke="#ECE7F2"
            strokeWidth="1"
            strokeDasharray="2 3"
          />

          {/* Calibrated Acoustic Horizon Ticks */}
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            // angle from PI (180deg - left) to 0 (0deg - right)
            const angle = Math.PI - (i / (TICK_COUNT - 1)) * Math.PI;
            const isCenterDominant = Math.abs(i - Math.floor(TICK_COUNT / 2)) <= activeTicks / 2;
            const isTickLit = isCenterDominant || i < activeTicks;
            const tickColor = isTickLit ? profile.tickActive : profile.tickInactive;
            
            // Major tick mark height vs minor
            const isMajor = i % 4 === 0 || i === Math.floor(TICK_COUNT / 2);
            const innerR = radius - (isMajor ? 7 : 4);
            const outerR = radius + (isTickLit && isVoiceActive ? 3.5 : 0);

            const x1 = centerX + innerR * Math.cos(angle);
            const y1 = centerY - innerR * Math.sin(angle);
            const x2 = centerX + outerR * Math.cos(angle);
            const y2 = centerY - outerR * Math.sin(angle);

            return (
              <line
                key={`tick-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={tickColor}
                strokeWidth={isMajor ? 1.6 : 1.1}
                strokeLinecap="round"
                style={{
                  transition: "stroke 0.15s ease, stroke-width 0.15s ease",
                }}
              />
            );
          })}

          {/* Active Resonant Horizon Baseline */}
          <path
            d="M 26 74 A 54 54 0 0 1 134 74"
            fill="none"
            stroke={profile.arcStroke}
            strokeWidth={state === "LISTENING" || state === "ALERT" ? 2.5 : 1.75}
            strokeLinecap="round"
            style={{
              transition: "stroke 0.3s ease, stroke-width 0.3s ease",
              filter: profile.arcGlow !== "none" ? `drop-shadow(0 0 6px ${profile.arcGlow})` : "none",
            }}
          />

          {/* Central Ground Horizon Axis */}
          <line
            x1="32"
            y1="74"
            x2="128"
            y2="74"
            stroke="#E5DFEC"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* Core Telemetry Aperture Node */}
          <circle
            cx={centerX}
            cy="74"
            r={state === "LISTENING" && isVoiceActive ? 5 : 4}
            fill={profile.centerColor}
            stroke="#FFFFFF"
            strokeWidth="1.5"
            style={{
              transition: "r 0.12s ease, fill 0.3s ease",
              filter: `drop-shadow(0 1px 3px rgba(58, 35, 63, 0.15))`,
            }}
          />
        </svg>
      </div>

      {/* Micro Status Metric Badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: "2.5px 8px",
          borderRadius: THEME.radius.xs,
          backgroundColor: profile.badgeBg,
          border: `1px solid ${profile.badgeBorder}`,
          marginBottom: "6px",
          transition: "all 0.25s ease",
        }}
      >
        <span
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            backgroundColor: profile.badgeColor,
            boxShadow: state === "LISTENING" ? `0 0 4px ${profile.badgeColor}` : "none",
          }}
        />
        <span
          style={{
            fontSize: "10.5px",
            fontWeight: 700,
            letterSpacing: "0.4px",
            color: profile.badgeColor,
            fontFamily: THEME.typography.monoFamily,
            textTransform: "uppercase",
          }}
        >
          {profile.badgeLabel}
        </span>
      </div>

      {/* Authoritative Human Headline */}
      <h2
        style={{
          fontSize: "16px",
          fontWeight: 800,
          color: THEME.colors.textPrimary,
          textAlign: "center",
          lineHeight: 1.25,
          margin: "0 0 3px 0",
          letterSpacing: "-0.35px",
          fontFamily: THEME.typography.fontFamily,
        }}
      >
        {headline}
      </h2>

      {/* Clear Descriptive Subtext */}
      <p
        style={{
          fontSize: "11.5px",
          color: THEME.colors.textSecondary,
          textAlign: "center",
          fontFamily: THEME.typography.fontFamily,
          maxWidth: "300px",
          lineHeight: 1.45,
          margin: 0,
        }}
      >
        {subtext}
      </p>
    </div>
  );
};

