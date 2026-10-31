# Il Colosseo — Multi-Agent Debate Arena

A real-time AI debate arena where two agents argue PRO (maximus) and CON (nexus) on any topic across 3 rounds, with live web research, voice narration, and a judge that delivers a final verdict.

https://ilcolosseo.vercel.app/

## Stack

- **Frontend**: React 19 + Vite + TailwindCSS, Liquid Glass design (Cinzel / Inter fonts)
- **Backend**: FastAPI + Gemini AI + Tavily search + Fish Audio / Sarvam TTS, SSE streaming
- **TTS**: Fish Audio S2 Pro (English) or Sarvam Bulbul v3 (Indian languages) → Web Speech API (browser fallback)

## Agents

| Agent | Name | Role |
|---|---|---|
| PRO | Maximus | Argues in favour of the proposition |
| CON | Nexus | Argues against the proposition |
| Judge | Arbitrus | Delivers verdict after Round 3 |

## Quality Layer

Four modules run automatically on every debate to improve argument quality and research depth:

| Module | Trigger | What it does |
|---|---|---|
| **Topic Classifier** | Once, round 1 | Classifies topic shape (`canonical`, `current-event`, `comparison`, `tricky`) and generates a `search_strategy`, `agent_instruction`, and `judge_instruction` that are injected into all downstream prompts |
| **Integrity Gate** | After every Tavily search (2× per round) | Checks source relevance — retries with a broader query if ≥3 sources are weak, or shows a warning banner if signal is low |
| **Speech Evaluator** | After every agent speech (2× per round) | Checks length, evidence citation, and opponent rebuttal — triggers one regeneration with a stricter prompt if the speech fails. Disable with `SPEECH_EVAL_ENABLED=false` |
| **Artifact Writer** | Once, after judge phase | Saves the full debate to `debates/{topic}_{timestamp}.json` — speeches, sources, verdict, reflections |

## Deep Research Pipeline

Five research levels run on every agent turn, controlled by `DEEP_RESEARCH_ENABLED` (default: `true`):

| Level | What it does |
|---|---|
| **1 — Deep Tavily** | 10 results per query, `advanced` search depth, 400-char snippets |
| **2 — Multi-query** | Gemini generates 3 distinct queries per agent (empirical evidence / statistics / expert opinion for PRO; adversarial angles for CON) |
| **3 — Full article fetch** | Top source URL fetched with httpx, HTML stripped, first 2 500 chars injected as `[FULL ARTICLE]` into the agent prompt |
| **4 — Wikipedia anchor** | Wikipedia REST summary fetched once at round 1 and cached in `topic_meta`; injected as `[BACKGROUND]` ground-truth block in every agent prompt |
| **5 — Claim extraction** | Gemini Flash Lite extracts 5 verifiable claims from sources; injected as `[EXTRACTED CLAIMS]` backbone for the agent to cite |

Levels 2–5 are skipped when `DEEP_RESEARCH_ENABLED=false` (falls back to a single heuristic query per agent).

## Multilingual Debates

Pick a language on the landing page before starting a debate. English keeps the existing Gemini + Fish Audio pipeline untouched. Any of the 10 Indian languages below routes the *entire* debate — PRO, CON, and the Judge's verdict and reflections — through Gemini in that language, and switches TTS to Sarvam's Bulbul v3 model:

| Language | Code |
|---|---|
| Hindi | `hi-IN` |
| Tamil | `ta-IN` |
| Telugu | `te-IN` |
| Bengali | `bn-IN` |
| Kannada | `kn-IN` |
| Malayalam | `ml-IN` |
| Marathi | `mr-IN` |
| Gujarati | `gu-IN` |
| Punjabi | `pa-IN` |
| Odia | `od-IN` |

Requires `SARVAM_API_KEY`. Without it, non-English debates still run (Gemini argues in the chosen language) but TTS falls back to Web Speech API, whose voice quality for Indian languages varies by browser/OS.

## Audience Curveball

After Round 2 the arena pauses and opens a microphone + text input. The audience can issue a challenge that both agents must address in Round 3. Voice input is transcribed via the Web Speech API.

## Arena Intelligence

Built on recent research into AI debate, persuasion and deliberation (`backend/analysis.py`). Every module fails open.

| Feature | What it does |
|---|---|
| **Human vs AI** | Pick *Argue for* or *Argue against* on the landing page. The round pauses on your turn (voice or text, in any supported language) and the AI rebuts you with live research. After the verdict you get a **coach report**: what worked, what to work on, the rebuttal you missed, and your weakest point rewritten the way a champion would say it. |
| **Truth Mode** | A claim with a known answer (e.g. *"Bats are blind."*). You call it before the debate, watch PRO argue true and CON argue false, call it again, then see the answer. Per-viewer stats track whether the debate made you (and the judge) more accurate, after [Khan et al., *Debating with More Persuasive LLMs Leads to More Truthful Answers*](https://arxiv.org/abs/2402.06782). |
| **Verified quotes** | Debaters quote sources verbatim; each quote is string-matched against the fetched source text. ✓ means it appears in the source, ⚠ means it was not found in what was fetched. |
| **Manipulation Watch** | Flags persuasion that misleads without lying: cherry-picking, missing context, loaded framing, false balance, overgeneralization, unsupported claims. Shown as hints, not rulings. |
| **Scorecard** | Rubric scores 0–10 per side for evidence, rebuttal, logic, clarity and responsiveness, computed alongside the verdict. |
| **Common Ground** | Concordia, a mediator, drafts what both sides could endorse; each side objects; the statement is revised once. A critique-and-revise loop after DeepMind's Habermas Machine. |
| **Rate limiting** | Per-IP hourly cap on debate requests and live sessions, so the API keys can't be drained by a script. |

## Setup

### 1. Environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key

# Optional — Fish Audio TTS for English debates (falls back to Web Speech API if omitted or balance is zero)
FISH_AUDIO_API=your_fish_audio_key
FISH_AUDIO_VOICE_PRO=voice_reference_id
FISH_AUDIO_VOICE_CON=voice_reference_id
FISH_AUDIO_VOICE_JUDGE=voice_reference_id

# Optional — Sarvam Bulbul v3 TTS, used automatically for non-English debates
SARVAM_API_KEY=your_sarvam_api_key
SARVAM_VOICE_PRO=shubh
SARVAM_VOICE_CON=anand
SARVAM_VOICE_JUDGE=priya

# Optional — set to false to skip speech quality checks (faster, lower latency)
SPEECH_EVAL_ENABLED=true

# Optional — set to false to disable deep research pipeline (faster, fewer API calls)
DEEP_RESEARCH_ENABLED=true

# Optional — set to false to skip Manipulation Watch, scorecard, common ground and coach (fewer Gemini calls)
ANALYSIS_ENABLED=true

# Optional — debate requests per client IP per hour (a full debate is 4 requests, 7 in Human vs AI)
RATE_LIMIT_PER_HOUR=60

# Number of proxies in front of the backend (Render/Railway: 1). 0 trusts no X-Forwarded-For header.
TRUSTED_PROXY_HOPS=0
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

Optionally set `VITE_API_URL` in `frontend/.env` to point at a remote backend (defaults to `http://localhost:8000`).

## Usage

1. Type a debate topic, choose **Watch**, **Argue for** or **Argue against**, and click **Begin**. Or open **Truth Mode**.
2. Watch PRO (Maximus) and CON (Nexus) argue — each agent researches the web before speaking.
3. After each round a **Start Round N** button appears — click to continue.
4. After Round 2 an audience curveball prompt appears — submit a challenge via voice or text.
5. After Round 3 a **Judge** button appears — click to see Arbitrus's verdict and post-debate reflections.
6. Click **Reset** to start a new debate.
7. Completed debates are saved to `backend/debates/` automatically.

## API

| Endpoint | Method | Description |
|---|---|---|
| `POST /debate/round` | Stream | One debate round (PRO + CON with research) |
| `POST /debate/judge` | Stream | Judge verdict + agent reflections + artifact save |
| `GET /health` | JSON | Health check |

**`/debate/round` request body**
```json
{ "topic": "string", "round_num": 1, "history": [], "research_log": [], "topic_meta": {}, "curveball": null, "language": "en", "human_side": null, "human_speech": null }
```
Emits `warning` (optional), `researching`, `speech`, `round_complete` (with updated `history`, `research_log`, `topic_meta`), and `awaiting_curveball` (after round 2) SSE events, then `[DONE]`.

In Human vs AI (`human_side`: `"PRO"` or `"CON"`), the stream stops with `awaiting_human` when it reaches the human's turn. Re-send the same `round_num` with the returned state plus `human_speech`; sides that already spoke this round are skipped.

**`/debate/judge` request body**
```json
{ "topic": "string", "history": [...], "research_log": [...], "topic_meta": {...}, "curveball": null, "language": "en", "human_side": null }
```
Emits `speech` (JUDGE), `scorecard`, `reflection` (one per AI side), `common_ground`, `coach` (Human vs AI only) and `artifact_saved` SSE events, then `[DONE]`.

## SSE Event Types

| Event | Description |
|---|---|
| `researching` | Agent is querying Tavily — includes `queries` (list), `sources`, `wikipedia_anchor`, `claims` |
| `speech` | Agent speech text + base64 audio + score + `quotes` (verified or not) + `flags` (Manipulation Watch); `human: true` for the user's own speech |
| `round_complete` | End of round — carries `history`, `research_log`, `topic_meta` for next request |
| `awaiting_curveball` | Emitted after round 2 — UI opens audience challenge input |
| `awaiting_human` | Human vs AI: the human's turn — carries `history`, `research_log`, `topic_meta` to resume with |
| `reflection` | Post-verdict agent reflection |
| `scorecard` | Rubric scores per side |
| `common_ground` | Concordia's `statement`, `disputed` crux, and each side's `objections` to the first draft |
| `coach` | Human vs AI coach report |
| `warning` | Weak research signal detected — shown as dismissible banner |
| `artifact_saved` | Debate written to disk — includes `filepath` |

## Project structure

```
.
├── .env                     API keys (gitignored)
├── .env.example
├── backend/
│   ├── main.py              FastAPI app · /debate/round · /debate/judge
│   ├── agents.py            Gemini agent logic (PRO, CON, JUDGE, reflect)
│   ├── tts.py               Fish Audio S2 Pro synthesis
│   ├── research.py          Tavily search · wikipedia_anchor · fetch_top_source · extract_claims
│   ├── query_generator.py   3-query generation per agent via Gemini
│   ├── classifier.py        Topic shape classifier (canonical/current-event/comparison/tricky)
│   ├── integrity_gate.py    Source relevance checker with retry logic
│   ├── speech_eval.py       Speech quality checker with regeneration on failure
│   ├── artifact_writer.py   Saves completed debates to debates/ as JSON
│   ├── analysis.py          Verified quotes · Manipulation Watch · scorecard · common ground · coach
│   ├── check_debate_flow.py Offline check of the SSE flow (model calls stubbed)
│   ├── debates/             Saved debate artifacts (gitignored)
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── index.css
    │   ├── hooks/
    │   │   └── useDebate.js       State · SSE · AudioContext · Web Speech
    │   └── components/
    │       ├── TopicInput.jsx
    │       ├── RoundRow.jsx
    │       ├── AgentCard.jsx      Speech text · score · sources panel
    │       ├── ResearchPanel.jsx  Live research indicator (queries · Wikipedia badge · claims)
    │       ├── JudgePanel.jsx
    │       └── ReflectionCard.jsx
    ├── tailwind.config.js
    └── vite.config.js
```

## Models

| Purpose | Model |
|---|---|
| Primary | `gemini-3.1-flash-lite-preview` |
| Fallback (rate limit) | `gemini-2.5-flash-lite` |

## Requests per debate

With `DEEP_RESEARCH_ENABLED=true` (default):

| Phase | Tavily calls | Gemini calls | Total (min) |
|---|---|---|---|
| Round 1 | 6 (3 PRO + 3 CON) | 5 (classifier + 2 query-gen + 2 claim-extract) | 11 + classifier |
| Round 2 or 3 | 6 | 4 (2 query-gen + 2 claim-extract) | 10 |
| Judge phase | 0 | 6 (judge + 2 reflect + artifact) | 6 |
| **Full debate** | **18** | **19** | **~37** |

With `DEEP_RESEARCH_ENABLED=false`: 6 Tavily calls total (1 per agent per round).



