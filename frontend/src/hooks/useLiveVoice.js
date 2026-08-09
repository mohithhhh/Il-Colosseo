import { useState, useRef, useCallback, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_URL = API_URL.replace(/^http/, "ws");

// Gemini Live always speaks back at 24kHz; the mic is downsampled to this on the way in.
const TARGET_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;
const CAPTURE_BUFFER_SIZE = 4096;

const initialState = () => ({
  status: "idle",        // idle | connecting | live | ended | error
  agent: null,            // PRO | CON | JUDGE
  transcripts: [],        // [{ role: "user" | "agent", text, live }]
  isAgentSpeaking: false,
  error: null,
});

// ── PCM <-> base64 helpers ──
// Naive decimation, not a proper low-pass resample — fine for voice-conversation quality.
function downsampleFloat32(input, inputRate, outputRate) {
  if (outputRate === inputRate) return input;
  const ratio = inputRate / outputRate;
  const outLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) output[i] = input[Math.floor(i * ratio)];
  return output;
}

function floatTo16BitPCM(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function int16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToFloat32(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
  return float32;
}

// Real-time, bidirectional voice conversation with a debate agent over /live/{agent} —
// separate from the scripted SSE debate flow in useDebate.js. Captures mic audio, streams
// it to Gemini via the FastAPI relay, and plays back the agent's spoken reply as it arrives.
export function useLiveVoice() {
  const [state, setState] = useState(initialState());
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const micSourceRef = useRef(null);
  const micProcessorRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef([]);

  const getCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const stopPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try { src.stop(); } catch { /* already stopped */ }
    });
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
  }, []);

  // Schedules chunks back-to-back on the audio timeline so playback stays gapless.
  const playChunk = useCallback((base64) => {
    const ctx = getCtx();
    const float32 = base64ToFloat32(base64);
    const buffer = ctx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  }, []);

  // Transcripts stream in as small word/token fragments — merge consecutive same-role
  // fragments into one running line, closing it out when the role switches.
  const appendTranscript = useCallback((role, text) => {
    setState((s) => {
      const transcripts = [...s.transcripts];
      const last = transcripts[transcripts.length - 1];
      if (last && last.role === role && last.live) {
        transcripts[transcripts.length - 1] = { ...last, text: last.text + text };
      } else {
        if (last && last.live) transcripts[transcripts.length - 1] = { ...last, live: false };
        transcripts.push({ role, text, live: true });
      }
      return { ...s, transcripts };
    });
  }, []);

  const closeOpenLine = useCallback(() => {
    setState((s) => {
      const last = s.transcripts[s.transcripts.length - 1];
      if (!last || !last.live) return s;
      return {
        ...s,
        transcripts: [...s.transcripts.slice(0, -1), { ...last, live: false }],
      };
    });
  }, []);

  const stopMic = useCallback(() => {
    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current.onaudioprocess = null;
      micProcessorRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  // ScriptProcessorNode is deprecated but simple and universally supported — no AudioWorklet
  // module/build wiring needed for a single capture pipeline like this.
  const startMic = useCallback(async (ws) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
    const ctx = getCtx();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
    micSourceRef.current = source;
    micProcessorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const down = downsampleFloat32(input, ctx.sampleRate, TARGET_SAMPLE_RATE);
      const int16 = floatTo16BitPCM(down);
      ws.send(JSON.stringify({ type: "audio", data: int16ToBase64(int16) }));
    };

    source.connect(processor);
    // ScriptProcessorNode only fires once connected to a destination — route through a
    // silent gain node so the raw mic signal is never actually heard.
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    processor.connect(silentGain);
    silentGain.connect(ctx.destination);
  }, []);

  const connect = useCallback((agent, topic) => {
    if (wsRef.current) return;
    setState({ ...initialState(), status: "connecting", agent });

    const url = `${WS_URL}/live/${agent}${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = async (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }

      switch (msg.type) {
        case "ready":
          try {
            await startMic(ws);
            setState((s) => ({ ...s, status: "live" }));
          } catch {
            setState((s) => ({ ...s, status: "error", error: "Microphone access denied." }));
            ws.close();
          }
          break;
        case "audio":
          setState((s) => ({ ...s, isAgentSpeaking: true }));
          playChunk(msg.data);
          break;
        case "transcript":
          appendTranscript(msg.role, msg.text);
          break;
        case "interrupted":
          stopPlayback();
          closeOpenLine();
          setState((s) => ({ ...s, isAgentSpeaking: false }));
          break;
        case "turn_complete":
          closeOpenLine();
          setState((s) => ({ ...s, isAgentSpeaking: false }));
          break;
        case "error":
          setState((s) => ({ ...s, status: "error", error: msg.message }));
          break;
        default:
          break;
      }
    };

    ws.onerror = () => {
      setState((s) => ({ ...s, status: "error", error: "Connection to the arena failed." }));
    };

    ws.onclose = () => {
      stopMic();
      stopPlayback();
      wsRef.current = null;
      setState((s) => (s.status === "error" ? s : { ...s, status: "ended" }));
    };
  }, [startMic, stopMic, playChunk, stopPlayback, appendTranscript, closeOpenLine]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: "stop" })); } catch { /* closing anyway */ }
      }
      ws.close();
      wsRef.current = null;
    }
    stopMic();
    stopPlayback();
    setState(initialState());
  }, [stopMic, stopPlayback]);

  // Safety net — release mic/audio resources if the component unmounts mid-session.
  useEffect(() => () => disconnect(), [disconnect]);

  return { state, connect, disconnect };
}
