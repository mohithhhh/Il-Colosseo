import json
import base64
import asyncio
import os
from datetime import datetime
from typing import AsyncGenerator

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv, find_dotenv
from google.genai import types as genai_types

from agents import argue, judge, reflect
import research as research_module
from query_generator import generate_pro_queries, generate_con_queries
from tts import synthesize
from classifier import classify_topic
from integrity_gate import check_sources
from speech_eval import evaluate_speech
from artifact_writer import write_artifact
import vector_store
import live

load_dotenv(find_dotenv())

app = FastAPI(title="Debate Arena API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ROUNDS = 3
DEEP_RESEARCH = os.getenv("DEEP_RESEARCH_ENABLED", "true").lower() != "false"

_RETRY_INSTRUCTION = (
    "Your previous attempt was too short or too vague. "
    "This time: make it at least 4 sentences, cite a specific source by name, "
    "and directly name and refute the opponent's claim."
)


def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _clean_curveball(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = raw.strip()[:280]
    return cleaned or None


class RoundRequest(BaseModel):
    topic: str
    round_num: int
    history: list[dict] = []
    research_log: list[dict] = []
    topic_meta: dict = {}
    curveball: str | None = None
    language: str = "en"


class JudgeRequest(BaseModel):
    topic: str
    history: list[dict]
    research_log: list[dict] = []
    topic_meta: dict = {}
    curveball: str | None = None
    language: str = "en"


async def run_round(
    topic: str,
    round_num: int,
    history: list[dict],
    research_log: list[dict],
    topic_meta: dict,
    curveball: str | None = None,
    language: str = "en",
) -> AsyncGenerator[str, None]:
    scores = {
        "PRO": sum(1 for h in history if h["agent"] == "PRO"),
        "CON": sum(1 for h in history if h["agent"] == "CON"),
    }
    pro_speech_text = ""
    pro_sources: list[dict] = []
    search_strategy = topic_meta.get("search_strategy", "")
    agent_instruction = topic_meta.get("agent_instruction", "")
    wiki: str | None = topic_meta.get("wikipedia_anchor")
    memory: list[dict] = topic_meta.get("memory", [])

    for agent in ("PRO", "CON"):
        prior_speech = next(
            (h["text"] for h in reversed(history) if h["agent"] == ("CON" if agent == "PRO" else "PRO")),
            None,
        )

        # ── Generate queries (+ wikipedia_anchor + vector memory in parallel for round 1 PRO) ──
        if agent == "PRO":
            if round_num == 1 and DEEP_RESEARCH:
                queries, wiki, memory = await asyncio.gather(
                    generate_pro_queries(topic, history, topic_meta, curveball, round_num),
                    research_module.wikipedia_anchor(topic),
                    vector_store.query_memory(topic),
                )
                topic_meta = {**topic_meta, "wikipedia_anchor": wiki, "memory": memory}
            else:
                queries = await generate_pro_queries(topic, history, topic_meta, curveball, round_num)
        else:
            queries = await generate_con_queries(
                topic, history, topic_meta, pro_speech_text, pro_sources, curveball, round_num
            )

        # ── Parallel Tavily searches across all queries ──
        results_list = await asyncio.gather(
            *[research_module.search(q) for q in queries],
            return_exceptions=True,
        )
        sources = research_module.deduplicate([
            r
            for batch in results_list
            if not isinstance(batch, Exception)
            for r in batch
        ])[:15]

        # ── Parallel: integrity_gate + extract_claims + fetch_top_source ──
        first_url = sources[0]["url"] if sources else ""
        gate_result, claims, full_content = await asyncio.gather(
            check_sources(topic, sources, agent),
            research_module.extract_claims(topic, agent, sources, round_num),
            research_module.fetch_top_source(first_url),
            return_exceptions=True,
        )

        if isinstance(gate_result, Exception):
            gate_result = {"pass": True, "reason": "gate error"}
        if isinstance(claims, Exception):
            claims = None
        if isinstance(full_content, Exception):
            full_content = None

        # Handle integrity gate result
        if gate_result.get("retry_search"):
            broad_query = f"{topic[:80]} overview"
            sources = await research_module.search(broad_query)
            queries = [broad_query]
        elif not gate_result.get("pass", True) and "warning" in gate_result:
            yield sse_event({"type": "warning", "message": gate_result["warning"]})

        # Inject full article as first entry if available
        if full_content and sources:
            sources = [{
                "title": f"Full article — {sources[0]['title']}",
                "url": sources[0]["url"],
                "content": full_content,
                "is_full_article": True,
            }] + sources

        if agent == "PRO":
            pro_sources = sources

        research_log = research_log + [{
            "agent": agent,
            "round": round_num,
            "queries": queries,
            "sources": [s for s in sources[:15] if not s.get("is_full_article")],
            "wikipedia_anchor": wiki,
            "claims": claims,
        }]

        yield sse_event({
            "type": "researching",
            "agent": agent,
            "round": round_num,
            "queries": queries,
            "sources": [s for s in sources[:15] if not s.get("is_full_article")],
            "wikipedia_anchor": wiki,
            "claims": claims,
        })

        text, citations = await argue(
            agent, topic, round_num, history,
            research=sources,
            agent_instruction=agent_instruction,
            curveball=curveball,
            wikipedia_anchor=wiki,
            claims=claims,
            memory=memory,
            language=language,
        )

        # Speech eval — single retry on failure
        eval_result = await evaluate_speech(text, agent, round_num, prior_speech)
        if not eval_result.get("pass", True):
            text, citations = await argue(
                agent, topic, round_num, history,
                research=sources,
                agent_instruction=agent_instruction,
                retry_instruction=_RETRY_INSTRUCTION,
                curveball=curveball,
                wikipedia_anchor=wiki,
                claims=claims,
                memory=memory,
                language=language,
            )

        if agent == "PRO":
            pro_speech_text = text

        scores[agent] += 1
        history = history + [{"agent": agent, "round": round_num, "text": text}]

        audio_b64 = await synthesize(text, agent, language)
        yield sse_event({
            "type": "speech",
            "agent": agent,
            "round": round_num,
            "text": text,
            "audio": audio_b64,
            "score": scores[agent],
            "winner": None,
            "citations": citations,
        })

        await asyncio.sleep(0.1)

    yield sse_event({
        "type": "round_complete",
        "round": round_num,
        "history": history,
        "research_log": research_log,
        "topic_meta": topic_meta,
    })

    # Invite audience curveball after round 2
    if round_num == 2:
        yield sse_event({
            "type": "awaiting_curveball",
            "message": "The arena is open. Challenge the gladiators.",
        })

    yield "data: [DONE]\n\n"


async def run_judge(
    topic: str,
    history: list[dict],
    research_log: list[dict],
    topic_meta: dict,
    curveball: str | None = None,
    language: str = "en",
) -> AsyncGenerator[str, None]:
    verdict_text, winner, citations = await judge(
        topic, history, research_log,
        judge_instruction=topic_meta.get("judge_instruction", ""),
        curveball=curveball,
        memory=topic_meta.get("memory", []),
        language=language,
    )

    judge_audio = await synthesize(verdict_text, "JUDGE", language)
    yield sse_event({
        "type": "speech",
        "agent": "JUDGE",
        "round": ROUNDS,
        "text": verdict_text,
        "audio": judge_audio,
        "score": None,
        "winner": winner,
        "citations": citations,
    })

    reflections_collected: dict[str, str] = {}
    for agent in ("PRO", "CON"):
        reflection_text = await reflect(agent, topic, history, verdict_text, language=language)
        reflections_collected[agent.lower()] = reflection_text
        reflection_audio = await synthesize(reflection_text, agent, language)
        yield sse_event({
            "type": "reflection",
            "agent": agent,
            "text": reflection_text,
            "audio": reflection_audio,
        })

    # Assemble and write artifact
    rounds_dict: dict[int, dict] = {}
    for entry in history:
        rn = entry["round"]
        ag = entry["agent"].lower()
        if rn not in rounds_dict:
            rounds_dict[rn] = {
                "round_num": rn,
                "pro": {"speech": "", "queries": [], "sources": [], "wikipedia_anchor": None, "claims": None},
                "con": {"speech": "", "queries": [], "sources": [], "wikipedia_anchor": None, "claims": None},
            }
        rounds_dict[rn][ag]["speech"] = entry["text"]
    for entry in research_log:
        rn = entry["round"]
        ag = entry["agent"].lower()
        if rn in rounds_dict:
            rounds_dict[rn][ag]["queries"] = entry.get("queries", [])
            rounds_dict[rn][ag]["sources"] = entry.get("sources", [])
            rounds_dict[rn][ag]["wikipedia_anchor"] = entry.get("wikipedia_anchor")
            rounds_dict[rn][ag]["claims"] = entry.get("claims")

    debate_artifact = {
        "topic": topic,
        "curveball": curveball,
        "topic_meta": topic_meta,
        "timestamp": datetime.now().isoformat(),
        "rounds": [rounds_dict[k] for k in sorted(rounds_dict)],
        "judge": {"verdict": verdict_text, "winner": winner, "source_critique": ""},
        "reflections": reflections_collected,
    }

    filepath = await write_artifact(debate_artifact)
    yield sse_event({"type": "artifact_saved", "filepath": filepath, "topic": topic})

    # Index into vector memory so future related debates can recall this verdict.
    # Fails open internally — never blocks or breaks the response.
    await vector_store.index_debate(debate_artifact)

    yield "data: [DONE]\n\n"


@app.post("/debate/round")
async def round_endpoint(body: RoundRequest, request: Request):
    # Classify topic on round 1; carry forward on subsequent rounds
    if body.round_num == 1:
        topic_meta = await classify_topic(body.topic)
    else:
        topic_meta = body.topic_meta or {}

    curveball = _clean_curveball(body.curveball)

    async def stream() -> AsyncGenerator[bytes, None]:
        async for chunk in run_round(
            body.topic, body.round_num, body.history, body.research_log, topic_meta, curveball, body.language
        ):
            if await request.is_disconnected():
                break
            yield chunk.encode("utf-8")

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/debate/judge")
async def judge_endpoint(body: JudgeRequest, request: Request):
    curveball = _clean_curveball(body.curveball)

    async def stream() -> AsyncGenerator[bytes, None]:
        async for chunk in run_judge(
            body.topic, body.history, body.research_log, body.topic_meta, curveball, body.language
        ):
            if await request.is_disconnected():
                break
            yield chunk.encode("utf-8")

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/live/{agent}")
async def live_endpoint(websocket: WebSocket, agent: str):
    """Real-time voice conversation with a debate agent — additive "Enter the Arena"
    mode, separate from the scripted PRO/CON/JUDGE SSE debate flow above.

    Client protocol (JSON text frames):
      -> {"type": "audio", "data": "<base64 pcm16 16kHz>"}   mic chunk
      -> {"type": "stop"}                                     end the session
      <- {"type": "ready"}
      <- {"type": "audio", "data": "<base64 pcm16 24kHz>"}    agent speech chunk
      <- {"type": "transcript", "role": "user"|"agent", "text": "..."}
      <- {"type": "interrupted"}                              user barged in, stop playback
      <- {"type": "turn_complete"}
      <- {"type": "error", "message": "..."}
    """
    agent = agent.upper()
    await websocket.accept()

    if agent not in ("PRO", "CON", "JUDGE"):
        await websocket.send_json({"type": "error", "message": f"Unknown agent: {agent}"})
        await websocket.close()
        return

    if not live.LIVE_ENABLED or not os.getenv("GEMINI_API_KEY"):
        await websocket.send_json({"type": "error", "message": "Live voice is not available right now."})
        await websocket.close()
        return

    topic = websocket.query_params.get("topic")

    async def relay_client_to_gemini(session):
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type")
            if msg_type == "audio":
                audio_bytes = base64.b64decode(msg["data"])
                await session.send_realtime_input(
                    audio=genai_types.Blob(data=audio_bytes, mime_type=live.INPUT_MIME)
                )
            elif msg_type == "stop":
                break

    async def relay_gemini_to_client(session):
        async for response in session.receive():
            sc = response.server_content
            if not sc:
                continue
            if sc.interrupted:
                await websocket.send_json({"type": "interrupted"})
            if sc.model_turn:
                for part in sc.model_turn.parts:
                    if part.inline_data and part.inline_data.data:
                        await websocket.send_json({
                            "type": "audio",
                            "data": base64.b64encode(part.inline_data.data).decode(),
                        })
            if sc.output_transcription and sc.output_transcription.text:
                await websocket.send_json({
                    "type": "transcript", "role": "agent", "text": sc.output_transcription.text,
                })
            if sc.input_transcription and sc.input_transcription.text:
                await websocket.send_json({
                    "type": "transcript", "role": "user", "text": sc.input_transcription.text,
                })
            if sc.turn_complete:
                await websocket.send_json({"type": "turn_complete"})

    try:
        async with live.connect(agent, topic) as session:
            await websocket.send_json({"type": "ready"})
            client_task = asyncio.create_task(relay_client_to_gemini(session))
            gemini_task = asyncio.create_task(relay_gemini_to_client(session))
            done, pending = await asyncio.wait(
                {client_task, gemini_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            for task in done:
                task.exception()  # surface (and swallow) so it isn't logged as unretrieved
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)[:200]})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
