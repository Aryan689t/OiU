import { TranscriptSegment } from "@oiu/shared";
import { triggerYellowScreenFlash, clearYellowScreenFlash } from "../utils/screenFlash";

console.log("[OiU Content Script] Loaded in Zero-Impact mode.");

// Teardown any previously running instance in this tab (e.g. across extension reload or reinjection)
if (typeof (window as any).__oiuCleanup === "function") {
  try {
    (window as any).__oiuCleanup();
  } catch (err) {
    console.warn("[OiU Content Script] Previous instance cleanup error:", err);
  }
}

// Report Google Meet tab detection to service worker
chrome.runtime.sendMessage({
  type: "MEETING_TAB_DETECTED",
  payload: { url: window.location.href },
}).catch(() => {});

let isMonitoringActive = false;
let scanIntervalId: any = null;
const recentUtteranceMap = new Map<string, number>();

// Clean up any old badges left in DOM
function cleanOldBadge() {
  try {
    const badge = document.getElementById("oiu-indicator-badge");
    if (badge) badge.remove();
  } catch {}
}
cleanOldBadge();

// Phrases from Google Meet UI to ignore
const IGNORED_PHRASES = [
  "no chat messages yet",
  "loading..",
  "loading...",
  "in-call messages",
  "send a message",
  "messages can only be seen",
  "turn on captions",
  "turn off captions",
  "people",
  "chat",
  "activities",
  "host controls",
  "meeting details",
  "more options",
  "info",
];

function isIgnoredUIString(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (lower.length < 3) return true;
  return IGNORED_PHRASES.some((phrase) => lower === phrase || lower.includes(phrase));
}

// Watchdog state to detect and auto-revive stalled Google Meet captions
let monitoringStartTime = 0;
let lastCaptionTime = 0;
let lastAudioActivityTime = 0;
let lastAutoBounceTime = 0;
let lastAudioLevelSent = 0;
let lastAudioLevelTime = 0;
let userManuallyTurnedOffCaptions = false;

// Listen for user clicks on the caption button to detect manual turn-off
document.addEventListener(
  "click",
  (event) => {
    const target = (event.target as HTMLElement)?.closest("button");
    if (!target) return;
    const label = (target.getAttribute("aria-label") || target.getAttribute("data-tooltip") || "").toLowerCase();
    if (label.includes("caption")) {
      const isCurrentlyOn = target.getAttribute("aria-pressed") === "true" || label.includes("turn off");
      if (isCurrentlyOn) {
        // User explicitly clicked to turn captions OFF. Respect their choice!
        userManuallyTurnedOffCaptions = true;
        console.log("[OiU] User manually clicked to turn OFF captions. Respecting user preference (auto-reopening disabled).");
      } else {
        // User explicitly clicked to turn captions ON.
        userManuallyTurnedOffCaptions = false;
        console.log("[OiU] User manually turned captions ON.");
      }
    }
  },
  true
);

function ensureMeetCaptionsOn() {
  if (userManuallyTurnedOffCaptions) {
    return;
  }

  try {
    // 1. If captions are already on, do nothing
    const captionsOnBtn = document.querySelector(
      'button[aria-label*="turn off captions" i], button[data-tooltip*="turn off captions" i], button[aria-pressed="true"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="true"]'
    );
    if (captionsOnBtn) {
      return;
    }

    // 2. Only click if it's explicitly an inactive caption button
    const turnOnBtn = document.querySelector(
      'button[aria-label*="turn on captions" i], button[data-tooltip*="turn on captions" i], button[aria-pressed="false"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="false"]'
    ) as HTMLButtonElement | null;

    if (turnOnBtn) {
      turnOnBtn.click();
      console.log("[OiU] Automatically turned ON Google Meet captions.");
      return;
    }

    // 3. Fallback: query any button with caption in aria-label or data-tooltip
    const anyCaptionBtn = Array.from(document.querySelectorAll("button")).find((btn) => {
      const label = (btn.getAttribute("aria-label") || btn.getAttribute("data-tooltip") || "").toLowerCase();
      return label.includes("caption") && !label.includes("off") && !label.includes("turn off");
    });
    if (anyCaptionBtn && anyCaptionBtn.getAttribute("aria-pressed") !== "true") {
      anyCaptionBtn.click();
      console.log("[OiU] Auto-clicked Meet caption toggle button.");
    }
  } catch (err) {
    console.warn("[OiU] Safe note in ensureMeetCaptionsOn:", err);
  }
}

/**
 * Bounces the Google Meet caption toggle to force-reconnect the backend WebRTC caption stream
 * when captions have stalled, gone idle, or stopped updating.
 */
function kickstartMeetCaptions() {
  if (userManuallyTurnedOffCaptions) return;

  try {
    const captionsOnBtn = document.querySelector(
      'button[aria-label*="turn off captions" i], button[data-tooltip*="turn off captions" i], button[aria-pressed="true"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="true"]'
    ) as HTMLButtonElement | null;

    if (captionsOnBtn) {
      console.log("[OiU Watchdog] Meet captions are ON but stalled. Bouncing caption connection to revive...");
      captionsOnBtn.click();
      setTimeout(() => {
        if (!isMonitoringActive || userManuallyTurnedOffCaptions) return;
        const turnOnBtn = document.querySelector(
          'button[aria-label*="turn on captions" i], button[data-tooltip*="turn on captions" i], button[aria-pressed="false"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="false"]'
        ) as HTMLButtonElement | null;
        if (turnOnBtn) {
          turnOnBtn.click();
        } else {
          captionsOnBtn.click();
        }
        console.log("[OiU Watchdog] Meet captions reconnected & refreshed successfully.");
      }, 250);
      return;
    }
  } catch (err) {
    console.warn("[OiU] Error in kickstartMeetCaptions:", err);
  }
}

let liveAudioCtx: AudioContext | null = null;
let liveAudioAnalyser: AnalyserNode | null = null;
let liveMicStream: MediaStream | null = null;
let liveMicGain: GainNode | null = null;
let liveMeterAnimId: number | null = null;

function isMeetMicMuted(): boolean {
  try {
    const micBtn = document.querySelector(
      'button[data-is-muted], div[data-is-muted], button[aria-label*="microphone" i], [role="button"][aria-label*="microphone" i]'
    );
    if (!micBtn) return false;
    const isMutedAttr = micBtn.getAttribute("data-is-muted");
    if (isMutedAttr === "true") return true;
    if (isMutedAttr === "false") return false;
    const label = (micBtn.getAttribute("aria-label") || "").toLowerCase();
    if (label.includes("turn on microphone") || label.includes("microphone is off")) return true;
    if (label.includes("turn off microphone") || label.includes("microphone is on")) return false;
  } catch {}
  return false;
}

function startLiveAudioMeter() {
  stopLiveAudioMeter();

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    liveAudioCtx = new AudioCtx();
    if (liveAudioCtx.state === "suspended") {
      liveAudioCtx.resume().catch(() => {});
    }

    liveAudioAnalyser = liveAudioCtx.createAnalyser();
    liveAudioAnalyser.fftSize = 64;
    liveAudioAnalyser.smoothingTimeConstant = 0.3;

    // Connect local microphone directly inside content script (zero inline script injection, zero CSP blocks)
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then((stream) => {
          if (!isMonitoringActive || !liveAudioCtx || !liveAudioAnalyser) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          liveMicStream = stream;
          const micSource = liveAudioCtx.createMediaStreamSource(stream);
          liveMicGain = liveAudioCtx.createGain();
          const muted = isMeetMicMuted();
          liveMicGain.gain.setValueAtTime(muted ? 0 : 1, liveAudioCtx.currentTime);

          micSource.connect(liveMicGain);
          liveMicGain.connect(liveAudioAnalyser);
          console.log(`[OiU] Microphone connected to live audio meter (Meet mute state: ${muted ? "muted" : "active"}).`);
        })
        .catch((err) => {
          console.log("[OiU] Microphone stream note:", err);
        });
    }

    const buffer = new Uint8Array(liveAudioAnalyser.frequencyBinCount);
    let lastLevelSent = 0;
    let lastSendTime = 0;

    const poll = () => {
      if (!isMonitoringActive || !liveAudioAnalyser || !liveAudioCtx) return;

      // Update mic gain in real time based on whether user is muted in Google Meet
      if (liveMicGain) {
        const isMuted = isMeetMicMuted();
        const target = isMuted ? 0 : 1;
        if (Math.abs(liveMicGain.gain.value - target) > 0.01) {
          liveMicGain.gain.setValueAtTime(target, liveAudioCtx.currentTime);
        }
      }

      liveAudioAnalyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i];
      }
      const avg = sum / buffer.length;
      let level = Math.min(1.0, Math.round((avg / 128) * 100) / 100);

      // Check if remote participants are speaking via captions or DOM indicator
      const now = Date.now();
      const hasRecentRemoteSpeech = now - lastAudioActivityTime < 650;
      if (level < 0.04 && hasRecentRemoteSpeech) {
        level = 0.35;
      }

      const isVoiceNow = level > 0.04;
      if (isVoiceNow) {
        lastAudioActivityTime = now;
      }

      if (
        Math.abs(level - lastLevelSent) > 0.03 ||
        (isVoiceNow && now - lastSendTime > 90) ||
        (!isVoiceNow && lastLevelSent > 0)
      ) {
        lastLevelSent = isVoiceNow ? level : 0;
        lastSendTime = now;
        chrome.runtime
          .sendMessage({
            type: "AUDIO_LEVEL",
            payload: {
              level: lastLevelSent,
              packetsCaptured: 1,
            },
          })
          .catch(() => {});
      }

      liveMeterAnimId = requestAnimationFrame(poll);
    };

    poll();
  } catch (err) {
    console.warn("[OiU] Error starting live audio meter:", err);
  }
}

function stopLiveAudioMeter() {
  if (liveMeterAnimId) {
    cancelAnimationFrame(liveMeterAnimId);
    liveMeterAnimId = null;
  }
  if (liveMicStream) {
    try {
      liveMicStream.getTracks().forEach((t) => t.stop());
    } catch {}
    liveMicStream = null;
  }
  if (liveMicGain) {
    try {
      liveMicGain.disconnect();
    } catch {}
    liveMicGain = null;
  }
  if (liveAudioCtx) {
    try {
      liveAudioCtx.close();
    } catch {}
    liveAudioCtx = null;
  }
  liveAudioAnalyser = null;
}

function processCaptionText(rawText: string, speakerHint?: string) {
  if (!isMonitoringActive) return;

  try {
    const text = rawText.replace(/\s+/g, " ").trim();
    if (!text || text.length < 2) return;
    if (isIgnoredUIString(text)) return;

    lastCaptionTime = Date.now();

    let speakerName = speakerHint || "Speaker";
    let utterance = text;

    if (text.includes("\n")) {
      const parts = text.split("\n");
      if (parts.length >= 2 && parts[0].length < 35) {
        speakerName = parts[0].trim();
        utterance = parts.slice(1).join(" ").trim();
      }
    } else if (text.includes(":") && text.indexOf(":") < 30) {
      const parts = text.split(":");
      speakerName = parts[0].trim();
      utterance = parts.slice(1).join(":").trim();
    }

    if (!utterance || utterance.length < 2 || isIgnoredUIString(utterance)) return;

    // Prevent duplicate rapid polling jitter and cross-engine duplicate emission within 2200ms
    const now = Date.now();
    const normalizedKey = utterance.toLowerCase().replace(/[^a-z0-9]/g, "");
    const lastTime = recentUtteranceMap.get(normalizedKey);
    if (lastTime && now - lastTime < 2200) {
      return;
    }

    recentUtteranceMap.set(normalizedKey, now);

    // Clean old entries past 15 seconds
    if (recentUtteranceMap.size > 80) {
      for (const [key, time] of recentUtteranceMap.entries()) {
        if (now - time > 15000) {
          recentUtteranceMap.delete(key);
        }
      }
    }

    console.log(`[OiU Captions Found] ${speakerName}: "${utterance}"`);

    // Emit live audio level pulse to sidepanel waveform so it dances with incoming speech
    lastAudioActivityTime = now;
    chrome.runtime.sendMessage({
      type: "AUDIO_LEVEL",
      payload: {
        level: 0.38 + Math.random() * 0.28,
        packetsCaptured: 1,
      },
    }).catch(() => {});

    const segment: TranscriptSegment = {
      id: `seg_${now}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId: "meet_call",
      text: utterance,
      speakerId: speakerName,
      startMs: now - 1000,
      endMs: now,
      isFinal: true,
      confidence: 0.98,
    };

    chrome.runtime.sendMessage({
      type: "TRANSCRIPT_SEGMENT",
      segment,
    }).catch(() => {});
  } catch (err) {
    console.warn("[OiU] Error in caption processing (isolated):", err);
  }
}

function baselineExistingCaptions() {
  try {
    recentUtteranceMap.clear();
    const existing = document.querySelectorAll(
      '[jsname="tgaKEf"], span.V67aGc, div.nMxLec, div.VbkSUe, div.ygicle, div.BH9oQ, span.bh44bd, [jsname="r4nke"], div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"], div[jsname="YSfeed"], div[jscontroller="D1tHje"], [role="region"][aria-label*="caption" i]'
    );
    existing.forEach((node) => {
      const el = node as HTMLElement;
      delete el.dataset.oiuLastText;
      delete el.dataset.oiuSealedLength;
      delete el.dataset.oiuSentenceStartTime;
      delete el.dataset.oiuLastChangeTime;
    });
    console.log(`[OiU] Prepared caption baseline for new session (${existing.length} nodes reset).`);
  } catch (err) {
    console.warn("[OiU] Error baselining existing captions:", err);
  }
}

function scanDOMForCaptions() {
  if (!isMonitoringActive) return;

  try {
    // 1. Scan live subtitle text spans (strictly exclude UI buttons/dropdowns/chat to prevent false blocking)
    let subtitleNodes = Array.from(
      document.querySelectorAll(
        '[jsname="tgaKEf"], div.VbkSUe, div.ygicle, div.BH9oQ, span.bh44bd, [role="region"][aria-label*="caption" i] span.V67aGc, div.nMxLec span.V67aGc, div.iTTPOb span.V67aGc, [role="region"][aria-label*="caption" i] [jsname="r4nke"]'
      )
    ).filter((node) => {
      if (node.closest('button, [role="button"], [role="combobox"], [role="listbox"], [aria-label*="chat" i], [jsname="xySENc"], [role="log"]')) {
        return false;
      }
      return true;
    });

    if (subtitleNodes.length === 0) {
      subtitleNodes = Array.from(
        document.querySelectorAll('div.nMxLec, div.iTTPOb, div.zT3Aid, div[jscontroller="D1tHje"]')
      ).filter((node) => {
        return !node.closest('button, [role="button"], [aria-label*="chat" i], [jsname="xySENc"], [role="log"]');
      });
    }
    let capturedAny = false;

    if (subtitleNodes.length > 0) {
      subtitleNodes.forEach((node) => {
        const el = node as HTMLElement;
        const fullText = el.textContent?.trim() || "";
        if (fullText.length < 2 || isIgnoredUIString(fullText)) return;

        // Zero duplicate reading: if this DOM element has not changed, do nothing!
        if (el.dataset.oiuLastText === fullText) {
          capturedAny = true;
          return;
        }

        const now = Date.now();
        const lastChangeTime = Number(el.dataset.oiuLastChangeTime || "0");
        let sentenceStartTime = Number(el.dataset.oiuSentenceStartTime || "0");
        let sealedLength = Number(el.dataset.oiuSealedLength || "0");
        const prevText = el.dataset.oiuLastText || "";

        if (sentenceStartTime === 0 || sealedLength >= fullText.length) {
          sentenceStartTime = now;
          el.dataset.oiuSentenceStartTime = String(now);
        }

        // 1. THE 7-SECOND TIME LIMIT RULE (User Requirement):
        // Any speech said after 7 seconds is counted as a brand NEW sentence.
        // By 7 seconds, the user is expected to have seen/responded to the previous statement.
        // We seal everything up to prevText so the previous sentence is archived,
        // and new words start cleanly as a fresh sentence!
        if (sentenceStartTime > 0 && now - sentenceStartTime >= 7000 && fullText.length > sealedLength) {
          sealedLength = prevText.length;
          el.dataset.oiuSealedLength = String(sealedLength);
          sentenceStartTime = now;
          el.dataset.oiuSentenceStartTime = String(now);
        }

        // 2. Pause boundary: If speaker stopped talking for > 1800ms, the previous phrase is finished
        if (lastChangeTime > 0 && now - lastChangeTime > 1800 && fullText.length > sealedLength) {
          sealedLength = prevText.length;
          el.dataset.oiuSealedLength = String(sealedLength);
          sentenceStartTime = now;
          el.dataset.oiuSentenceStartTime = String(now);
        }

        // 3. Punctuation sentence seal: If unsealed text contains [.?!] followed by new words
        if (sealedLength < fullText.length) {
          const unsealed = fullText.slice(sealedLength);
          const punctMatch = unsealed.match(/^([\s\S]*?[.?!])\s+(\S[\s\S]*)$/);
          if (punctMatch && punctMatch[2] && punctMatch[2].length >= 2) {
            sealedLength += unsealed.indexOf(punctMatch[2]);
            el.dataset.oiuSealedLength = String(sealedLength);
            sentenceStartTime = now;
            el.dataset.oiuSentenceStartTime = String(now);
          }
        }

        // 4. Consecutive question boundary seal:
        // If unsealed text has an earlier question (at least 2 words) and a new question starter appears,
        // seal before the new question so questions never get merged together!
        if (sealedLength < fullText.length) {
          const unsealed = fullText.slice(sealedLength);
          const qBoundaryMatch = unsealed.match(/^(.{10,}?)\s+(?=(?:what is|what are|what was|what were|what ise|aur what is|aur what ise|and what is|why is|how is|can you)\b)/i);
          if (qBoundaryMatch && qBoundaryMatch[1] && qBoundaryMatch[1].trim().length >= 8) {
            sealedLength += qBoundaryMatch[1].length;
            el.dataset.oiuSealedLength = String(sealedLength);
            sentenceStartTime = now;
            el.dataset.oiuSentenceStartTime = String(now);
          }
        }

        // 5. Keep active speech window fresh: if text grows beyond 1 completed sentence or > 120 chars,
        // seal older sentences so past minutes of captions are never retained in currentSpeech
        if (fullText.length - sealedLength > 120) {
          const tail = fullText.slice(sealedLength);
          const punctIndices: number[] = [];
          for (let i = 0; i < tail.length; i++) {
            if (tail[i] === "?" || tail[i] === "." || tail[i] === "!") {
              punctIndices.push(i);
            }
          }
          if (punctIndices.length >= 1) {
            const cutIdx = punctIndices[punctIndices.length - 1] + 1;
            sealedLength += cutIdx;
            el.dataset.oiuSealedLength = String(sealedLength);
            sentenceStartTime = now;
            el.dataset.oiuSentenceStartTime = String(now);
          } else if (tail.length > 160) {
            const safeCut = tail.lastIndexOf(" ", tail.length - 60);
            if (safeCut > 30) {
              sealedLength += safeCut + 1;
              el.dataset.oiuSealedLength = String(sealedLength);
              sentenceStartTime = now;
              el.dataset.oiuSentenceStartTime = String(now);
            }
          }
        }

        el.dataset.oiuLastText = fullText;
        el.dataset.oiuLastChangeTime = String(now);
        capturedAny = true;

        // Extract ONLY the current active speech (strip previous sealed phrases from 5 minutes ago)
        let currentSpeech = fullText;
        if (sealedLength > 0 && fullText.length > sealedLength) {
          currentSpeech = fullText.slice(sealedLength).trim();
        }

        if (currentSpeech.length < 2) return;

        const parent = el.closest('div.nMxLec, div.iTTPOb, div[jsname="YSvyfd"], div[jsname="YSfeed"], div[jscontroller="D1tHje"]');
        const speakerEl = parent?.querySelector(".NWkf3b, .jxFHg, .zs7LEd, .bFfZTd, [jsname=\"W24eoe\"], .Kj4Yde, .adEAYb");
        const speaker = speakerEl?.textContent?.trim() || "Speaker";
        processCaptionText(currentSpeech, speaker);
      });
    }

    // 2. Fallback to outer caption container if dedicated nodes not yet rendered
    if (!capturedAny) {
      const fallbackContainers = document.querySelectorAll(
        'div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"], div[jsname="YSfeed"], div[jscontroller="D1tHje"], div[aria-live="polite"], div[role="region"][aria-label*="caption" i]'
      );
      fallbackContainers.forEach((container) => {
        if (container.closest('[aria-label*="chat" i], [jsname="xySENc"]')) return;
        const el = container as HTMLElement;
        const fullText = el.textContent?.trim() || "";
        if (fullText.length < 2) return;

        if (el.dataset.oiuLastText === fullText) return;

        const now = Date.now();
        const lastChangeTime = Number(el.dataset.oiuLastChangeTime || "0");
        let sentenceStartTime = Number(el.dataset.oiuSentenceStartTime || "0");
        let sealedLength = Number(el.dataset.oiuSealedLength || "0");
        const prevText = el.dataset.oiuLastText || "";

        if (sentenceStartTime === 0 || sealedLength >= fullText.length) {
          sentenceStartTime = now;
          el.dataset.oiuSentenceStartTime = String(now);
        }

        // 1. User's 7-Second Rule
        if (sentenceStartTime > 0 && now - sentenceStartTime >= 7000 && fullText.length > sealedLength) {
          sealedLength = prevText.length;
          el.dataset.oiuSealedLength = String(sealedLength);
          sentenceStartTime = now;
          el.dataset.oiuSentenceStartTime = String(now);
        }

        // 2. Pause of > 1800ms
        if (lastChangeTime > 0 && now - lastChangeTime > 1800 && fullText.length > sealedLength) {
          sealedLength = prevText.length;
          el.dataset.oiuSealedLength = String(sealedLength);
          sentenceStartTime = now;
          el.dataset.oiuSentenceStartTime = String(now);
        }

        // 3. Punctuation sentence seal
        if (sealedLength < fullText.length) {
          const unsealed = fullText.slice(sealedLength);
          const punctMatch = unsealed.match(/^([\s\S]*?[.?!])\s+(\S[\s\S]*)$/);
          if (punctMatch && punctMatch[2] && punctMatch[2].length >= 2) {
            sealedLength += unsealed.indexOf(punctMatch[2]);
            el.dataset.oiuSealedLength = String(sealedLength);
            sentenceStartTime = now;
            el.dataset.oiuSentenceStartTime = String(now);
          }
        }

        // 4. Consecutive question boundary seal
        if (sealedLength < fullText.length) {
          const unsealed = fullText.slice(sealedLength);
          const qBoundaryMatch = unsealed.match(/^(.{10,}?)\s+(?=(?:what is|what are|what was|what were|what ise|aur what is|aur what ise|and what is|why is|how is|can you)\b)/i);
          if (qBoundaryMatch && qBoundaryMatch[1] && qBoundaryMatch[1].trim().length >= 8) {
            sealedLength += qBoundaryMatch[1].length;
            el.dataset.oiuSealedLength = String(sealedLength);
            sentenceStartTime = now;
            el.dataset.oiuSentenceStartTime = String(now);
          }
        }

        // 5. Keep active speech window fresh
        if (fullText.length - sealedLength > 120) {
          const tail = fullText.slice(sealedLength);
          const punctIndices: number[] = [];
          for (let i = 0; i < tail.length; i++) {
            if (tail[i] === "?" || tail[i] === "." || tail[i] === "!") {
              punctIndices.push(i);
            }
          }
          if (punctIndices.length >= 1) {
            const cutIdx = punctIndices[punctIndices.length - 1] + 1;
            sealedLength += cutIdx;
            el.dataset.oiuSealedLength = String(sealedLength);
            sentenceStartTime = now;
            el.dataset.oiuSentenceStartTime = String(now);
          } else if (tail.length > 160) {
            const safeCut = tail.lastIndexOf(" ", tail.length - 60);
            if (safeCut > 30) {
              sealedLength += safeCut + 1;
              el.dataset.oiuSealedLength = String(sealedLength);
              sentenceStartTime = now;
              el.dataset.oiuSentenceStartTime = String(now);
            }
          }
        }

        el.dataset.oiuLastText = fullText;
        el.dataset.oiuLastChangeTime = String(now);

        let currentSpeech = fullText;
        if (sealedLength > 0 && fullText.length > sealedLength) {
          currentSpeech = fullText.slice(sealedLength).trim();
        }

        if (currentSpeech.length < 2) return;
        processCaptionText(currentSpeech);
      });
    }
  } catch (err) {
    console.warn("[OiU] Safe isolated error in scanDOMForCaptions:", err);
  }
}

let captionRepairIntervalId: any = null;

function checkCaptionHealthAndWatchdog() {
  // If monitoring is stopped or user intentionally turned off Meet captions, do nothing!
  if (!isMonitoringActive || userManuallyTurnedOffCaptions) return;
  const now = Date.now();

  // Watchdog: If audio activity was detected in the meeting (someone spoke in the last 10s),
  // but captions have produced zero updates for > 15 seconds, and we haven't auto-bounced recently
  if (
    now - monitoringStartTime > 15000 &&
    lastAudioActivityTime > 0 &&
    now - lastAudioActivityTime < 10000 &&
    now - lastCaptionTime > 15000 &&
    now - lastAutoBounceTime > 35000
  ) {
    console.log("[OiU Watchdog] Sound activity detected but Google Meet captions stalled for >15s. Auto-kickstarting captions...");
    lastAutoBounceTime = now;
    kickstartMeetCaptions();
  }
}

function startMonitoring() {
  if (isMonitoringActive) return;
  isMonitoringActive = true;
  userManuallyTurnedOffCaptions = false;
  const now = Date.now();
  monitoringStartTime = now;
  lastCaptionTime = now;
  lastAudioActivityTime = 0;
  lastAutoBounceTime = 0;

  cleanOldBadge();

  // 1. ALWAYS start Native Google Meet Captions Engine & DOM Scanner
  ensureMeetCaptionsOn();
  baselineExistingCaptions();

  if (scanIntervalId) clearInterval(scanIntervalId);
  scanIntervalId = setInterval(scanDOMForCaptions, 500);

  if (captionRepairIntervalId) clearInterval(captionRepairIntervalId);
  captionRepairIntervalId = setInterval(checkCaptionHealthAndWatchdog, 4000);

  // 2. Start Live Voice & Microphone Meter (runs directly in content script, zero CSP blocks)
  startLiveAudioMeter();

  console.log("[OiU] Monitoring active: Native Google Meet Captions + Live Audio Meter + Stalled Caption Watchdog.");
}

function stopMonitoring() {
  isMonitoringActive = false;
  userManuallyTurnedOffCaptions = false;

  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  if (captionRepairIntervalId) {
    clearInterval(captionRepairIntervalId);
    captionRepairIntervalId = null;
  }
  stopLiveAudioMeter();
  cleanOldBadge();
  recentUtteranceMap.clear();
  console.log("[OiU] Monitoring stopped.");
}

function playBackgroundAlertChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    // First tone (E5 - 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.28, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.2);

    // Second tone (A5 - 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.32, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.35);

    setTimeout(() => {
      try { ctx.close(); } catch {}
    }, 450);
  } catch (err) {
    console.warn("[OiU] Background chime playback note:", err);
  }
}

const messageListener = (message: any, _sender: any, sendResponse: (res?: any) => void) => {
  if (message?.type === "START_MEET_MONITORING") {
    startMonitoring();
    sendResponse({ success: true, monitoring: true });
    return false;
  }

  if (message?.type === "PLAY_BACKGROUND_ALERT") {
    playBackgroundAlertChime();
    triggerYellowScreenFlash();
    sendResponse({ success: true });
    return false;
  }

  if (message?.type === "SHOW_MEET_FLASH") {
    triggerYellowScreenFlash();
    sendResponse({ success: true });
    return false;
  }

  if (message?.type === "KICKSTART_MEET_CAPTIONS" || message?.type === "TOGGLE_MEET_CAPTIONS") {
    kickstartMeetCaptions();
    sendResponse({ success: true });
    return false;
  }

  if (message?.type === "STOP_MEET_MONITORING") {
    stopMonitoring();
    clearYellowScreenFlash();
    sendResponse({ success: true, monitoring: false });
    return false;
  }
};

chrome.runtime.onMessage.addListener(messageListener);

// Register instance cleanup hook so reinjections or updates never leave dangling listeners or intervals
(window as any).__oiuCleanup = () => {
  stopMonitoring();
  clearYellowScreenFlash();
  try {
    chrome.runtime.onMessage.removeListener(messageListener);
  } catch {}
};

// Auto-sync session state on startup: if background is already listening, activate immediately!
chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" }, (response) => {
  if (chrome.runtime.lastError) return;
  if (response?.session?.state === "LISTENING") {
    console.log("[OiU Content Script] Background session is in LISTENING state, auto-starting monitoring.");
    startMonitoring();
  }
});
