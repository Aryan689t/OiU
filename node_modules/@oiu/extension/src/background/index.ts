import {
  SessionInfo,
  UserProfile,
  DEFAULT_PROFILE,
  ExtensionMessage,
  EventDetector,
  TranscriptSegment,
  MeetingEvent,
} from "@oiu/shared";
import { triggerYellowScreenFlash } from "../utils/screenFlash";

console.log("[OiU Service Worker] Initializing ultra-stable zero-impact background coordinator...");

function isScriptableTabUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://") && !lower.startsWith("file://")) {
    return false;
  }
  if (
    lower.startsWith("https://chrome.google.com/webstore") ||
    lower.startsWith("https://chromewebstore.google.com")
  ) {
    return false;
  }
  return true;
}

/**
 * Flashes the 1-second translucent yellow overlay on all currently active
 * Chrome tabs across open windows (so alerts are visible even when browsing
 * another tab), and requests taskbar attention if the user is in another app.
 */
async function flashVisibleChromeTabs(excludeTabIds: Set<number> = new Set()): Promise<void> {
  try {
    const activeTabs = await chrome.tabs.query({ active: true });
    const attentionWindowIds = new Set<number>();

    for (const tab of activeTabs) {
      if (typeof tab.windowId === "number" && !attentionWindowIds.has(tab.windowId)) {
        attentionWindowIds.add(tab.windowId);
        chrome.windows.update(tab.windowId, { drawAttention: true }).catch(() => {});
      }

      if (!tab.id || excludeTabIds.has(tab.id) || !isScriptableTabUrl(tab.url)) {
        continue;
      }

      if (chrome.scripting?.executeScript) {
        chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            func: triggerYellowScreenFlash,
          })
          .catch(() => {});
      }
    }
  } catch (err) {
    console.warn("[OiU Service Worker] Cross-tab flash error:", err);
  }
}

const PROFILE_STORAGE_KEY = "oiu_user_profile";
const SESSION_STORAGE_KEY = "oiu_session_state";
const ALERTED_HASHES_STORAGE_KEY = "oiu_alerted_hashes";
const ALERTS_HISTORY_STORAGE_KEY = "oiu_alerts_history";
const ACTIVE_ALERT_STORAGE_KEY = "oiu_active_alert";
const TRANSCRIPTS_STORAGE_KEY = "oiu_live_transcripts";

let currentSession: SessionInfo = {
  sessionId: "",
  tabId: -1,
  meetingPlatform: "google_meet",
  state: "INACTIVE",
};

let userProfile: UserProfile = { ...DEFAULT_PROFILE };
const backgroundDetector = new EventDetector(userProfile);

let liveTranscripts: TranscriptSegment[] = [];
let alertsHistory: MeetingEvent[] = [];
let activeAlert: MeetingEvent | null = null;

let isHydrated = false;
let hydrationPromise: Promise<void> | null = null;

async function ensureHydrated(): Promise<void> {
  if (isHydrated) return;
  if (!hydrationPromise) {
    hydrationPromise = new Promise((resolve) => {
      chrome.storage.local.get(
        [
          PROFILE_STORAGE_KEY,
          SESSION_STORAGE_KEY,
          ALERTED_HASHES_STORAGE_KEY,
          ALERTS_HISTORY_STORAGE_KEY,
          ACTIVE_ALERT_STORAGE_KEY,
          TRANSCRIPTS_STORAGE_KEY,
        ],
        (result) => {
          if (result?.[PROFILE_STORAGE_KEY]) {
            userProfile = result[PROFILE_STORAGE_KEY];
            backgroundDetector.updateProfile(userProfile);
            console.log("[OiU Service Worker] Hydrated user profile:", userProfile.displayName);
          }
          if (result?.[SESSION_STORAGE_KEY]) {
            currentSession = result[SESSION_STORAGE_KEY];
          }
          if (Array.isArray(result?.[ALERTED_HASHES_STORAGE_KEY])) {
            backgroundDetector.importAlertedHashes(result[ALERTED_HASHES_STORAGE_KEY]);
          }
          if (Array.isArray(result?.[ALERTS_HISTORY_STORAGE_KEY])) {
            alertsHistory = result[ALERTS_HISTORY_STORAGE_KEY];
          }
          if (result?.[ACTIVE_ALERT_STORAGE_KEY]) {
            activeAlert = result[ACTIVE_ALERT_STORAGE_KEY];
          }
          if (Array.isArray(result?.[TRANSCRIPTS_STORAGE_KEY])) {
            liveTranscripts = result[TRANSCRIPTS_STORAGE_KEY];
          }
          isHydrated = true;
          resolve();
        }
      );
    });
  }
  return hydrationPromise;
}

// Kick off hydration immediately on service worker startup
ensureHydrated();

function saveSessionState() {
  chrome.storage.local.set({ [SESSION_STORAGE_KEY]: currentSession }).catch(() => {});
}

// React to storage changes automatically
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[PROFILE_STORAGE_KEY]) {
    userProfile = changes[PROFILE_STORAGE_KEY].newValue || { ...DEFAULT_PROFILE };
    backgroundDetector.updateProfile(userProfile);
    console.log("[OiU Service Worker] User profile updated from storage:", userProfile.displayName);
    broadcastStateChange();
  }
});

// Notification click handler: bring Google Meet tab to front and attempt to open side panel
if (chrome.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener(() => {
    findActiveOrAnyMeetTab().then((tab) => {
      if (tab?.id) {
        chrome.tabs.update(tab.id, { active: true }).catch(() => {});
        if (tab.windowId) {
          chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
        }
        if (chrome.sidePanel?.open) {
          chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
        }
      }
    });
  });
}

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
  try {
    const [focusedActiveTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (focusedActiveTab && isGoogleMeetUrl(focusedActiveTab.url)) {
      return focusedActiveTab;
    }
  } catch {}

  try {
    const [currentActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentActiveTab && isGoogleMeetUrl(currentActiveTab.url)) {
      return currentActiveTab;
    }
  } catch {}

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
  await ensureHydrated();
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

  saveSessionState();
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    ensureHydrated().then(() => {
      if (tab?.url && isGoogleMeetUrl(tab.url)) {
        if (currentSession.state === "LISTENING") {
          currentSession.tabId = tabId;
          saveSessionState();
          chrome.tabs.sendMessage(tabId, { type: "START_MEET_MONITORING" }).catch(() => {});
        }
      }
      checkTabAndUpdateState();
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  ensureHydrated().then(() => {
    if (currentSession.tabId === tabId) {
      console.log("[OiU Service Worker] Google Meet tab closed.");
      currentSession = {
        sessionId: "",
        tabId: -1,
        meetingPlatform: "google_meet",
        state: "ERROR",
        errorMessage: "Google Meet tab was closed.",
      };
      saveSessionState();
      broadcastStateChange();
    }
  });
});

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  switch (message.type) {
    case "GET_SESSION_STATE": {
      (async () => {
        await ensureHydrated();
        const meetTab = await findActiveOrAnyMeetTab();

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
          saveSessionState();
        }

        sendResponse({
          session: currentSession,
          profile: userProfile,
          transcripts: liveTranscripts,
          alertsHistory,
          activeAlert,
        });
      })();
      return true;
    }

    case "MEETING_TAB_DETECTED": {
      const senderTabId = _sender.tab?.id;
      (async () => {
        await ensureHydrated();
        if (senderTabId && currentSession.state === "LISTENING") {
          currentSession.tabId = senderTabId;
          saveSessionState();
          chrome.tabs.sendMessage(senderTabId, { type: "START_MEET_MONITORING" }).catch(() => {});
        }
        await checkTabAndUpdateState();
        sendResponse({ acknowledged: true, isListening: currentSession.state === "LISTENING" });
      })();
      return true;
    }

    case "TRANSCRIPT_SEGMENT": {
      (async () => {
        await ensureHydrated();

        const segment = message.segment as TranscriptSegment | undefined;
        if (!segment) {
          sendResponse({ acknowledged: true });
          return;
        }

        // Run EventDetector directly inside Service Worker so alerts work even when sidepanel is CLOSED!
        const result = backgroundDetector.processSegment(segment);

        if (result.turnAction !== "NO_OP") {
          const now = Date.now();
          const incomingText = (result.accumulatedText || segment.text || "").trim();

          if (incomingText) {
            let updatedTranscripts = [...liveTranscripts];
            let matchedExisting = false;

            if (updatedTranscripts.length > 0) {
              const last = { ...updatedTranscripts[updatedTranscripts.length - 1] };
              const cleanNew = incomingText.toLowerCase().replace(/[^a-z0-9]/g, "");
              const cleanLast = last.text.toLowerCase().replace(/[^a-z0-9]/g, "");
              const timeSinceStart = now - (last.startMs || now);

              if (cleanNew === cleanLast) {
                last.endMs = now;
                updatedTranscripts[updatedTranscripts.length - 1] = last;
                matchedExisting = true;
              } else if (
                result.isContinuation &&
                timeSinceStart < 7000 &&
                (last.id === result.turnId || Math.abs(now - last.endMs) < 2200)
              ) {
                last.text = incomingText;
                last.endMs = now;
                last.isFinal = false;
                if (last.speakerId === "Speaker" || last.speakerId === "Live Voice") {
                  last.speakerId = result.speakerId || last.speakerId;
                }
                updatedTranscripts[updatedTranscripts.length - 1] = last;
                matchedExisting = true;
              }
            }

            if (!matchedExisting) {
              updatedTranscripts = updatedTranscripts.map((t) => ({ ...t, isFinal: true }));
              const newSeg: TranscriptSegment = {
                id: result.turnId || `turn_${now}`,
                sessionId: segment.sessionId || "meet_call",
                text: incomingText,
                speakerId: result.speakerId || segment.speakerId || "Speaker",
                startMs: now,
                endMs: now,
                isFinal: false,
                confidence: 0.98,
              };
              updatedTranscripts = [...updatedTranscripts.slice(-40), newSeg];
            }

            liveTranscripts = updatedTranscripts;
            chrome.storage.local.set({ [TRANSCRIPTS_STORAGE_KEY]: liveTranscripts }).catch(() => {});
          }
        }

        if (result.turnAction === "NEW_ALERT" && result.event) {
          console.log("[OiU Service Worker] Mention detected in background:", result.event);
          activeAlert = result.event;
          alertsHistory = [result.event, ...alertsHistory.slice(0, 14)];
          const exportedHashes = backgroundDetector.exportAlertedHashes();

          chrome.storage.local
            .set({
              [ACTIVE_ALERT_STORAGE_KEY]: activeAlert,
              [ALERTS_HISTORY_STORAGE_KEY]: alertsHistory,
              [ALERTED_HASHES_STORAGE_KEY]: exportedHashes,
            })
            .catch(() => {});

          // 1. Fire Chrome Desktop Notification immediately (works even when sidepanel is closed!)
          try {
            if (chrome.notifications) {
              chrome.notifications.create(`oiu_alert_${Date.now()}`, {
                type: "basic",
                iconUrl: chrome.runtime.getURL("icon.png"),
                title: "🚨 OiU Attention Alert!",
                message: `${result.event.explanation}\n"${result.event.transcriptExcerpt}"`,
                priority: 2,
                requireInteraction: true,
              });
            }
          } catch (err) {
            console.warn("[OiU Service Worker] Notification error:", err);
          }

          // 2. Play sound chime & trigger 1-second translucent yellow screen flash in Google Meet + active Chrome tabs
          const targetTabId = _sender.tab?.id || currentSession.tabId;
          const flashedMeetTabIds = new Set<number>();

          if (targetTabId && targetTabId > 0) {
            flashedMeetTabIds.add(targetTabId);
            chrome.tabs.sendMessage(targetTabId, {
              type: "PLAY_BACKGROUND_ALERT",
              event: result.event,
            }).catch(() => {});
          } else {
            try {
              const meetTabs = await chrome.tabs.query({ url: "*://meet.google.com/*" });
              for (const t of meetTabs) {
                if (t.id) {
                  flashedMeetTabIds.add(t.id);
                  chrome.tabs.sendMessage(t.id, {
                    type: "PLAY_BACKGROUND_ALERT",
                    event: result.event,
                  }).catch(() => {});
                }
              }
            } catch {}
          }

          flashVisibleChromeTabs(flashedMeetTabIds).catch(() => {});
        } else if (result.turnAction === "UPDATE_ALERT" && result.event) {
          activeAlert = result.event;
          if (alertsHistory.length > 0) {
            alertsHistory = [result.event, ...alertsHistory.slice(1)];
          } else {
            alertsHistory = [result.event];
          }
          chrome.storage.local
            .set({
              [ACTIVE_ALERT_STORAGE_KEY]: activeAlert,
              [ALERTS_HISTORY_STORAGE_KEY]: alertsHistory,
            })
            .catch(() => {});
        }

        // 3. Broadcast update to Sidepanel if open
        chrome.runtime
          .sendMessage({
            type: "BACKGROUND_DETECTION_UPDATE",
            payload: {
              turnAction: result.turnAction,
              event: result.event,
              dialogueAnalysis: result.dialogueAnalysis,
              transcripts: liveTranscripts,
              alertsHistory,
              activeAlert,
            },
          })
          .catch(() => {});

        sendResponse({ acknowledged: true });
      })();
      return true;
    }

    case "AUDIO_LEVEL": {
      sendResponse({ acknowledged: true });
      return false;
    }

    case "OPEN_SIDEPANEL_REQUEST": {
      const tabId = _sender.tab?.id || currentSession.tabId;
      if (tabId && tabId > 0 && chrome.sidePanel?.open) {
        chrome.sidePanel.open({ tabId }).catch(() => {});
      }
      sendResponse({ success: true });
      return false;
    }

    case "FLASH_ACTIVE_TABS_REQUEST": {
      flashVisibleChromeTabs().catch(() => {});
      sendResponse({ success: true });
      return false;
    }

    case "DISMISS_ACTIVE_ALERT": {
      activeAlert = null;
      chrome.storage.local.remove([ACTIVE_ALERT_STORAGE_KEY]).catch(() => {});
      sendResponse({ success: true });
      return false;
    }

    case "CLEAR_TRANSCRIPTS_REQUEST": {
      liveTranscripts = [];
      chrome.storage.local.remove([TRANSCRIPTS_STORAGE_KEY]).catch(() => {});
      sendResponse({ success: true });
      return false;
    }

    case "CLEAR_ALERTS_REQUEST": {
      alertsHistory = [];
      activeAlert = null;
      chrome.storage.local.remove([ALERTS_HISTORY_STORAGE_KEY, ACTIVE_ALERT_STORAGE_KEY]).catch(() => {});
      sendResponse({ success: true });
      return false;
    }

    case "START_SESSION_REQUEST": {
      (async () => {
        await ensureHydrated();
        try {
          const meetTab = await findActiveOrAnyMeetTab();
          const targetTabId = meetTab?.id || message.payload?.tabId || currentSession.tabId;
          if (!targetTabId || targetTabId <= 0) {
            currentSession = {
              ...currentSession,
              state: "ERROR",
              errorMessage: "No active Google Meet tab found. Please open or refresh meet.google.com first.",
            };
            saveSessionState();
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
          saveSessionState();
          console.log(`[OiU Service Worker] Zero-Impact listening active: ${newSessionId} on tab ${targetTabId}`);
          broadcastStateChange();
          sendResponse({ success: true, session: currentSession });

          // Broadcast start monitoring to ALL open Google Meet tabs so the user's active call always attaches
          const meetTabs = await chrome.tabs.query({ url: "*://meet.google.com/*" }).catch(() => []);
          const tabIdsToStart = Array.from(
            new Set([targetTabId, ...meetTabs.map((t) => t.id).filter((id): id is number => Boolean(id))])
          );

          tabIdsToStart.forEach((tid) => {
            chrome.tabs.sendMessage(tid, { type: "START_MEET_MONITORING" }, (resp) => {
              if (chrome.runtime.lastError || !resp?.success) {
                chrome.scripting
                  .executeScript({
                    target: { tabId: tid },
                    files: ["content.js"],
                  })
                  .then(() => {
                    setTimeout(() => {
                      chrome.tabs.sendMessage(tid, { type: "START_MEET_MONITORING" }).catch(() => {});
                    }, 150);
                  })
                  .catch((err) => {
                    console.warn("[OiU] Content script on-demand injection note:", err);
                  });
              }
            });
          });
        } catch (err: any) {
          console.error("[OiU Service Worker] Start error:", err);
          currentSession = {
            ...currentSession,
            state: "ERROR",
            errorMessage: err?.message || "Failed to start listening.",
          };
          saveSessionState();
          broadcastStateChange();
          sendResponse({ success: false, error: currentSession.errorMessage });
        }
      })();
      return true;
    }

    case "STOP_SESSION_REQUEST": {
      (async () => {
        await ensureHydrated();
        chrome.tabs.query({ url: "*://meet.google.com/*" }).then((tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, { type: "STOP_MEET_MONITORING" }).catch(() => {});
            }
          });
        }).catch(() => {});

        backgroundDetector.resetHistory();
        activeAlert = null;
        chrome.storage.local.remove([ALERTED_HASHES_STORAGE_KEY, ACTIVE_ALERT_STORAGE_KEY]).catch(() => {});

        currentSession = {
          sessionId: "",
          tabId: -1,
          meetingPlatform: "google_meet",
          state: "STOPPED",
          errorMessage: undefined,
        };
        saveSessionState();
        broadcastStateChange();
        sendResponse({ success: true, session: currentSession });
      })();
      return true;
    }

    case "RESET_SESSION_REQUEST": {
      (async () => {
        await ensureHydrated();
        chrome.tabs.query({ url: "*://meet.google.com/*" }).then((tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, { type: "STOP_MEET_MONITORING" }).catch(() => {});
            }
          });
        }).catch(() => {});

        backgroundDetector.resetHistory();
        liveTranscripts = [];
        alertsHistory = [];
        activeAlert = null;
        chrome.storage.local
          .remove([
            ALERTED_HASHES_STORAGE_KEY,
            ACTIVE_ALERT_STORAGE_KEY,
            ALERTS_HISTORY_STORAGE_KEY,
            TRANSCRIPTS_STORAGE_KEY,
          ])
          .catch(() => {});

        currentSession = {
          sessionId: "",
          tabId: -1,
          meetingPlatform: "google_meet",
          state: "INACTIVE",
          errorMessage: undefined,
        };
        saveSessionState();
        await checkTabAndUpdateState();
        sendResponse({ success: true, session: currentSession });
      })();
      return true;
    }

    case "SESSION_ERROR": {
      currentSession = {
        ...currentSession,
        state: "ERROR",
        errorMessage: message.payload?.message || "OiU encountered an isolated error.",
      };
      saveSessionState();
      broadcastStateChange();
      return false;
    }

    case "PROFILE_UPDATED": {
      userProfile = { ...message.payload };
      backgroundDetector.updateProfile(userProfile);
      sendResponse({ success: true, profile: userProfile });
      return false;
    }

    default:
      return false;
  }
});
