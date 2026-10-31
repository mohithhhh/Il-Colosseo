import { useState, useRef, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WORD_INTERVAL_MS = 60;
const ROUNDS = 3;

// ── AudioContext (singleton) ──
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

async function playAudio(base64, text, agent) {
  if (!base64) return speakText(text, agent);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ctx = getAudioCtx();
    const buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = resolve;
      source.start();
    });
  } catch (e) {
    console.warn("[TTS] Audio decode failed, falling back to Web Speech", e);
    return speakText(text, agent);
  }
}

const emptyAgent = () => ({ text: "", displayText: "", score: 0, research: null, sources: [] });

// Merge Gemini grounding citations into the Tavily research sources list, deduping by url.
const mergeSources = (existing, citations) => {
  if (!citations || citations.length === 0) return existing;
  const seen = new Set((existing || []).map((s) => s.url));
  const fresh = citations.filter((c) => c.url && !seen.has(c.url));
  return [...(existing || []), ...fresh];
};

const initialState = () => ({
  status: "idle",           // idle | running | waiting | complete
  pendingAction: null,      // null | 2 | 3 | "judge"
  rounds: [],
  judge: { text: "", displayText: "", winner: null },
  reflections: {
    PRO: { text: "", displayText: "" },
    CON: { text: "", displayText: "" },
  },
  warnings: [],
  artifactPath: null,
  curveball: null,
  voiceDraft: "",
  awaitingCurveball: false,
  isListening: false,
  error: null,
  humanSide: null,          // null | "PRO" | "CON" — Human vs AI mode
  awaitingHuman: false,
  scorecard: null,          // { PRO: {criterion: 0-10}, CON: {...} }
  commonGround: null,       // { statement, disputed, objections }
  coach: null,              // { strengths, improve, missed_rebuttal, champion_rewrite }
});

// ── Web Speech API (fallback) ──
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
}

const VOICE_CFG = {
  PRO:   { rate: 0.92, pitch: 1.00 },
  CON:   { rate: 0.88, pitch: 0.85 },
  JUDGE: { rate: 0.90, pitch: 1.12 },
};

// Male voice name pools — first match wins
const MALE_VOICES_PRO  = ["Alex", "Daniel", "David", "Google US English", "Aaron", "Arthur", "Oliver", "Tom", "Gordon", "Guy", "Tony"];
const MALE_VOICES_CON  = ["Fred", "Mark", "Ralph", "Rishi", "Junior", "Bruce", "Richard", "Thomas", "Lee", "James"];
const FEMALE_VOICES    = ["Samantha", "Hazel", "Victoria", "Karen", "Aria", "Zira", "Susan", "Moira", "Jenny", "Ana"];

function pickVoice(agent) {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const en = voices.filter((v) => v.lang.startsWith("en"));
  if (!en.length) return null;

  const find = (pool) => en.find((v) => pool.some((n) => v.name.includes(n)));

  if (agent === "PRO") return find(MALE_VOICES_PRO) ?? en[0];
  if (agent === "CON") return find(MALE_VOICES_CON) ?? find(MALE_VOICES_PRO) ?? (en.length > 1 ? en[1] : en[0]);
  // JUDGE: prefer female
  return find(FEMALE_VOICES) ?? (en.length > 2 ? en[en.length - 1] : en[0]);
}

function speakText(text, agent) {
  const clean = text.replace(/•/g, "").replace(/\n+/g, ". ").trim();
  return new Promise((resolve) => {
    if (!clean || !window.speechSynthesis) { resolve(); return; }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      const cfg = VOICE_CFG[agent] ?? VOICE_CFG.PRO;
      utterance.rate = cfg.rate;
      utterance.pitch = cfg.pitch;
      utterance.volume = 1.0;
      const voice = pickVoice(agent);
      if (voice) utterance.voice = voice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    } catch { resolve(); }
  });
}

function streamWords(fullText, setter, intervalMs = WORD_INTERVAL_MS) {
  return new Promise((resolve) => {
    const words = fullText.split(" ").filter(Boolean);
    if (!words.length) { resolve(); return; }
    let idx = 0;
    const id = setInterval(() => {
      idx++;
      setter(words.slice(0, idx).join(" "));
      if (idx >= words.length) { clearInterval(id); resolve(); }
    }, intervalMs);
  });
}

function updateRoundAgent(rounds, roundNum, agentKey, updates) {
  return rounds.map((r) =>
    r.round === roundNum
      ? { ...r, [agentKey]: { ...r[agentKey], ...updates } }
      : r
  );
}

export function useDebate() {
  const [state, setState] = useState(initialState());
  const abortRef = useRef(null);
  const topicRef = useRef("");
  const historyRef = useRef([]);
  const researchLogRef = useRef([]);
  const topicMetaRef = useRef({});
  const curveballRef = useRef(null);
  const recognitionRef = useRef(null);
  const pendingActionRef = useRef(null);
  const languageRef = useRef("en");
  const humanSideRef = useRef(null);
  const awaitingHumanRef = useRef(false);
  const currentRoundRef = useRef(1);

  // Process a single parsed SSE event
  async function handleEvent(event) {
    const { type, agent } = event;
    const agentKey = agent?.toUpperCase();

    if (type === "warning") {
      setState((s) => ({ ...s, warnings: [...s.warnings, event.message] }));
      return;
    }

    if (type === "artifact_saved") {
      setState((s) => ({ ...s, artifactPath: event.filepath }));
      return;
    }

    if (type === "awaiting_curveball") {
      // In Human vs AI the user is already in the ring — skip the audience pause.
      if (!humanSideRef.current) setState((s) => ({ ...s, awaitingCurveball: true }));
      return;
    }

    if (type === "awaiting_human") {
      historyRef.current = event.history;
      researchLogRef.current = event.research_log;
      if (event.topic_meta) topicMetaRef.current = event.topic_meta;
      awaitingHumanRef.current = true;
      setState((s) => ({ ...s, awaitingHuman: true }));
      return;
    }

    if (type === "scorecard") {
      setState((s) => ({ ...s, scorecard: event.scores }));
      return;
    }

    if (type === "common_ground") {
      const { statement, disputed, objections } = event;
      setState((s) => ({ ...s, commonGround: { statement, disputed, objections } }));
      return;
    }

    if (type === "coach") {
      setState((s) => ({ ...s, coach: event }));
      return;
    }

    if (type === "researching") {
      const { round, queries, sources, wikipedia_anchor, claims } = event;
      setState((s) => {
        const exists = s.rounds.some((r) => r.round === round);
        if (exists) {
          return {
            ...s,
            rounds: updateRoundAgent(s.rounds, round, agentKey, {
              research: { queries, sources, wikipedia_anchor, claims },
              sources,
            }),
          };
        }
        const newRound = { round, PRO: emptyAgent(), CON: emptyAgent() };
        newRound[agentKey] = { ...newRound[agentKey], research: { queries, sources, wikipedia_anchor, claims }, sources };
        return { ...s, rounds: [...s.rounds, newRound] };
      });
      return;
    }

    if (type === "speech") {
      const { round, text, audio, score, winner, citations } = event;
      const analysis = { quotes: event.quotes ?? [], flags: event.flags ?? [], human: !!event.human };

      // The human's own speech: show it at once, don't read it back to them.
      if (event.human) {
        setState((s) => {
          const update = { text, displayText: text, score, research: null, sources: [], ...analysis };
          const exists = s.rounds.some((r) => r.round === round);
          if (exists) return { ...s, awaitingHuman: false, rounds: updateRoundAgent(s.rounds, round, agentKey, update) };
          const newRound = { round, PRO: emptyAgent(), CON: emptyAgent() };
          newRound[agentKey] = { ...newRound[agentKey], ...update };
          return { ...s, awaitingHuman: false, rounds: [...s.rounds, newRound] };
        });
        return;
      }

      if (agentKey === "JUDGE") {
        setState((s) => ({ ...s, judge: { text, displayText: "", winner, citations: citations ?? [] } }));
        await Promise.all([
          streamWords(text, (display) =>
            setState((s) => ({ ...s, judge: { ...s.judge, displayText: display } }))
          ),
          playAudio(audio, text, "JUDGE"),
        ]);
      } else {
        setState((s) => {
          const exists = s.rounds.some((r) => r.round === round);
          if (exists) {
            const prevAgent = s.rounds.find((r) => r.round === round)[agentKey];
            return {
              ...s,
              rounds: updateRoundAgent(s.rounds, round, agentKey, {
                text,
                displayText: "",
                score: score ?? prevAgent.score,
                sources: mergeSources(prevAgent.sources, citations),
                ...analysis,
              }),
            };
          }
          const newRound = { round, PRO: emptyAgent(), CON: emptyAgent() };
          newRound[agentKey] = { text, displayText: "", score: score ?? 0, research: null, sources: mergeSources([], citations), ...analysis };
          return { ...s, rounds: [...s.rounds, newRound] };
        });
        await Promise.all([
          streamWords(text, (display) =>
            setState((s) => ({
              ...s,
              rounds: updateRoundAgent(s.rounds, round, agentKey, { displayText: display }),
            }))
          ),
          playAudio(audio, text, agentKey),
        ]);
        setState((s) => ({
          ...s,
          rounds: updateRoundAgent(s.rounds, round, agentKey, { research: null }),
        }));
      }
      return;
    }

    if (type === "reflection") {
      const { text, audio } = event;
      setState((s) => ({
        ...s,
        reflections: { ...s.reflections, [agentKey]: { text, displayText: "" } },
      }));
      await Promise.all([
        streamWords(text, (display) =>
          setState((s) => ({
            ...s,
            reflections: {
              ...s.reflections,
              [agentKey]: { ...s.reflections[agentKey], displayText: display },
            },
          }))
        ),
        playAudio(audio, text, agentKey),
      ]);
      return;
    }

    if (type === "round_complete") {
      historyRef.current = event.history;
      researchLogRef.current = event.research_log;
      if (event.topic_meta) topicMetaRef.current = event.topic_meta;
    }
  }

  async function streamEndpoint(url, body, signal) {
    const response = await fetch(`${API_URL}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (response.status === 429) throw new Error("The arena is busy — too many debates from your network. Try again in a while.");
    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") return;

        let event;
        try { event = JSON.parse(raw); } catch { continue; }

        await handleEvent(event);
      }
    }
  }

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    const recognition = new SpeechRecognition();
    // A human's whole turn is longer than one breath; a curveball is one sentence.
    recognition.continuous = !!humanSideRef.current;
    recognition.interimResults = true;
    recognition.lang = languageRef.current === "en" ? "en-US" : languageRef.current;

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
      setState((s) => ({ ...s, voiceDraft: transcript }));
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setState((s) => ({ ...s, isListening: false }));
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setState((s) => ({ ...s, isListening: false }));
    };

    recognitionRef.current = recognition;
    recognition.start();
    setState((s) => ({ ...s, isListening: true }));
  }, []);

  const submitCurveball = useCallback((text) => {
    const trimmed = text.trim().slice(0, 280);
    if (!trimmed) return;
    curveballRef.current = trimmed;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setState((s) => ({
      ...s,
      curveball: trimmed,
      awaitingCurveball: false,
      voiceDraft: "",
      isListening: false,
    }));
  }, []);

  function freshController() {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try { getAudioCtx().resume(); } catch (e) { /* unsupported */ }
    return controller;
  }

  // Run (or resume, after a human turn) one round, then queue the next action. If the
  // server pauses for the human's speech, nothing is queued until submitHumanSpeech.
  async function runRound(roundNum, signal, humanSpeech = null) {
    currentRoundRef.current = roundNum;
    awaitingHumanRef.current = false;
    await streamEndpoint(
      "/debate/round",
      {
        topic: topicRef.current,
        round_num: roundNum,
        history: historyRef.current,
        research_log: researchLogRef.current,
        topic_meta: topicMetaRef.current,
        curveball: roundNum === 3 ? curveballRef.current : null,
        language: languageRef.current,
        human_side: humanSideRef.current,
        human_speech: humanSpeech,
      },
      signal,
    );
    if (awaitingHumanRef.current) {
      setState((s) => ({ ...s, status: "waiting", pendingAction: null }));
      return;
    }
    const nextAction = roundNum < ROUNDS ? roundNum + 1 : "judge";
    pendingActionRef.current = nextAction;
    setState((s) => ({ ...s, status: "waiting", pendingAction: nextAction }));
  }

  const fail = (err) => {
    if (err.name === "AbortError") return;
    setState((s) => ({ ...s, status: "idle", error: err.message }));
  };

  const start = useCallback(async (topic, language = "en", humanSide = null) => {
    const controller = freshController();

    topicRef.current = topic;
    historyRef.current = [];
    researchLogRef.current = [];
    topicMetaRef.current = {};
    curveballRef.current = null;
    pendingActionRef.current = null;
    languageRef.current = language;
    humanSideRef.current = humanSide;

    setState({ ...initialState(), status: "running", humanSide });

    try {
      await runRound(1, controller.signal);
    } catch (err) {
      fail(err);
    }
  }, []);

  const proceed = useCallback(async () => {
    const action = pendingActionRef.current;
    if (!action) return;
    const controller = freshController();

    pendingActionRef.current = null;
    setState((s) => ({ ...s, status: "running", pendingAction: null }));

    try {
      if (action === "judge") {
        await streamEndpoint(
          "/debate/judge",
          {
            topic: topicRef.current,
            history: historyRef.current,
            research_log: researchLogRef.current,
            topic_meta: topicMetaRef.current,
            curveball: curveballRef.current,
            language: languageRef.current,
            human_side: humanSideRef.current,
          },
          controller.signal,
        );
        setState((s) => ({ ...s, status: "complete" }));
      } else {
        await runRound(action, controller.signal);
      }
    } catch (err) {
      fail(err);
    }
  }, []);

  const submitHumanSpeech = useCallback(async (text) => {
    const trimmed = text.trim().slice(0, 1500);
    if (!trimmed || !awaitingHumanRef.current) return;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }
    const controller = freshController();
    setState((s) => ({ ...s, status: "running", voiceDraft: "", isListening: false }));
    try {
      await runRound(currentRoundRef.current, controller.signal, trimmed);
    } catch (err) {
      fail(err);
    }
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    window.speechSynthesis?.cancel();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    pendingActionRef.current = null;
    topicRef.current = "";
    historyRef.current = [];
    researchLogRef.current = [];
    topicMetaRef.current = {};
    curveballRef.current = null;
    languageRef.current = "en";
    humanSideRef.current = null;
    awaitingHumanRef.current = false;
    setState(initialState());
  }, []);

  return { state, start, proceed, reset, startListening, submitCurveball, submitHumanSpeech };
}
