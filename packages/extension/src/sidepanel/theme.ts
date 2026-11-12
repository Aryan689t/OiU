export const THEME = {
  colors: {
    // AURA Warm Ivory & Plum Palette
    bg: "#FAF9F6", // Warm Ivory base
    bgElevated: "#FFFFFF",
    bgSubtle: "#F4F0F7",
    bgHover: "#ECE5F2",

    // Card & Surface
    surface: "#FFFFFF",
    surfaceSubtle: "#F9F7FB",
    surfaceHighlight: "#F2EEF7",
    surfaceActive: "#E8E1F0",

    // Typography (Darkened to strictly satisfy WCAG AA/AAA contrast)
    textPrimary: "#3A233F", // Deep Plum - High contrast (WCAG AAA > 10:1)
    textSecondary: "#5C4960", // Muted Plum - Clear readability (WCAG AA > 6:1)
    textMuted: "#76617B", // Soft Lavender Muted (WCAG AA > 4.5:1)
    textOnAccent: "#FFFFFF",
    textOnPeach: "#3A233F",

    // AURA Primary Accent: Soft Lavender
    accentLavender: "#BDA7E8",
    accentLavenderLight: "#F0EBF9",
    accentLavenderMuted: "#ECE6F7",
    accentLavenderDark: "#553A75", // Accessible dark lavender for text/icons (>6:1)
    accentLavenderBorder: "#D0BFF0",
    accentLavenderGlow: "rgba(189, 167, 232, 0.35)",

    // AURA Secondary Accent: Pastel Peach
    accentPeach: "#FFD5C2",
    accentPeachLight: "#FFF5EF",
    accentPeachDark: "#8C4022", // Accessible dark peach for text (>5:1)
    accentPeachBorder: "#F6C5B2",
    accentPeachGlow: "rgba(255, 213, 194, 0.45)",

    // AURA Success: Sage Green
    accentSage: "#87BBA2",
    accentSageLight: "#EDF5F1",
    accentSageDark: "#245840", // Accessible dark sage (>5:1)
    accentSageBorder: "#B7D8C8",
    accentSageGlow: "rgba(135, 187, 162, 0.35)",

    // Attention & Alerts: Soft Coral / Rose
    accentCoral: "#E26D5C",
    accentCoralLight: "#FDEFEc",
    accentCoralDark: "#8A281A", // Accessible dark coral (>6:1)
    accentCoralBorder: "#F2B4AA",
    accentCoralGlow: "rgba(226, 109, 92, 0.35)",

    // Calm Blue (Information / Tabs)
    accentBlue: "#7096D1",
    accentBlueLight: "#EEF3FA",
    accentBlueDark: "#26487E", // Accessible dark blue (>6:1)
    accentBlueBorder: "#BED0EC",

    // Borders & Dividers
    border: "#E5DFEC", // Lavender Grey
    borderSubtle: "#EFEAF3",
    borderActive: "#BDA7E8",
    borderFocus: "#8F70C7",

    // Harmonized aliases for backward compatibility
    accentYellow: "#BDA7E8",
    yellowMutedBg: "rgba(189, 167, 232, 0.15)",
    yellowBorder: "#D0BFF0",
    yellowGlow: "rgba(189, 167, 232, 0.35)",
    accentGreen: "#87BBA2",
    accentGreenHover: "#71A78E",
    greenMutedBg: "rgba(135, 187, 162, 0.16)",
    greenBorder: "#B7D8C8",
    greenGlow: "rgba(135, 187, 162, 0.35)",
    accentRed: "#E26D5C",
    redMutedBg: "rgba(226, 109, 92, 0.12)",
    redBorder: "#F2B4AA",
    accentAmber: "#BF6B1B",
    amberMutedBg: "rgba(191, 107, 27, 0.12)",
    amberBorder: "#F3C79D",
    blueMutedBg: "rgba(112, 150, 209, 0.14)",
  },
  radius: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
    pill: "9999px",
    full: "9999px",
  },
  shadows: {
    none: "none",
    sm: "0 1px 3px rgba(58, 35, 63, 0.05), 0 1px 2px rgba(58, 35, 63, 0.03)",
    md: "0 4px 14px rgba(58, 35, 63, 0.06), 0 1px 3px rgba(58, 35, 63, 0.04)",
    lg: "0 10px 28px rgba(58, 35, 63, 0.08), 0 2px 6px rgba(58, 35, 63, 0.04)",
    card: "0 2px 8px rgba(58, 35, 63, 0.04), 0 1px 2px rgba(58, 35, 63, 0.02)",
    cardHover: "0 6px 20px rgba(58, 35, 63, 0.09), 0 2px 5px rgba(58, 35, 63, 0.04)",
    orbGlow: "0 0 36px rgba(189, 167, 232, 0.45), 0 0 72px rgba(255, 213, 194, 0.28)",
    orbActive: "0 0 45px rgba(189, 167, 232, 0.6), 0 0 90px rgba(135, 187, 162, 0.35)",
  },
  typography: {
    fontFamily:
      '\'Plus Jakarta Sans\', \'Manrope\', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    displayFont:
      '\'Plus Jakarta Sans\', \'Manrope\', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serifFont:
      '\'Plus Jakarta Sans\', -apple-system, BlinkMacSystemFont, sans-serif',
    monoFamily:
      '\'JetBrains Mono\', ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace',
  },
  transitions: {
    fast: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
    normal: "all 0.24s cubic-bezier(0.16, 1, 0.3, 1)",
    spring: "all 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  motion: {
    micro: "150ms cubic-bezier(0.16, 1, 0.3, 1)",
    standard: "200ms cubic-bezier(0.16, 1, 0.3, 1)",
    content: "260ms cubic-bezier(0.16, 1, 0.3, 1)",
    alert: "320ms cubic-bezier(0.16, 1, 0.3, 1)",
    ambientBreathing: "3.6s ease-in-out infinite",
    pulseRing: "4.2s ease-in-out infinite",
    alertPulse: "1.8s ease-in-out infinite",
    easings: {
      out: "cubic-bezier(0.16, 1, 0.3, 1)",
      inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
      spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    },
  },
};
