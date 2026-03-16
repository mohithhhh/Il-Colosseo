import re
import json
import os

import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
DEEP_RESEARCH_ENABLED = os.getenv("DEEP_RESEARCH_ENABLED", "true").lower() != "false"

_PRIMARY_MODEL = "gemini-3.1-flash-lite-preview"
_FALLBACK_MODEL = "gemini-2.5-flash-lite"


def _clean(text: str) -> str:
    """Strip punctuation and collapse whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", text)).strip()


def _fallback_pro_query(
    topic: str,
    history: list[dict],
    search_strategy: str = "",
    curveball: str | None = None,
    round_num: int = 0,
) -> str:
    base = _clean(topic)
    if history:
        last_pro = next((e["text"] for e in reversed(history) if e["agent"] == "PRO"), "")
        words = last_pro.split()[:6]
        if words:
            base = " ".join(words)
    query = f"evidence supporting {base}"
    if search_strategy:
        query = f"{query} {search_strategy}"
    if curveball and round_num == 3:
        query = f"{query} {curveball[:60]}"
    return query[:120]


def _fallback_con_query(
    topic: str,
    pro_speech: str,
    search_strategy: str = "",
    curveball: str | None = None,
    round_num: int = 0,
) -> str:
    words = pro_speech.split()[:8]
    query = f"against {' '.join(words)}" if words else f"problems with {_clean(topic)}"
    if search_strategy:
        query = f"{query} {search_strategy}"
    if curveball and round_num == 3:
        query = f"{query} {curveball[:60]}"
    return query[:120]


async def _llm_queries(prompt: str, system: str) -> list[str] | None:
    """Call Gemini to generate 3 queries. Returns list or None on failure."""
    for model_name in (_PRIMARY_MODEL, _FALLBACK_MODEL):
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system,
                generation_config=genai.types.GenerationConfig(max_output_tokens=200),
            )
            result = model.generate_content(prompt)
            raw = result.text.strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw).rstrip("`").strip()
            data = json.loads(raw)
            queries = data.get("queries", [])
            if isinstance(queries, list) and queries:
                return [str(q) for q in queries[:3]]
        except ResourceExhausted:
            if model_name == _FALLBACK_MODEL:
                return None
        except Exception:
            return None
    return None


async def generate_pro_queries(
    topic: str,
    history: list[dict],
    topic_meta: dict,
    curveball: str | None = None,
    round_num: int = 0,
) -> list[str]:
    """Generate 3 distinct PRO search queries via Gemini. Falls back to single query."""
    search_strategy = topic_meta.get("search_strategy", "")
    if not DEEP_RESEARCH_ENABLED:
        return [_fallback_pro_query(topic, history, search_strategy, curveball, round_num)]

    system = (
        "You are a research strategist for a debate agent. "
        "Generate exactly 3 distinct search queries that together give comprehensive evidence for the PRO position on this topic. "
        "Each query must target a different angle: "
        "(1) main empirical evidence, (2) specific data points or statistics, (3) expert opinion or institutional backing. "
        'Return JSON only: { "queries": ["...", "...", "..."] }. No preamble, no markdown fences.'
    )
    parts = [f"Topic: {topic}", f"Round: {round_num}"]
    if history and round_num >= 2:
        last_pro = next((e["text"] for e in reversed(history) if e["agent"] == "PRO"), "")
        if last_pro:
            parts.append(f"Prior PRO argument: {last_pro[:200]}")
    if search_strategy:
        parts.append(f"Search strategy: {search_strategy}")
    if curveball and round_num == 3:
        parts.append(f"Audience challenge: {curveball}")

    queries = await _llm_queries("\n".join(parts), system)
    return queries or [_fallback_pro_query(topic, history, search_strategy, curveball, round_num)]


async def generate_con_queries(
    topic: str,
    history: list[dict],
    topic_meta: dict,
    pro_speech: str,
    pro_sources: list[dict],
    curveball: str | None = None,
    round_num: int = 0,
) -> list[str]:
    """Generate 3 distinct CON search queries targeting PRO's claims. Falls back to single query."""
    search_strategy = topic_meta.get("search_strategy", "")
    if not DEEP_RESEARCH_ENABLED:
        return [_fallback_con_query(topic, pro_speech, search_strategy, curveball, round_num)]

    system = (
        "You are a research strategist for a debate agent. "
        "Generate exactly 3 distinct search queries for comprehensive evidence against the proposition. "
        "(1) main empirical evidence against, (2) data points or statistics that undermine it, "
        "(3) evidence that directly contradicts or limits the claims in the opponent's speech. "
        'Return JSON only: { "queries": ["...", "...", "..."] }. No preamble, no markdown fences.'
    )
    parts = [f"Topic: {topic}", f"Round: {round_num}"]
    if pro_speech:
        parts.append(f"Opponent's speech: {pro_speech[:300]}")
    if pro_sources:
        titles = ", ".join(s.get("title", "") for s in pro_sources[:5] if not s.get("is_full_article"))
        if titles:
            parts.append(f"Opponent's sources: {titles}")
    if history and round_num >= 2:
        last_con = next((e["text"] for e in reversed(history) if e["agent"] == "CON"), "")
        if last_con:
            parts.append(f"Prior CON argument: {last_con[:200]}")
    if search_strategy:
        parts.append(f"Search strategy: {search_strategy}")
    if curveball and round_num == 3:
        parts.append(f"Audience challenge: {curveball}")

    queries = await _llm_queries("\n".join(parts), system)
    return queries or [_fallback_con_query(topic, pro_speech, search_strategy, curveball, round_num)]
