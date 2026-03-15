# Il Colosseo — Multi-Agent Debate Arena

A real-time AI debate arena where two agents argue PRO and CON on any topic across 3 rounds, with live web research, voice narration, and a judge that delivers a final verdict.

## Stack

- **Frontend**: React 19 + Vite + TailwindCSS, Liquid Glass design (Cinzel / Inter fonts)
- **Backend**: FastAPI + Gemini AI + Tavily search + Fish Audio TTS, SSE streaming
- **TTS**: Fish Audio S2 Pro → Web Speech API (browser fallback)

## Agents

| Agent | Name | Role |
|---|---|---|
| PRO | Maximus | Argues in favour of the proposition |
| CON | Nexus | Argues against the proposition |
| Judge | — | Delivers verdict after Round 3 |

## Quality Layer

Four modules run automatically on every debate to improve argument quality and research depth:

| Module | Trigger | What it does |
|---|---|---|
| **Topic Classifier** | Once, round 1 | Classifies topic shape (`canonical`, `current-event`, `comparison`, `tricky`) and generates a `search_strategy`, `agent_instruction`, and `judge_instruction` that are injected into all downstream prompts |
| **Integrity Gate** | After every Tavily search (2× per round) | Checks source relevance — retries with a broader query if ≥3 sources are weak, or shows a warning banner if signal is low |
| **Speech Evaluator** | After every agent speech (2× per round) | Checks length, evidence citation, and opponent rebuttal — triggers one regeneration with a stricter prompt if the speech fails. Disable with `SPEECH_EVAL_ENABLED=false` |
| **Artifact Writer** | Once, after judge phase | Saves the full debate to `debates/{topic}_{timestamp}.json` — speeches, sources, verdict, reflections |

## Setup

### 1. Environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key

# Optional — Fish Audio TTS (falls back to Web Speech API if omitted or balance is zero)
FISH_AUDIO_API=your_fish_audio_key
FISH_AUDIO_VOICE_PRO=voice_reference_id
FISH_AUDIO_VOICE_CON=voice_reference_id
FISH_AUDIO_VOICE_JUDGE=voice_reference_id

# Optional — set to false to skip speech quality checks (faster, lower latency)
SPEECH_EVAL_ENABLED=true
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

1. Type a debate topic and click **Begin**.
2. Watch PRO (Maximus) and CON (Nexus) argue — each agent researches the web before speaking.
3. After each round a **Start Round N** button appears — click to continue.
4. After Round 3 a **Judge** button appears — click to see the verdict and post-debate reflections.
5. Click **Reset** to start a new debate.
6. Completed debates are saved to `backend/debates/` automatically.

## API

| Endpoint | Method | Description |
|---|---|---|
| `POST /debate/round` | Stream | One debate round (PRO + CON with research) |
| `POST /debate/judge` | Stream | Judge verdict + agent reflections + artifact save |
| `GET /health` | JSON | Health check |

**`/debate/round` request body**
```json
{ "topic": "string", "round_num": 1, "history": [], "research_log": [], "topic_meta": {} }
```
Emits `warning` (optional), `researching`, `speech`, and `round_complete` (with updated `history`, `research_log`, `topic_meta`) SSE events, then `[DONE]`.

**`/debate/judge` request body**
```json
{ "topic": "string", "history": [...], "research_log": [...], "topic_meta": {...} }
```
Emits `speech` (JUDGE), `reflection` (×2), and `artifact_saved` SSE events, then `[DONE]`.

## SSE Event Types

| Event | Description |
|---|---|
| `researching` | Agent is querying Tavily — includes `query` and `sources` |
| `speech` | Agent speech text + base64 audio + score |
| `round_complete` | End of round — carries `history`, `research_log`, `topic_meta` for next request |
| `reflection` | Post-verdict agent reflection |
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
│   ├── research.py          Tavily web search (5 results per query)
│   ├── query_generator.py   Focused search query generation per agent
│   ├── classifier.py        Topic shape classifier (canonical/current-event/comparison/tricky)
│   ├── integrity_gate.py    Source relevance checker with retry logic
│   ├── speech_eval.py       Speech quality checker with regeneration on failure
│   ├── artifact_writer.py   Saves completed debates to debates/ as JSON
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
    │       ├── ResearchPanel.jsx  Live research indicator
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

| Phase | Min requests | Max (with retries) |
|---|---|---|
| Round 1 | 11 (incl. classifier) | 15 |
| Round 2 or 3 | 10 | 14 |
| Judge phase | 6 | 6 |
| **Full debate** | **37** | **49** |
