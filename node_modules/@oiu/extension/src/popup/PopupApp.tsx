import React, { useEffect, useState } from "react";
import { SessionInfo, UserProfile, DEFAULT_PROFILE, ExtensionMessage } from "@oiu/shared";
import { THEME } from "../sidepanel/theme";
import { OiULogoMark, MicrophoneIcon, StopSquareIcon, ExternalLinkIcon } from "../sidepanel/icons";

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
          alert(res?.error || "Failed to start listening.");
        }
      }
    );
  };

  const handleStopListening = () => {
    chrome.runtime.sendMessage({ type: "STOP_SESSION_REQUEST" });
  };

  const isListening = session.state === "LISTENING";
  const isMeetReady = session.state === "SUPPORTED_TAB_READY";

  return (
    <div
      style={{
        padding: "16px",
        width: "320px",
        boxSizing: "border-box",
        backgroundColor: THEME.colors.bg,
        color: THEME.colors.textPrimary,
        fontFamily: THEME.typography.fontFamily,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "14px",
          paddingBottom: "10px",
          borderBottom: `1px solid ${THEME.colors.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <OiULogoMark size={20} color={THEME.colors.textPrimary} />
          <span style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.3px" }}>OiU</span>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "3px 8px",
            borderRadius: THEME.radius.pill,
            backgroundColor: isListening ? THEME.colors.greenMutedBg : THEME.colors.surface,
            border: `1px solid ${isListening ? THEME.colors.greenBorder : THEME.colors.border}`,
            fontSize: "11px",
            fontWeight: 600,
            color: isListening ? THEME.colors.accentGreen : THEME.colors.textSecondary,
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: isListening
                ? THEME.colors.accentGreen
                : isMeetReady
                ? THEME.colors.accentBlue
                : THEME.colors.textMuted,
            }}
          />
          <span>{isListening ? "Listening" : isMeetReady ? "Meet Ready" : "Offline"}</span>
        </div>
      </div>

      {/* Target Profile Card */}
      <div
        style={{
          backgroundColor: THEME.colors.bgSecondary,
          border: `1px solid ${THEME.colors.border}`,
          borderRadius: THEME.radius.md,
          padding: "12px",
          marginBottom: "14px",
        }}
      >
        <div style={{ fontSize: "10.5px", fontWeight: 700, color: THEME.colors.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
          Active Target
        </div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: THEME.colors.textPrimary }}>
          {profile.displayName || <span style={{ color: THEME.colors.textMuted }}>Not configured</span>}
        </div>
        {profile.identifiers.length > 0 && (
          <div style={{ fontSize: "11px", color: THEME.colors.textSecondary, marginTop: "2px", fontFamily: THEME.typography.monoFamily }}>
            ID: {profile.identifiers.join(", ")}
          </div>
        )}
      </div>

      {/* Primary Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <button
          onClick={openSidePanel}
          style={{
            width: "100%",
            padding: "10px 14px",
            backgroundColor: THEME.colors.surfaceHighlight,
            border: `1px solid ${THEME.colors.borderActive}`,
            borderRadius: THEME.radius.md,
            color: THEME.colors.textPrimary,
            fontSize: "12.5px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
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
              backgroundColor: THEME.colors.surface,
              border: `1px solid ${THEME.colors.border}`,
              borderRadius: THEME.radius.md,
              color: THEME.colors.accentRed,
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <StopSquareIcon size={12} color={THEME.colors.accentRed} />
            <span>Stop Listening</span>
          </button>
        ) : (
          <button
            onClick={handleStartListening}
            style={{
              width: "100%",
              padding: "10px 14px",
              backgroundColor: THEME.colors.accentGreen,
              border: "none",
              borderRadius: THEME.radius.md,
              color: "#090A0B",
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <MicrophoneIcon size={14} color="#090A0B" />
            <span>Start Listening</span>
          </button>
        )}
      </div>
    </div>
  );
};
