/**
 * OiU Pure Audio Engine
 *
 * Captures live meeting sound directly from the audio stream (both remote speaker
 * audio and local microphone) and transcribes speech using Groq's high-speed
 * Whisper Large V3 Turbo API (with built-in Web Speech API fallback).
 *
 * Zero dependency on Google Meet captions!
 */

import { TranscriptSegment } from "@oiu/shared";

export const GROQ_API_KEY_STORAGE = "oiu_groq_api_key";
export const LISTENING_MODE_STORAGE = "oiu_listening_mode"; // "audio_only" | "dual"

export interface AudioEngineOptions {
  groqApiKey?: string;
  onTranscript: (segment: TranscriptSegment) => void;
  onAudioLevel?: (level: number) => void;
  onStatusChange?: (status: "idle" | "listening" | "transcribing" | "error", message?: string) => void;
}

/**
 * Validates a Groq API key by sending a tiny test request
 */
export async function testGroqApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { success: false, message: "Groq API key cannot be empty." };
  }

  if (!cleanKey.startsWith("gsk_")) {
    return { success: false, message: "Invalid key format. Groq API keys start with 'gsk_'." };
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
    });

    if (res.ok) {
      return { success: true, message: "Groq API connected successfully! Whisper Large V3 ready." };
    }

    if (res.status === 401) {
      return { success: false, message: "Invalid API key (401 Unauthorized)." };
    }

    const errData = await res.json().catch(() => ({}));
    return { success: false, message: errData?.error?.message || `Groq error (status ${res.status}).` };
  } catch (err: any) {
    return { success: false, message: err?.message || "Failed to reach Groq API. Check internet connection." };
  }
}

/**
 * Sends a WebM audio blob directly to Groq's Whisper Large V3 Turbo API for transcription
 */
export async function transcribeWithGroq(audioBlob: Blob, apiKey: string): Promise<string> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error("No Groq API key provided.");
  }

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "json");
  formData.append("temperature", "0.0");
  formData.append("language", "en"); // Primary language English (handles Indian/Hinglish accents smoothly)

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cleanKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || `Groq API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  return (data.text || "").trim();
}

export class PureAudioEngine {
  private active = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mixedStreamDestination: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private options: AudioEngineOptions | null = null;
  private groqApiKey = "";

  // Voice Activity Detection (VAD) state
  private isSpeaking = false;
  private speechStartTime = 0;
  private lastSoundTime = 0;
  private silenceTimer: any = null;
  private chunkTimer: any = null;
  private recordedChunks: Blob[] = [];
  private animFrameId: number | null = null;
  private remoteScanInterval: any = null;
  private attachedMediaElements = new WeakSet<HTMLAudioElement | MediaStream>();

  // Browser speech recognition fallback
  private browserSpeechRecognizer: any = null;

  constructor() {
    this.loadSavedApiKey();
  }

  private async loadSavedApiKey() {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([GROQ_API_KEY_STORAGE], (result) => {
        if (result?.[GROQ_API_KEY_STORAGE]) {
          this.groqApiKey = result[GROQ_API_KEY_STORAGE];
        }
      });
    }
  }

  public setApiKey(key: string) {
    this.groqApiKey = key.trim();
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ [GROQ_API_KEY_STORAGE]: this.groqApiKey });
    }
  }

  public getApiKey(): string {
    return this.groqApiKey;
  }

  public isRunning(): boolean {
    return this.active;
  }

  /**
   * Starts capturing meeting audio (tab WebRTC streams + microphone) and pipes to Groq Whisper
   */
  public async start(options: AudioEngineOptions): Promise<boolean> {
    if (this.active) return true;
    this.options = options;
    if (options.groqApiKey) {
      this.groqApiKey = options.groqApiKey.trim();
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error("Web Audio API not supported in this browser.");
      }

      this.audioContext = new AudioCtx();
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;

      this.mixedStreamDestination = this.audioContext.createMediaStreamDestination();

      // 1. Hook into meeting's remote participant audio
      this.hookMeetingRemoteAudio();

      // 2. Hook into local microphone so when user speaks or answers, that's heard too
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const micSource = this.audioContext.createMediaStreamSource(micStream);
          micSource.connect(this.analyser);
          micSource.connect(this.mixedStreamDestination);
          console.log("[OiU Audio Engine] Microphone stream linked to audio pipeline.");
        }
      } catch (micErr) {
        console.log("[OiU Audio Engine] Microphone permission note (remote audio still active):", micErr);
      }

      // 3. Scan periodically for newly connected participant audio streams
      this.remoteScanInterval = setInterval(() => {
        if (this.active) this.hookMeetingRemoteAudio();
      }, 2000);

      this.active = true;
      this.startVolumeMonitoringAndVAD();

      // If user has no Groq key entered yet, spin up browser Web Speech API as instant backup
      if (!this.groqApiKey) {
        this.startBrowserSpeechFallback();
      }

      this.options?.onStatusChange?.("listening", "Listening to live meeting audio (Zero-captions)");
      console.log("[OiU Audio Engine] Pure Audio Mode initialized successfully. Zero captions dependency.");
      return true;
    } catch (err: any) {
      console.error("[OiU Audio Engine] Failed to start pure audio engine:", err);
      this.options?.onStatusChange?.("error", err?.message || "Audio engine initialization failed.");
      this.stop();
      return false;
    }
  }

  /**
   * Scans Google Meet DOM for WebRTC `<audio>` elements and routes them into our mixer
   */
  private hookMeetingRemoteAudio() {
    if (!this.audioContext || !this.analyser || !this.mixedStreamDestination) return;

    try {
      const audioElements = document.querySelectorAll("audio");
      audioElements.forEach((audioEl) => {
        const stream = (audioEl as any).srcObject as MediaStream | undefined;

        if (stream && !this.attachedMediaElements.has(stream)) {
          this.attachedMediaElements.add(stream);
          try {
            const remoteSource = this.audioContext!.createMediaStreamSource(stream);
            remoteSource.connect(this.analyser!);
            remoteSource.connect(this.mixedStreamDestination!);
            console.log("[OiU Audio Engine] Hooked remote speaker audio stream to Groq pipeline.");
          } catch (e) {
            console.warn("[OiU Audio Engine] Stream hook note:", e);
          }
        } else if (!this.attachedMediaElements.has(audioEl)) {
          this.attachedMediaElements.add(audioEl);
          try {
            const elSource = this.audioContext!.createMediaElementSource(audioEl);
            elSource.connect(this.analyser!);
            elSource.connect(this.mixedStreamDestination!);
            elSource.connect(this.audioContext!.destination); // preserve audio playback to headphones
            console.log("[OiU Audio Engine] Hooked audio element source.");
          } catch {}
        }
      });
    } catch (err) {
      console.warn("[OiU Audio Engine] Audio element hook error:", err);
    }
  }

  /**
   * Continuous volume analysis and Voice Activity Detection (VAD).
   * Bundles speech into 3–6s audio slices and sends only active speech to Groq Whisper.
   */
  private startVolumeMonitoringAndVAD() {
    if (!this.analyser) return;

    const buffer = new Uint8Array(this.analyser.frequencyBinCount);
    const SILENCE_THRESHOLD = 0.035; // Volume threshold for human speech
    const SILENCE_DURATION_MS = 800; // 800ms of silence finishes the sentence
    const MAX_CHUNK_DURATION_MS = 6500; // Cap at 6.5s to prevent runaway buffer

    const checkVolume = () => {
      if (!this.active || !this.analyser) return;

      this.analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i];
      }
      const avg = sum / buffer.length;
      const normalizedLevel = Math.min(1.0, Math.round((avg / 128) * 100) / 100);

      this.options?.onAudioLevel?.(normalizedLevel);

      const now = Date.now();

      if (normalizedLevel >= SILENCE_THRESHOLD) {
        this.lastSoundTime = now;

        if (!this.isSpeaking) {
          // Speech started!
          this.isSpeaking = true;
          this.speechStartTime = now;
          this.startSpeechChunkRecording();
        }

        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }

        // Cap long speeches at 6.5s chunk to transcribe promptly
        if (now - this.speechStartTime >= MAX_CHUNK_DURATION_MS) {
          this.finishSpeechChunkRecording();
        }
      } else if (this.isSpeaking) {
        // Speech paused or stopped
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.finishSpeechChunkRecording();
          }, SILENCE_DURATION_MS);
        }
      }

      this.animFrameId = requestAnimationFrame(checkVolume);
    };

    checkVolume();
  }

  private startSpeechChunkRecording() {
    if (!this.mixedStreamDestination) return;

    try {
      this.recordedChunks = [];
      const stream = this.mixedStreamDestination.stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      this.mediaRecorder = new MediaRecorder(stream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.recordedChunks, { type: mimeType });
        this.recordedChunks = [];

        // Only process chunks that have at least 0.8s of real audio content (size > 8KB)
        if (audioBlob.size > 8000) {
          this.dispatchAudioToWhisper(audioBlob);
        }
      };

      this.mediaRecorder.start(250);
    } catch (err) {
      console.warn("[OiU Audio Engine] MediaRecorder start error:", err);
    }
  }

  private finishSpeechChunkRecording() {
    this.isSpeaking = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch (err) {}
    }
  }

  /**
   * Sends captured audio slice to Groq Whisper Large V3 Turbo
   */
  private async dispatchAudioToWhisper(blob: Blob) {
    if (!this.active) return;

    const apiKey = this.groqApiKey;
    if (!apiKey) {
      // Fallback: Web Speech API handles it
      return;
    }

    try {
      this.options?.onStatusChange?.("transcribing", "Transcribing with Groq Whisper Large V3...");
      const text = await transcribeWithGroq(blob, apiKey);

      if (text && text.length >= 2) {
        console.log(`[OiU Groq Whisper Heard]: "${text}"`);
        const now = Date.now();
        const segment: TranscriptSegment = {
          id: `whisper_${now}_${Math.random().toString(36).substring(2, 6)}`,
          sessionId: "live_audio_session",
          text: text,
          speakerId: "Live Meeting Audio",
          startMs: now - 3000,
          endMs: now,
          isFinal: true,
          confidence: 0.99,
        };

        this.options?.onTranscript(segment);

        // Also broadcast to Chrome extension runtime so detector picks it up immediately
        if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            type: "TRANSCRIPT_SEGMENT",
            segment,
          }).catch(() => {});
        }
      }
      this.options?.onStatusChange?.("listening");
    } catch (err: any) {
      console.warn("[OiU Audio Engine] Groq transcription error:", err);
      this.options?.onStatusChange?.("error", `Groq: ${err?.message || "Transcription failed"}`);
    }
  }

  /**
   * Browser Web Speech API fallback when Groq key is not yet set
   */
  private startBrowserSpeechFallback() {
    const SpeechRec = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRec) return;

    try {
      this.browserSpeechRecognizer = new SpeechRec();
      this.browserSpeechRecognizer.continuous = true;
      this.browserSpeechRecognizer.interimResults = false;
      this.browserSpeechRecognizer.lang = "en-IN";

      this.browserSpeechRecognizer.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }

        const clean = transcript.trim();
        if (clean.length >= 2) {
          const now = Date.now();
          const segment: TranscriptSegment = {
            id: `speech_${now}_${Math.random().toString(36).substring(2, 6)}`,
            sessionId: "live_audio_session",
            text: clean,
            speakerId: "Live Meeting Audio",
            startMs: now - 2000,
            endMs: now,
            isFinal: true,
            confidence: 0.95,
          };
          this.options?.onTranscript(segment);
          if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({
              type: "TRANSCRIPT_SEGMENT",
              segment,
            }).catch(() => {});
          }
        }
      };

      this.browserSpeechRecognizer.onerror = (e: any) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          console.log("[OiU Audio Engine] Web Speech fallback note:", e.error);
        }
      };

      this.browserSpeechRecognizer.onend = () => {
        if (this.active && !this.groqApiKey) {
          setTimeout(() => {
            if (this.active && !this.groqApiKey && this.browserSpeechRecognizer) {
              try {
                this.browserSpeechRecognizer.start();
              } catch {}
            }
          }, 300);
        }
      };

      this.browserSpeechRecognizer.start();
      console.log("[OiU Audio Engine] Browser Web Speech API fallback active.");
    } catch (e) {
      console.log("[OiU Audio Engine] Browser Web Speech init note:", e);
    }
  }

  public stop() {
    this.active = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.remoteScanInterval) {
      clearInterval(this.remoteScanInterval);
      this.remoteScanInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {}
      this.mediaRecorder = null;
    }

    if (this.browserSpeechRecognizer) {
      try {
        this.browserSpeechRecognizer.stop();
      } catch {}
      this.browserSpeechRecognizer = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    this.analyser = null;
    this.mixedStreamDestination = null;
    this.recordedChunks = [];
    this.isSpeaking = false;
    this.options?.onStatusChange?.("idle");
    console.log("[OiU Audio Engine] Pure audio engine stopped cleanly.");
  }
}

// Global instance
export const pureAudioEngine = new PureAudioEngine();

