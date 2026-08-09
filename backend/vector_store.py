"""
Vector memory — cross-debate RAG via Pinecone. Each finished debate (topic + verdict)
is embedded with Gemini's embedding model and upserted into Pinecone; before a new
debate starts, we query for similar past debates so agents can be given "the arena
remembers" context.

Fails open everywhere: no PINECONE_API_KEY, index unreachable, embedding error — the
debate always proceeds without memory rather than breaking, same pattern as
classifier.py / integrity_gate.py / speech_eval.py.
"""
import os
import asyncio

from dotenv import load_dotenv, find_dotenv
from google.genai import types

import gemini_client

load_dotenv(find_dotenv())

VECTOR_MEMORY_ENABLED = os.getenv("VECTOR_MEMORY_ENABLED", "true").lower() != "false"
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "il-colosseo-debates")
PINECONE_CLOUD = os.getenv("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.getenv("PINECONE_REGION", "us-east-1")

EMBED_MODEL = "gemini-embedding-001"
EMBED_DIM = 768

_index = None
_index_lock = asyncio.Lock()


async def _get_index():
    """Lazily connect to (and create if missing) the Pinecone index. None if unavailable."""
    global _index
    if _index is not None:
        return _index
    if not VECTOR_MEMORY_ENABLED or not PINECONE_API_KEY:
        return None
    async with _index_lock:
        if _index is not None:
            return _index
        try:
            def _connect():
                from pinecone import Pinecone, ServerlessSpec
                pc = Pinecone(api_key=PINECONE_API_KEY)
                if not pc.has_index(INDEX_NAME):
                    pc.create_index(
                        name=INDEX_NAME,
                        dimension=EMBED_DIM,
                        metric="cosine",
                        spec=ServerlessSpec(cloud=PINECONE_CLOUD, region=PINECONE_REGION),
                    )
                return pc.Index(INDEX_NAME)

            _index = await asyncio.to_thread(_connect)
        except Exception:
            _index = None
        return _index


async def _embed(text: str, task_type: str) -> list[float] | None:
    """Embed a passage or query via Gemini. None on any failure."""
    try:
        resp = await gemini_client.client.aio.models.embed_content(
            model=EMBED_MODEL,
            contents=text,
            config=types.EmbedContentConfig(
                output_dimensionality=EMBED_DIM, task_type=task_type
            ),
        )
        return resp.embeddings[0].values
    except Exception:
        return None


def _debate_summary(debate: dict) -> str:
    """Condense a finished debate artifact into one embeddable passage."""
    topic = debate.get("topic", "")
    judge_info = debate.get("judge", {}) or {}
    return (
        f"Topic: {topic}\n"
        f"Winner: {judge_info.get('winner', '')}\n"
        f"Verdict: {judge_info.get('verdict', '')}"
    )


async def index_debate(debate: dict) -> None:
    """Embed and upsert a finished debate so future related debates can recall it."""
    index = await _get_index()
    if index is None:
        return

    vector = await _embed(_debate_summary(debate), task_type="RETRIEVAL_DOCUMENT")
    if vector is None:
        return

    topic = debate.get("topic", "debate")
    timestamp = debate.get("timestamp", "")
    vector_id = f"{topic[:60]}-{timestamp}"
    judge_info = debate.get("judge", {}) or {}
    metadata = {
        "topic": topic[:500],
        "winner": judge_info.get("winner", ""),
        "verdict": judge_info.get("verdict", "")[:1000],
        "timestamp": timestamp,
    }

    try:
        await asyncio.to_thread(
            index.upsert, vectors=[{"id": vector_id, "values": vector, "metadata": metadata}]
        )
    except Exception:
        pass


async def query_memory(topic: str, top_k: int = 3, min_score: float = 0.72) -> list[dict]:
    """Return up to `top_k` past debates related to `topic`, above a similarity floor.
    Empty list if memory is disabled, unavailable, or nothing relevant exists yet.
    """
    index = await _get_index()
    if index is None:
        return []

    vector = await _embed(topic, task_type="RETRIEVAL_QUERY")
    if vector is None:
        return []

    try:
        result = await asyncio.to_thread(
            index.query, vector=vector, top_k=top_k, include_metadata=True
        )
    except Exception:
        return []

    memories = []
    for match in getattr(result, "matches", None) or []:
        if getattr(match, "score", None) is None or match.score < min_score:
            continue
        md = match.metadata or {}
        memories.append({
            "topic": md.get("topic", ""),
            "winner": md.get("winner", ""),
            "verdict": md.get("verdict", ""),
        })
    return memories
