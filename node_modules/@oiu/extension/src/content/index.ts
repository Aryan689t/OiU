import { TranscriptSegment } from "@oiu/shared";

console.log("[OiU Content Script] Loaded in Zero-Impact mode.");

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

function ensureMeetCaptionsOn() {
  try {
    // If captions are already on, do nothing
    const captionsOnBtn = document.querySelector(
      'button[aria-label*="turn off captions" i], button[data-tooltip*="turn off captions" i], button[aria-pressed="true"][aria-label*="caption" i]'
    );
    if (captionsOnBtn) {
      return;
    }

    // Only click if it's explicitly an inactive caption button
    const turnOnBtn = document.querySelector(
      'button[aria-label*="turn on captions" i], button[data-tooltip*="turn on captions" i], button[aria-pressed="false"][aria-label*="caption" i]'
    ) as HTMLButtonElement | null;

    if (turnOnBtn) {
      turnOnBtn.click();
      console.log("[OiU] Turned ON Google Meet captions.");
    }
  } catch (err) {
    console.warn("[OiU] Safe note in ensureMeetCaptionsOn:", err);
  }
}

function injectMainWorldVoiceEngine() {
  const existing = document.getElementById("oiu-voice-engine-script");
  if (existing) return;

  const script = document.createElement("script");
  script.id = "oiu-voice-engine-script";
  script.textContent = `
    (function() {
      if (window.__oiuVoiceEngineActive) return;
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
            const text = (finalTranscript || interimTranscript).trim();
            if (text && text.length > 2) {
              window.postMessage({
                source: "OIU_MAIN_VOICE",
                type: "VOICE_TRANSCRIPT",
                text: text
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

      // 2. Real-time Audio Level Meter (measures live mic volume)
      let audioCtx = null;
      let analyser = null;
      let animFrameId = null;

      function startAudioMeter() {
        if (!window.__oiuVoiceEngineActive) return;
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
              const AudioCtx = window.AudioContext || window.webkitAudioContext;
              if (!AudioCtx) return;
              audioCtx = new AudioCtx();
              const source = audioCtx.createMediaStreamSource(stream);
              analyser = audioCtx.createAnalyser();
              analyser.fftSize = 64;
              analyser.smoothingTimeConstant = 0.3;
              source.connect(analyser);

              const buffer = new Uint8Array(analyser.frequencyBinCount);
              let lastEmittedLevel = 0;
              let lastEmitTime = 0;

              function pollVolume() {
                if (!window.__oiuVoiceEngineActive) return;
                analyser.getByteFrequencyData(buffer);
                let sum = 0;
                for (let i = 0; i < buffer.length; i++) {
                  sum += buffer[i];
                }
                const avg = sum / buffer.length;
                const level = Math.min(1.0, Math.round((avg / 128) * 100) / 100);
                const now = Date.now();

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
            }).catch(function(err) {
              console.log("[OiU Main World] Audio stream note:", err);
            });
          }
        } catch(err) {
          console.log("[OiU Main World] Audio meter error:", err);
        }
      }

      startAudioMeter();

      // 3. Stop listener
      window.addEventListener("message", function(e) {
        if (e.data && e.data.source === "OIU_CONTENT" && e.data.action === "STOP") {
          window.__oiuVoiceEngineActive = false;
          if (recognizer) {
            try { recognizer.stop(); } catch(err) {}
          }
          if (audioCtx) {
            try { audioCtx.close(); } catch(err) {}
          }
          if (animFrameId) {
            cancelAnimationFrame(animFrameId);
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
window.addEventListener("message", (event) => {
  if (event.data?.source !== "OIU_MAIN_VOICE") return;

  if (event.data.type === "VOICE_TRANSCRIPT" && event.data.text) {
    console.log(`[OiU Live Voice Heard]: "${event.data.text}"`);
    processCaptionText(event.data.text, "Live Voice");
  }

  if (event.data.type === "AUDIO_LEVEL" && typeof event.data.level === "number") {
    chrome.runtime.sendMessage({
      type: "AUDIO_LEVEL",
      payload: {
        level: event.data.level,
        packetsCaptured: 1,
      },
    }).catch(() => {});
  }
});

function processCaptionText(rawText: string, speakerHint?: string) {
  if (!isMonitoringActive) return;

  try {
    const text = rawText.replace(/\s+/g, " ").trim();
    if (!text || text.length < 2) return;
    if (isIgnoredUIString(text)) return;

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

    // Prevent duplicate rapid polling jitter within 700ms for the exact same text
    const now = Date.now();
    const normalizedKey = utterance.toLowerCase().replace(/[^a-z0-9]/g, "");
    const lastTime = recentUtteranceMap.get(normalizedKey);
    if (lastTime && now - lastTime < 700) {
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
    const existing = document.querySelectorAll(
      '[jsname="tgaKEf"], div.nMxLec, div.VbkSUe, div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"]'
    );
    const now = Date.now();
    existing.forEach((node) => {
      const el = node as HTMLElement;
      const text = el.textContent?.trim();
      if (text && text.length > 1) {
        el.dataset.oiuLastText = text;
        const normalizedKey = text.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normalizedKey) {
          recentUtteranceMap.set(normalizedKey, now);
        }
      }
    });
    console.log(`[OiU] Baselined ${existing.length} existing DOM captions so old past speech is not alerted.`);
  } catch (err) {
    console.warn("[OiU] Error baselining existing captions:", err);
  }
}

function scanDOMForCaptions() {
  if (!isMonitoringActive) return;

  try {
    // 1. Scan live subtitle text spans (query inner leaf spans first to prevent parent/child double-read)
    let subtitleNodes = document.querySelectorAll('[jsname="tgaKEf"]');
    if (subtitleNodes.length === 0) {
      subtitleNodes = document.querySelectorAll('div.nMxLec, div.VbkSUe');
    }
    let capturedAny = false;

    if (subtitleNodes.length > 0) {
      subtitleNodes.forEach((node) => {
        if (node.closest('[aria-label*="chat" i], [jsname="xySENc"], [role="log"]')) {
          return;
        }
        const el = node as HTMLElement;
        const text = el.textContent?.trim();
        if (text && text.length > 1) {
          // Zero duplicate reading: if this DOM element has not changed, do nothing!
          if (el.dataset.oiuLastText === text) {
            capturedAny = true;
            return;
          }
          el.dataset.oiuLastText = text;
          capturedAny = true;

          const parent = el.closest('div.nMxLec, div.iTTPOb, div[jsname="YSvyfd"]');
          const speakerEl = parent?.querySelector(".NWkf3b, .jxFHg, .zs7LEd, .bFfZTd");
          const speaker = speakerEl?.textContent?.trim() || "Speaker";
          processCaptionText(text, speaker);
        }
      });
    }

    // 2. Fallback to outer caption container if dedicated nodes not yet rendered
    if (!capturedAny) {
      const fallbackContainers = document.querySelectorAll('div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"]');
      fallbackContainers.forEach((container) => {
        if (container.closest('[aria-label*="chat" i], [jsname="xySENc"]')) return;
        const el = container as HTMLElement;
        const text = el.textContent?.trim();
        if (text && text.length > 2) {
          if (el.dataset.oiuLastText === text) {
            return;
          }
          el.dataset.oiuLastText = text;
          processCaptionText(text);
        }
      });
    }
  } catch (err) {
    console.warn("[OiU] Safe isolated error in scanDOMForCaptions:", err);
  }
}

let captionRepairIntervalId: any = null;

function startMonitoring() {
  if (isMonitoringActive) return;
  isMonitoringActive = true;
  cleanOldBadge();
  ensureMeetCaptionsOn();

  // Baseline existing captions first so static captions from 5 minutes ago are not alerted
  baselineExistingCaptions();

  // Start Direct Voice Engine (listens directly to mic & audio in Meet Main World)
  injectMainWorldVoiceEngine();

  if (scanIntervalId) clearInterval(scanIntervalId);
  // Ultra-light 600ms interval for DOM captions
  scanIntervalId = setInterval(scanDOMForCaptions, 600);

  if (captionRepairIntervalId) clearInterval(captionRepairIntervalId);
  // Graceful 5s check to ensure Meet captions remain ON
  captionRepairIntervalId = setInterval(ensureMeetCaptionsOn, 5000);

  console.log("[OiU] Dual-Engine monitoring active (Voice Engine + Captions Engine).");
}

function stopMonitoring() {
  isMonitoringActive = false;
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  if (captionRepairIntervalId) {
    clearInterval(captionRepairIntervalId);
    captionRepairIntervalId = null;
  }
  stopMainWorldVoiceEngine();
  cleanOldBadge();
  recentUtteranceMap.clear();
  console.log("[OiU] Monitoring stopped.");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "START_MEET_MONITORING") {
    startMonitoring();
    sendResponse({ success: true, monitoring: true });
    return false;
  }

  if (message?.type === "STOP_MEET_MONITORING") {
    stopMonitoring();
    sendResponse({ success: true, monitoring: false });
    return false;
  }
});
