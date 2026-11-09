import { ExtensionMessage } from "@oiu/shared";

console.log("[OiU Offscreen Document] Initialized in safe streaming mode.");

let activeStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let mediaRecorder: MediaRecorder | null = null;
let socket: WebSocket | null = null;

function connectRealtimeSocket(sessionId: string) {
  try {
    if (socket && socket.readyState === WebSocket.OPEN) return;
    socket = new WebSocket(`ws://localhost:3001/realtime?sessionId=${sessionId}`);

    socket.onopen = () => {
      console.log("[OiU Offscreen] Connected to local realtime voice gateway.");
    };

    socket.onerror = (err) => {
      // Backend may not be running yet - perfectly safe, fallback to captions
      console.log("[OiU Offscreen] Realtime socket note (captions active as primary):", err);
    };

    socket.onclose = () => {
      console.log("[OiU Offscreen] Realtime socket closed.");
    };
  } catch (err) {
    console.log("[OiU Offscreen] Socket connection note:", err);
  }
}

async function startCapture(streamId: string, sessionId: string) {
  try {
    console.log("[OiU Offscreen] Starting safe audio capture with streamId:", streamId);

    // Stop any existing session cleanly
    stopCapture();

    // 1. Obtain MediaStream from Chrome tab
    activeStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      } as any,
      video: false,
    });

    console.log("[OiU Offscreen] Got MediaStream successfully, tracks:", activeStream.getAudioTracks().length);

    // 2. Route audio to AudioContext destination so user STILL HEARS the meeting
    audioContext = new AudioContext();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(activeStream);
    // Connect to destination so user hears meeting
    source.connect(audioContext.destination);

    // 3. Connect to local voice gateway for transcription
    connectRealtimeSocket(sessionId);

    // 4. Set up MediaRecorder for 2-second audio chunks
    if (typeof MediaRecorder !== "undefined") {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      mediaRecorder = new MediaRecorder(activeStream, { mimeType });

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0 && socket && socket.readyState === WebSocket.OPEN) {
          const buffer = await event.data.arrayBuffer();
          socket.send(buffer);
        }
      };

      // 2000ms timeslices: zero CPU spike, zero IPC overhead
      mediaRecorder.start(2000);
      console.log("[OiU Offscreen] MediaRecorder active (2s timeslice).");
    }

  } catch (err: any) {
    console.warn("[OiU Offscreen] Tab audio capture note (running in captions mode):", err?.message);
  }
}

function stopCapture() {
  console.log("[OiU Offscreen] Stopping capture and releasing media tracks.");

  if (mediaRecorder) {
    try {
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    } catch {}
    mediaRecorder = null;
  }

  if (socket) {
    try {
      socket.close();
    } catch {}
    socket = null;
  }

  if (activeStream) {
    try {
      activeStream.getTracks().forEach((track) => track.stop());
    } catch {}
    activeStream = null;
  }

  if (audioContext) {
    try {
      audioContext.close();
    } catch {}
    audioContext = null;
  }
}

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  switch (message.type) {
    case "OFFSCREEN_START_CAPTURE": {
      startCapture(message.payload.streamId, message.payload.sessionId || "live_meet");
      sendResponse({ success: true });
      break;
    }

    case "OFFSCREEN_STOP_CAPTURE": {
      stopCapture();
      sendResponse({ success: true });
      break;
    }
  }

  return false;
});
