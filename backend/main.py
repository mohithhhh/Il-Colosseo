import json
import asyncio
from datetime import datetime
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv, find_dotenv

from agents import argue, judge, reflect
from research import search
from query_generator import generate_pro_query, generate_con_query
from tts import synthesize
from classifier import classify_topic
from integrity_gate import check_sources
from speech_eval import evaluate_speech
from artifact_writer import write_artifact

load_dotenv(find_dotenv())

app = FastAPI(title="Debate Arena API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROUNDS = 3

_RETRY_INSTRUCTION = (
    "Your previous attempt was too short or too vague. "
    "This time: make it at least 4 sentences, cite a specific source by name, "
    "and directly name and refute the opponent's claim."
)


def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


class RoundRequest(BaseModel):
    topic: str
    round_num: int
    history: list[dict] = []
    research_log: list[dict] = []
    topic_meta: dict = {}


class JudgeRequest(BaseModel):
    topic: str
    history: list[dict]
    research_log: list[dict] = []
    topic_meta: dict = {}


async def run_round(
    topic: str,
    round_num: int,
    history: list[dict],
    research_log: list[dict],
    topic_meta: dict,
) -> AsyncGenerator[str, None]:
    scores = {
        "PRO": sum(1 for h in history if h["agent"] == "PRO"),
        "CON": sum(1 for h in history if h["agent"] == "CON"),
    }
    pro_speech_text = ""
    search_strategy = topic_meta.get("search_strategy", "")
    agent_instruction = topic_meta.get("agent_instruction", "")

    for agent in ("PRO", "CON"):
        # Determine prior opponent speech for speech eval
        if agent == "PRO":
            prior_speech = next(
                (h["text"] for h in reversed(history) if h["agent"] == "CON"), None
            )
            query = await generate_pro_query(topic, history, search_strategy=search_strategy)
        else:
            prior_speech = pro_speech_text
            query = await generate_con_query(
                topic, history, pro_speech_text, search_strategy=search_strategy
            )

        sources = await search(query)

        # Integrity gate
        gate = await check_sources(topic, sources, agent)
        if gate.get("retry_search"):
            broad_query = f"{topic[:80]} overview"
            sources = await search(broad_query)
            query = broad_query
        elif not gate.get("pass", True) and "warning" in gate:
            yield sse_event({"type": "warning", "message": gate["warning"]})

        research_log = research_log + [
            {"agent": agent, "round": round_num, "query": query, "sources": sources}
        ]

        yield sse_event({
            "type": "researching",
            "agent": agent,
            "round": round_num,
            "query": query,
            "sources": sources,
        })

        text = await argue(
            agent, topic, round_num, history, research=sources,
            agent_instruction=agent_instruction,
        )

        # Speech eval — single retry on failure
        eval_result = await evaluate_speech(text, agent, round_num, prior_speech)
        if not eval_result.get("pass", True):
            text = await argue(
                agent, topic, round_num, history, research=sources,
                agent_instruction=agent_instruction,
                retry_instruction=_RETRY_INSTRUCTION,
            )

        if agent == "PRO":
            pro_speech_text = text

        scores[agent] += 1
        history = history + [{"agent": agent, "round": round_num, "text": text}]

        audio_b64 = await synthesize(text, agent)
        yield sse_event({
            "type": "speech",
            "agent": agent,
            "round": round_num,
            "text": text,
            "audio": audio_b64,
            "score": scores[agent],
            "winner": None,
        })

        await asyncio.sleep(0.1)

    yield sse_event({
        "type": "round_complete",
        "round": round_num,
        "history": history,
        "research_log": research_log,
        "topic_meta": topic_meta,
    })

    yield "data: [DONE]\n\n"


async def run_judge(
    topic: str,
    history: list[dict],
    research_log: list[dict],
    topic_meta: dict,
) -> AsyncGenerator[str, None]:
    verdict_text, winner = await judge(
        topic, history, research_log,
        judge_instruction=topic_meta.get("judge_instruction", ""),
    )

    judge_audio = await synthesize(verdict_text, "JUDGE")
    yield sse_event({
        "type": "speech",
        "agent": "JUDGE",
        "round": ROUNDS,
        "text": verdict_text,
        "audio": judge_audio,
        "score": None,
        "winner": winner,
    })

    reflections_collected: dict[str, str] = {}
    for agent in ("PRO", "CON"):
        reflection_text = await reflect(agent, topic, history, verdict_text)
        reflections_collected[agent.lower()] = reflection_text
        reflection_audio = await synthesize(reflection_text, agent)
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
                "pro": {"speech": "", "query": "", "sources": []},
                "con": {"speech": "", "query": "", "sources": []},
            }
        rounds_dict[rn][ag]["speech"] = entry["text"]
    for entry in research_log:
        rn = entry["round"]
        ag = entry["agent"].lower()
        if rn in rounds_dict:
            rounds_dict[rn][ag]["query"] = entry.get("query", "")
            rounds_dict[rn][ag]["sources"] = entry.get("sources", [])

    debate_artifact = {
        "topic": topic,
        "topic_meta": topic_meta,
        "timestamp": datetime.now().isoformat(),
        "rounds": [rounds_dict[k] for k in sorted(rounds_dict)],
        "judge": {"verdict": verdict_text, "winner": winner, "source_critique": ""},
        "reflections": reflections_collected,
    }

    filepath = await write_artifact(debate_artifact)
    yield sse_event({"type": "artifact_saved", "filepath": filepath, "topic": topic})

    yield "data: [DONE]\n\n"


@app.post("/debate/round")
async def round_endpoint(body: RoundRequest, request: Request):
    # Classify topic on round 1; carry forward on subsequent rounds
    if body.round_num == 1:
        topic_meta = await classify_topic(body.topic)
    else:
        topic_meta = body.topic_meta or {}

    async def stream() -> AsyncGenerator[bytes, None]:
        async for chunk in run_round(
            body.topic, body.round_num, body.history, body.research_log, topic_meta
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
    async def stream() -> AsyncGenerator[bytes, None]:
        async for chunk in run_judge(body.topic, body.history, body.research_log, body.topic_meta):
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
