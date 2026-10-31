# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Il Colosseo — a multi-agent debate arena. Two Gemini agents (PRO "Maximus", CON "Nexus") debate a topic over 3 rounds with live web research, then a Judge ("Arbitrus") gives a verdict. Python FastAPI backend (`backend/`) + React 19/Vite/Tailwind frontend (`frontend/`). There is no root `package.json`; each side is run from its own directory.

## Commands

Backend (from `backend/`):
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Frontend (from `frontend/`): `npm install`, `npm run dev` (http://localhost:5173), `npm run build`, `npm run lint`.

There is no test suite. `GET /health` is the health check used by Render/Railway.

Env vars are loaded with `load_dotenv(find_dotenv())`, so a `.env` in `backend/` or the repo root works. Required: `GEMINI_API_KEY`, `TAVILY_API_KEY`. Everything else (Fish Audio, Sarvam, Pinecone, feature flags `SPEECH_EVAL_ENABLED`, `DEEP_RESEARCH_ENABLED`, `GROUNDING_ENABLED`, `VECTOR_MEMORY_ENABLED`, `LIVE_VOICE_ENABLED`) is optional and degrades gracefully. The frontend reads `VITE_API_URL` (defaults to `http://localhost:8000`).

Deploy: frontend → Vercel (`vercel.json` builds `frontend/`, SPA rewrite); backend → Render (`render.yaml`) or Railway (`backend/railway.toml`, `Procfile`).

## Architecture

**The backend is stateless; the client carries debate state.** `POST /debate/round` and `POST /debate/judge` stream SSE (`data: {json}\n\n`, terminated by `data: [DONE]`). Each `round_complete` event returns the updated `history`, `research_log`, and `topic_meta`, which `frontend/src/hooks/useDebate.js` stores and POSTs back on the next request. Topic classification (`classify_topic`) runs only on round 1; its output lives in `topic_meta` for later rounds. When adding per-debate data, thread it through `topic_meta` / `round_complete` rather than server-side session state.

**Per-agent turn pipeline** (`run_round` in `backend/main.py`, PRO then CON; CON sees PRO's fresh speech and sources):
1. Query generation (`query_generator.py`) → parallel Tavily searches (`research.py`) → dedupe.
2. In parallel: integrity gate (`integrity_gate.py`, may retry with a broad query or emit a `warning` event), claim extraction, full-article fetch of the top source.
3. `argue()` in `agents.py` builds the prompt from sources, `[BACKGROUND]` Wikipedia anchor, `[EXTRACTED CLAIMS]`, vector-memory precedent, curveball, and language directive.
4. `evaluate_speech` (`speech_eval.py`) — one regeneration with `_RETRY_INSTRUCTION` on failure.
5. `tts.synthesize` → base64 audio in the `speech` event.

After round 2 the server emits `awaiting_curveball`; the audience's text (clamped to 280 chars by `_clean_curveball`) is sent with round 3 and the judge request. `run_judge` emits the verdict, two reflections, writes the JSON artifact (`artifact_writer.py` → `debates/`), then indexes into Pinecone.

**All Gemini calls go through `gemini_client.generate()`**, which handles the primary → fallback model switch on 429 and optional Google Search grounding (`google_search_tool` / `extract_citations`). Don't instantiate `genai` clients elsewhere; model IDs live only in `gemini_client.py` (and `live.py` for the Live API model). `agents._generate_with_citations` tries grounded generation first and silently falls back to ungrounded.

**Outbound HTTP to Tavily / Wikipedia / Fish / Sarvam goes through the shared client in `http_client.py`** (60s keepalive, per-request timeouts) — don't open a fresh `httpx.AsyncClient` per call; the TLS handshake costs ~0.5s on the critical path. Independent work inside a turn is overlapped on purpose (TTS runs while the speech eval runs; judge TTS and both reflections run concurrently; Pinecone indexing is backgrounded and its lookup is capped at 2.5s) — keep new steps off the serial path unless they truly depend on the previous result.

**Fail-open convention.** Auxiliary modules (classifier, integrity gate, speech eval, claim extraction, vector memory, TTS, grounding) catch their own errors and return a neutral result so a debate never breaks because an enhancer failed. `run_round` uses `asyncio.gather(..., return_exceptions=True)` and substitutes defaults. Keep new enhancers consistent with this.

**Multilingual.** `language` (`en` or a Sarvam code like `hi-IN`) flows request → `argue`/`judge`/`reflect` (appends a language directive) → `tts.synthesize` (English → Fish Audio; otherwise Sarvam Bulbul). The judge's `Winner: PRO|CON|TIE` line must stay in English because it's parsed.

**Vector memory** (`vector_store.py`): Gemini embeddings (768-d) in a lazily-created Pinecone index; round 1 queries it in parallel with query generation and the result rides in `topic_meta["memory"]`.

**Live voice** (`live.py` + `@app.websocket("/live/{agent}")` in `main.py`): separate "Enter the Arena" feature, independent of the SSE debate flow. The server relays base64 PCM16 (16 kHz in, 24 kHz out) between the browser (`frontend/src/hooks/useLiveVoice.js`) and a Gemini Live session; the message protocol is documented in the endpoint's docstring.

## Frontend

`frontend/src/App.jsx` composes the UI; `hooks/useDebate.js` owns SSE parsing, state, and audio playback (AudioContext, with Web Speech API fallback when `audio` is empty). `components/` are presentational.

## Gotchas

- `README.md` is partly stale: it omits Pinecone memory, Live voice and grounding, and lists the fallback model as `gemini-2.5-flash-lite` (code uses `gemini-flash-lite-latest`). Trust the code.
- `backend/debates/*.json` artifacts are written to a path relative to the process CWD (so run uvicorn from `backend/`); some sample artifacts are checked in.
- Primary model is `gemini-3.1-flash-lite-preview` (`gemini_client.py`). It's a preview ID, so if every call starts failing, check whether it was retired before debugging elsewhere.
- `frontend/.env` is tracked in git and `frontend/.gitignore` doesn't ignore it. Keep only `VITE_*` values there; secrets go in `backend/.env`.
- CORS is wide open (`allow_origins=["*"]`).
