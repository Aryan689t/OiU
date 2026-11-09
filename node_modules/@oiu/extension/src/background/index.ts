import {
  SessionInfo,
  UserProfile,
  DEFAULT_PROFILE,
  ExtensionMessage,
} from "@oiu/shared";

console.log("[OiU Service Worker] Initializing ultra-stable zero-impact background coordinator...");

const PROFILE_STORAGE_KEY = "oiu_user_profile";

let currentSession: SessionInfo = {
  sessionId: "",
  tabId: -1,
  meetingPlatform: "google_meet",
  state: "INACTIVE",
};

let userProfile: UserProfile = { ...DEFAULT_PROFILE };

// Load initial saved profile
chrome.storage.local.get([PROFILE_STORAGE_KEY], (result) => {
  if (result?.[PROFILE_STORAGE_KEY]) {
    userProfile = result[PROFILE_STORAGE_KEY];
    console.log("[OiU Service Worker] Loaded user profile:", userProfile.displayName);
  }
});

// React to storage changes automatically
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[PROFILE_STORAGE_KEY]) {
    userProfile = changes[PROFILE_STORAGE_KEY].newValue || { ...DEFAULT_PROFILE };
    console.log("[OiU Service Worker] User profile updated from storage:", userProfile.displayName);
    broadcastStateChange();
  }
});

export function isGoogleMeetUrl(url?: string): boolean {
  if (!url) return false;
  return url.includes("meet.google.com");
}

function broadcastStateChange() {
  const message: ExtensionMessage = {
    type: "SESSION_STATE_CHANGED",
    payload: {
      session: { ...currentSession },
      profile: { ...userProfile },
    },
  };
  chrome.runtime.sendMessage(message).catch(() => {});
}

async function findActiveOrAnyMeetTab(): Promise<chrome.tabs.Tab | undefined> {
  // 1. Check active tab in last focused window
  try {
    const [focusedActiveTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (focusedActiveTab && isGoogleMeetUrl(focusedActiveTab.url)) {
      return focusedActiveTab;
    }
  } catch {}

  // 2. Check active tab in current window
  try {
    const [currentActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentActiveTab && isGoogleMeetUrl(currentActiveTab.url)) {
      return currentActiveTab;
    }
  } catch {}

  // 3. Fallback: check ANY open tab with Google Meet URL
  try {
    const meetTabs = await chrome.tabs.query({ url: "*://meet.google.com/*" });
    if (meetTabs && meetTabs.length > 0) {
      const best = meetTabs.find((t) => t.active || t.audible);
      return best || meetTabs[0];
    }
  } catch {}

  return undefined;
}

async function checkTabAndUpdateState() {
  if (
    currentSession.state === "LISTENING" ||
    currentSession.state === "CONNECTING" ||
    currentSession.state === "STOPPING"
  ) {
    return;
  }

  const meetTab = await findActiveOrAnyMeetTab();

  if (meetTab && meetTab.id) {
    currentSession = {
      ...currentSession,
      tabId: meetTab.id,
      state: "SUPPORTED_TAB_READY",
      errorMessage: undefined,
    };
  } else {
    currentSession = {
      ...currentSession,
      tabId: -1,
      state: "INACTIVE",
      errorMessage: undefined,
    };
  }

  broadcastStateChange();
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[OiU Service Worker] Installed.");
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  checkTabAndUpdateState();
});

chrome.tabs.onActivated.addListener(() => {
  checkTabAndUpdateState();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    checkTabAndUpdateState();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentSession.tabId === tabId) {
    console.log("[OiU Service Worker] Google Meet tab closed.");
    currentSession = {
      sessionId: "",
      tabId: -1,
      meetingPlatform: "google_meet",
      state: "ERROR",
      errorMessage: "Google Meet tab was closed.",
    };
    broadcastStateChange();
  }
});

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  switch (message.type) {
    case "GET_SESSION_STATE": {
      findActiveOrAnyMeetTab().then((meetTab) => {
        if (
          currentSession.state !== "LISTENING" &&
          currentSession.state !== "CONNECTING" &&
          currentSession.state !== "STOPPING"
        ) {
          if (meetTab && meetTab.id) {
            currentSession = {
              ...currentSession,
              tabId: meetTab.id,
              state: "SUPPORTED_TAB_READY",
              errorMessage: undefined,
            };
          } else {
            currentSession = {
              ...currentSession,
              tabId: -1,
              state: "INACTIVE",
              errorMessage: undefined,
            };
          }
        }

        sendResponse({
          session: currentSession,
          profile: userProfile,
        });
      });
      return true;
    }

    case "MEETING_TAB_DETECTED": {
      checkTabAndUpdateState().then(() => {
        sendResponse({ acknowledged: true });
      });
      return true;
    }

    case "TRANSCRIPT_SEGMENT": {
      // Content script broadcast is received by runtime listeners directly; acknowledge cleanly without duplicating
      sendResponse({ acknowledged: true });
      return false;
    }

    case "AUDIO_LEVEL": {
      sendResponse({ acknowledged: true });
      return false;
    }

    case "START_SESSION_REQUEST": {
      (async () => {
        try {
          const meetTab = await findActiveOrAnyMeetTab();
          const targetTabId = meetTab?.id || message.payload?.tabId || currentSession.tabId;
          if (!targetTabId || targetTabId <= 0) {
            currentSession = {
              ...currentSession,
              state: "ERROR",
              errorMessage: "No active Google Meet tab found. Please open or refresh meet.google.com first.",
            };
            broadcastStateChange();
            sendResponse({ success: false, error: currentSession.errorMessage });
            return;
          }

          const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          currentSession = {
            sessionId: newSessionId,
            tabId: targetTabId,
            meetingPlatform: "google_meet",
            state: "LISTENING",
            startedAt: Date.now(),
            errorMessage: undefined,
          };
          console.log(`[OiU Service Worker] Zero-Impact listening active: ${newSessionId} on tab ${targetTabId}`);
          broadcastStateChange();
          sendResponse({ success: true, session: currentSession });

          // Ensure content script is running and start caption monitoring
          chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            files: ["content.js"],
          }).catch(() => {}).finally(() => {
            chrome.tabs.sendMessage(targetTabId, { type: "START_MEET_MONITORING" }).catch((err) => {
              console.warn("[OiU] Content script not reachable:", err);
            });
          });
        } catch (err: any) {
          console.error("[OiU Service Worker] Start error:", err);
          currentSession = {
            ...currentSession,
            state: "ERROR",
            errorMessage: err?.message || "Failed to start listening.",
          };
          broadcastStateChange();
          sendResponse({ success: false, error: currentSession.errorMessage });
        }
      })();
      return true;
    }

    case "STOP_SESSION_REQUEST": {
      if (currentSession.tabId && currentSession.tabId > 0) {
        chrome.tabs.sendMessage(currentSession.tabId, { type: "STOP_MEET_MONITORING" }).catch(() => {});
      }
      currentSession = {
        sessionId: "",
        tabId: -1,
        meetingPlatform: "google_meet",
        state: "STOPPED",
        errorMessage: undefined,
      };
      broadcastStateChange();
      sendResponse({ success: true, session: currentSession });
      return false;
    }

    case "RESET_SESSION_REQUEST": {
      currentSession = {
        sessionId: "",
        tabId: -1,
        meetingPlatform: "google_meet",
        state: "INACTIVE",
        errorMessage: undefined,
      };
      checkTabAndUpdateState();
      sendResponse({ success: true, session: currentSession });
      return false;
    }

    case "SESSION_ERROR": {
      currentSession = {
        ...currentSession,
        state: "ERROR",
        errorMessage: message.payload?.message || "OiU encountered an isolated error.",
      };
      broadcastStateChange();
      return false;
    }

    case "PROFILE_UPDATED": {
      userProfile = { ...message.payload };
      sendResponse({ success: true, profile: userProfile });
      return false;
    }

    default:
      return false;
  }
});
