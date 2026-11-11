import { TranscriptSegment } from "@oiu/shared";
import { pureAudioEngine, GROQ_API_KEY_STORAGE, LISTENING_MODE_STORAGE } from "../audio/audioEngine";

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

function injectMainWorldVoiceEngine() {
  const existing = document.getElementById("oiu-voice-engine-script");
  if (existing) {
    try { existing.remove(); } catch(e) {}
  }
  window.postMessage({ source: "OIU_CONTENT", action: "STOP" }, "*");

  const script = document.createElement("script");
  script.id = "oiu-voice-engine-script";
  script.textContent = `
    (function() {
      if (window.__oiuVoiceEngineCleanup) {
        try { window.__oiuVoiceEngineCleanup(); } catch(e) {}
      }
      window.__oiuVoiceEngineActive = true;
      console.log("[OiU Main World] Voice & Audio Engine injected successfully.");

      // 1. Direct Web Speech API listening in Meet's origin
      const SpeechRec = window.webkitSpeechRecognition || window.SpeechRecognition;
      let recognizer = null;

      function startRecognizer() {
        if (!window.__oiuVoiceEngineActive || !SpeechRec) return;
        try {
          if (recognizer) {
            try { recognizer.stop(); } catch(e) {}
          }
          recognizer = new SpeechRec();
          recognizer.continuous = true;
          recognizer.interimResults = true;
          recognizer.lang = "en-IN"; // English (India) & global

          recognizer.onresult = function(event) {
            let finalTranscript = "";
            let interimTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }
            if (finalTranscript.trim().length > 1) {
              window.postMessage({
                source: "OIU_MAIN_VOICE",
                type: "VOICE_TRANSCRIPT",
                text: finalTranscript.trim()
              }, "*");
            } else if (interimTranscript.trim().split(/\\s+/).length >= 4) {
              window.postMessage({
                source: "OIU_MAIN_VOICE",
                type: "VOICE_TRANSCRIPT",
                text: interimTranscript.trim()
              }, "*");
            }
          };

          recognizer.onerror = function(e) {
            if (e.error !== "no-speech" && e.error !== "aborted") {
              console.log("[OiU Main World] Speech note:", e.error);
            }
          };

          recognizer.onend = function() {
            if (window.__oiuVoiceEngineActive) {
              setTimeout(function() {
                if (window.__oiuVoiceEngineActive) {
                  try { recognizer.start(); } catch(e) {}
                }
              }, 400);
            }
          };

          recognizer.start();
          console.log("[OiU Main World] Web Speech recognizer running in Meet origin.");
        } catch(err) {
          console.log("[OiU Main World] Recognizer init error:", err);
        }
      }

      startRecognizer();

      // 2. Real-time Audio Level Meter (measures live mic volume + remote audio streams)
      let audioCtx = null;
      let analyser = null;
      let animFrameId = null;
      const hookedStreams = new WeakSet();

      function hookRemoteMeetingAudio() {
        if (!audioCtx || !analyser) return;
        try {
          const audioElements = document.querySelectorAll("audio");
          audioElements.forEach(function(el) {
            if (el.srcObject && !hookedStreams.has(el.srcObject)) {
              hookedStreams.add(el.srcObject);
              try {
                const remoteSource = audioCtx.createMediaStreamSource(el.srcObject);
                remoteSource.connect(analyser);
                console.log("[OiU Main World] Connected remote audio stream to volume analyser.");
              } catch(e) {}
            }
          });
        } catch(e) {}
      }

      function startAudioMeter() {
        if (!window.__oiuVoiceEngineActive) return;
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            audioCtx = new AudioCtx();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.3;
          }

          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
              if (audioCtx && analyser) {
                const source = audioCtx.createMediaStreamSource(stream);
                source.connect(analyser);
              }
            }).catch(function(err) {
              console.log("[OiU Main World] Local mic stream note:", err);
            });
          }

          if (!analyser) return;

          const buffer = new Uint8Array(analyser.frequencyBinCount);
          let lastEmittedLevel = 0;
          let lastEmitTime = 0;
          let lastRemoteScan = 0;

          function pollVolume() {
            if (!window.__oiuVoiceEngineActive) return;
            const now = Date.now();

            // Periodically attach newly joined remote participant audio streams
            if (now - lastRemoteScan > 1500) {
              lastRemoteScan = now;
              hookRemoteMeetingAudio();
            }

            analyser.getByteFrequencyData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) {
              sum += buffer[i];
            }
            const avg = sum / buffer.length;
            const level = Math.min(1.0, Math.round((avg / 128) * 100) / 100);

            if (Math.abs(level - lastEmittedLevel) > 0.04 || (level > 0.05 && now - lastEmitTime > 120)) {
              lastEmittedLevel = level;
              lastEmitTime = now;
              window.postMessage({
                source: "OIU_MAIN_VOICE",
                type: "AUDIO_LEVEL",
                level: level
              }, "*");
            }
            animFrameId = requestAnimationFrame(pollVolume);
          }
          pollVolume();
        } catch(err) {
          console.log("[OiU Main World] Audio meter error:", err);
        }
      }

      startAudioMeter();

      // 3. Cleanup & Stop handler
      window.__oiuVoiceEngineCleanup = function() {
        window.__oiuVoiceEngineActive = false;
        if (recognizer) {
          try { recognizer.stop(); } catch(err) {}
          recognizer = null;
        }
        if (audioCtx) {
          try { audioCtx.close(); } catch(err) {}
          audioCtx = null;
        }
        if (animFrameId) {
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
      };

      window.addEventListener("message", function(e) {
        if (e.data && e.data.source === "OIU_CONTENT" && e.data.action === "STOP") {
          if (window.__oiuVoiceEngineCleanup) {
            window.__oiuVoiceEngineCleanup();
          }
        }
      });
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
}

function stopMainWorldVoiceEngine() {
  window.postMessage({ source: "OIU_CONTENT", action: "STOP" }, "*");
  const existing = document.getElementById("oiu-voice-engine-script");
  if (existing) {
    try { existing.remove(); } catch(e) {}
  }
}

// Forward messages from injected Main World voice engine
const mainWorldMessageListener = (event: MessageEvent) => {
  if (event.data?.source !== "OIU_MAIN_VOICE") return;

  if (event.data.type === "VOICE_TRANSCRIPT" && event.data.text) {
    console.log(`[OiU Live Voice Heard]: "${event.data.text}"`);
    processCaptionText(event.data.text, "Live Voice");
  }

  if (event.data.type === "AUDIO_LEVEL" && typeof event.data.level === "number") {
    if (event.data.level > 0.04) {
      lastAudioActivityTime = Date.now();
    }

    chrome.runtime.sendMessage({
      type: "AUDIO_LEVEL",
      payload: {
        level: event.data.level,
        packetsCaptured: 1,
      },
    }).catch(() => {});
  }
};
window.addEventListener("message", mainWorldMessageListener);

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

  console.log("[OiU] Monitoring active: Native Google Meet Captions + Audio Visualizer + Stalled Caption Watchdog.");

  // 2. ALWAYS start Audio Engine (meters volume for visualizer bars + handles Whisper / Web Speech cleanly without CSP conflicts)
  try {
    chrome.storage.local.get([GROQ_API_KEY_STORAGE], (result) => {
      const groqKey = (result?.[GROQ_API_KEY_STORAGE] || "").trim();
      pureAudioEngine.start({
        groqApiKey: groqKey,
        onTranscript: (segment) => {
          processCaptionText(segment.text, segment.speakerId || "Live Meeting Audio");
        },
        onAudioLevel: (level) => {
          const ts = Date.now();
          if (level > 0.04) {
            lastAudioActivityTime = ts;
          }
          if (Math.abs(level - lastAudioLevelSent) > 0.03 || (level > 0.03 && ts - lastAudioLevelTime > 120)) {
            lastAudioLevelSent = level;
            lastAudioLevelTime = ts;
            chrome.runtime.sendMessage({
              type: "AUDIO_LEVEL",
              payload: {
                level: level,
                packetsCaptured: 1,
              },
            }).catch(() => {});
          }
        },
      });
    });
  } catch (err) {
    console.warn("[OiU] Audio engine start note:", err);
  }
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
  stopMainWorldVoiceEngine();
  try {
    pureAudioEngine.stop();
  } catch (err) {
    console.warn("[OiU] Error stopping pure audio engine:", err);
  }
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

let flashOverlayFadeTimeout: any = null;
let flashOverlayRemoveTimeout: any = null;

function clearMeetYellowScreenFlash() {
  if (flashOverlayFadeTimeout) {
    clearTimeout(flashOverlayFadeTimeout);
    flashOverlayFadeTimeout = null;
  }
  if (flashOverlayRemoveTimeout) {
    clearTimeout(flashOverlayRemoveTimeout);
    flashOverlayRemoveTimeout = null;
  }
  const existing = document.getElementById("oiu-yellow-flash-overlay");
  if (existing) existing.remove();
}

function showMeetYellowScreenFlash() {
  try {
    clearMeetYellowScreenFlash();

    const overlay = document.createElement("div");
    overlay.id = "oiu-yellow-flash-overlay";
    overlay.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 2147483647",
      "pointer-events: none",
      "background: radial-gradient(circle at center, rgba(255, 230, 0, 0.26) 0%, rgba(255, 230, 0, 0.44) 100%)",
      "box-shadow: inset 0 0 90px rgba(255, 230, 0, 0.85), inset 0 0 16px 4px rgba(255, 230, 0, 0.95)",
      "opacity: 0",
      "transition: opacity 120ms ease-out",
    ].join("; ");

    (document.body || document.documentElement).appendChild(overlay);

    // Force layout before animating in, then fade out so total effect lasts ~1 second
    void overlay.offsetWidth;
    overlay.style.opacity = "1";

    flashOverlayFadeTimeout = setTimeout(() => {
      overlay.style.transition = "opacity 780ms ease-out";
      overlay.style.opacity = "0";
    }, 220);

    flashOverlayRemoveTimeout = setTimeout(() => {
      clearMeetYellowScreenFlash();
    }, 1050);
  } catch (err) {
    console.warn("[OiU] Translucent flash overlay error:", err);
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
    showMeetYellowScreenFlash();
    sendResponse({ success: true });
    return false;
  }

  if (message?.type === "SHOW_MEET_FLASH") {
    showMeetYellowScreenFlash();
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
    clearMeetYellowScreenFlash();
    sendResponse({ success: true, monitoring: false });
    return false;
  }
};

chrome.runtime.onMessage.addListener(messageListener);

// Register instance cleanup hook so reinjections or updates never leave dangling listeners or intervals
(window as any).__oiuCleanup = () => {
  stopMonitoring();
  clearMeetYellowScreenFlash();
  try {
    chrome.runtime.onMessage.removeListener(messageListener);
  } catch {}
  try {
    window.removeEventListener("message", mainWorldMessageListener);
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
