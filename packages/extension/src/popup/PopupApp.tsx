import React, { useEffect, useState } from "react";
import { SessionInfo, UserProfile, DEFAULT_PROFILE, ExtensionMessage } from "@oiu/shared";

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

  const getStatusBadge = () => {
    switch (session.state) {
      case "LISTENING":
        return { bg: "#dcfce7", text: "#15803d", dot: "#22c55e", label: "Listening" };
      case "SUPPORTED_TAB_READY":
        return { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6", label: "Meet Ready" };
      case "ERROR":
        return { bg: "#fee2e2", text: "#b91c1c", dot: "#ef4444", label: "Error" };
      default:
        return { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af", label: "Inactive" };
    }
  };

  const badge = getStatusBadge();

  return (
    <div style={{ padding: 16, width: 300, boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>OiU Assistant</h2>
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 9999,
            backgroundColor: badge.bg,
            color: badge.text,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: badge.dot,
            }}
          />
          {badge.label}
        </span>
      </div>

      <p style={{ fontSize: 12, color: "#4b5563", margin: "0 0 12px 0", lineHeight: 1.4 }}>
        {isListening
          ? `Monitoring audio for ${profile.displayName || "configured name"}...`
          : isMeetReady
          ? "Google Meet detected. Ready to listen."
          : "Open or navigate to Google Meet to activate."}
      </p>

      {/* Action Button */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {isListening ? (
          <button
            onClick={handleStopListening}
            style={{
              width: "100%",
              padding: "8px 12px",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Stop Listening
          </button>
        ) : isMeetReady ? (
          <button
            onClick={handleStartListening}
            style={{
              width: "100%",
              padding: "8px 12px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Start Listening
          </button>
        ) : null}

        <button
          onClick={openSidePanel}
          style={{
            width: "100%",
            padding: "8px 12px",
            backgroundColor: isMeetReady || isListening ? "#f3f4f6" : "#2563eb",
            color: isMeetReady || isListening ? "#374151" : "#ffffff",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Open Side Panel
        </button>
      </div>
    </div>
  );
};
