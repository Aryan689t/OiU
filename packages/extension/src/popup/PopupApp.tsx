import React, { useEffect, useState } from "react";
import { SessionInfo, UserProfile, DEFAULT_PROFILE, ExtensionMessage } from "@oiu/shared";
import { THEME } from "../sidepanel/theme";
import { OiULogoMark, MicrophoneIcon, StopSquareIcon, ExternalLinkIcon, UserIcon } from "../sidepanel/icons";

export const PopupApp: React.FC = () => {
  const [session, setSession] = useState<SessionInfo>({
    sessionId: "",
    tabId: -1,
    meetingPlatform: "google_meet",
    state: "INACTIVE",
  });
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" }, (response) => {
      if (response?.session) setSession(response.session);
      if (response?.profile) setProfile(response.profile);
    });

    const messageListener = (msg: ExtensionMessage) => {
      if (msg?.type === "SESSION_STATE_CHANGED" && msg.payload) {
        setSession(msg.payload.session);
        setProfile(msg.payload.profile);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      // @ts-ignore - Chrome sidePanel API
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  };

  const handleStartListening = () => {
    chrome.runtime.sendMessage(
      { type: "START_SESSION_REQUEST", payload: { tabId: session.tabId } },
      (res) => {
        if (!res?.success) {
          alert(res?.error || "Failed to start listening. Open a Google Meet tab first.");
        }
      }
    );
  };

  const handleStopListening = () => {
    chrome.runtime.sendMessage({ type: "STOP_SESSION_REQUEST" });
  };

  const isConfigured = Boolean(profile.displayName && profile.displayName.trim().length > 0);
  const isListening = session.state === "LISTENING";
  const isMeetReady = session.state === "SUPPORTED_TAB_READY";

  const getStatusBadge = () => {
    if (!isConfigured) {
      return {
        text: "Setup Needed",
        bg: THEME.colors.accentPeachLight,
        color: THEME.colors.accentPeachDark,
        border: THEME.colors.accentPeachBorder,
      };
    }
    if (isListening) {
      return {
        text: "Listening",
        bg: THEME.colors.accentSageLight,
        color: THEME.colors.accentSageDark,
        border: THEME.colors.accentSageBorder,
      };
    }
    if (isMeetReady) {
      return {
        text: "Meet Ready",
        bg: THEME.colors.accentBlueLight,
        color: THEME.colors.accentBlueDark,
        border: THEME.colors.accentBlueBorder,
      };
    }
    return {
      text: "Standby",
      bg: THEME.colors.bgSubtle,
      color: THEME.colors.textSecondary,
      border: THEME.colors.border,
    };
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      style={{
        padding: "16px",
        width: "320px",
        boxSizing: "border-box",
        backgroundColor: THEME.colors.bg,
        color: THEME.colors.textPrimary,
        fontFamily: THEME.typography.fontFamily,
        overflowX: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
          paddingBottom: "10px",
          borderBottom: `1px solid ${THEME.colors.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <OiULogoMark size={20} color={THEME.colors.textPrimary} />
          <span style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.3px", color: THEME.colors.textPrimary }}>
            OiU
          </span>
          <span
            style={{
              fontSize: "9.5px",
              fontWeight: 700,
              color: THEME.colors.accentLavenderDark,
              backgroundColor: THEME.colors.accentLavenderLight,
              padding: "2px 6px",
              borderRadius: THEME.radius.xs,
              letterSpacing: "0.4px",
              fontFamily: THEME.typography.monoFamily,
            }}
          >
            SIGNAL DESK
          </span>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "3px 8px",
            borderRadius: THEME.radius.xs,
            backgroundColor: statusBadge.bg,
            border: `1px solid ${statusBadge.border}`,
            fontSize: "10.5px",
            fontWeight: 700,
            color: statusBadge.color,
            fontFamily: THEME.typography.monoFamily,
          }}
        >
          <span
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              backgroundColor: statusBadge.color,
            }}
          />
          <span>{statusBadge.text}</span>
        </div>
      </div>

      {/* Target Identity Parameters */}
      <div
        style={{
          backgroundColor: THEME.colors.surface,
          border: `1px solid ${THEME.colors.border}`,
          borderRadius: THEME.radius.md,
          padding: "10px 12px",
          marginBottom: "12px",
          boxShadow: THEME.shadows.card,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: THEME.colors.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              fontFamily: THEME.typography.monoFamily,
            }}
          >
            Active Target
          </span>
          {profile.identifiers.length > 0 && (
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                color: THEME.colors.accentPeachDark,
                fontFamily: THEME.typography.monoFamily,
              }}
            >
              #{profile.identifiers.join(" · #")}
            </span>
          )}
        </div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: THEME.colors.textPrimary }}>
          {profile.displayName || <span style={{ color: THEME.colors.textMuted }}>Setup required</span>}
        </div>
      </div>

      {/* Primary Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <button
          onClick={openSidePanel}
          style={{
            width: "100%",
            padding: "10px 14px",
            backgroundColor: THEME.colors.surface,
            border: `1px solid ${THEME.colors.border}`,
            borderRadius: THEME.radius.md,
            color: THEME.colors.textPrimary,
            fontSize: "12.5px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            boxShadow: THEME.shadows.sm,
            transition: THEME.transitions.fast,
          }}
        >
          <span>Open Side Panel</span>
          <ExternalLinkIcon size={12} color={THEME.colors.textPrimary} />
        </button>

        {isListening ? (
          <button
            onClick={handleStopListening}
            style={{
              width: "100%",
              padding: "10px 14px",
              backgroundColor: THEME.colors.accentCoralLight,
              border: `1px solid ${THEME.colors.accentCoralBorder}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.accentCoralDark,
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: THEME.transitions.fast,
            }}
          >
            <StopSquareIcon size={12} color={THEME.colors.accentCoralDark} />
            <span>Stop Listening</span>
          </button>
        ) : (
          <button
            onClick={handleStartListening}
            style={{
              width: "100%",
              padding: "10px 14px",
              backgroundColor: THEME.colors.accentLavender,
              border: `1px solid ${THEME.colors.accentLavenderBorder}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.textPrimary,
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              boxShadow: THEME.shadows.sm,
              transition: THEME.transitions.fast,
            }}
          >
            <MicrophoneIcon size={14} color={THEME.colors.textPrimary} />
            <span>Start Listening</span>
          </button>
        )}
      </div>
    </div>
  );
};
