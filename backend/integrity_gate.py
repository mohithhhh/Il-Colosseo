import json
from dotenv import load_dotenv, find_dotenv

import gemini_client

load_dotenv(find_dotenv())

_SAFE_DEFAULT = {"pass": True, "weak_count": 0, "reason": "gate skipped"}

_SYSTEM = (
    "You are a source quality checker. "
    "Given a debate topic and a list of search result snippets, assess whether the sources are genuinely relevant. "
    "Return JSON only with keys: pass (bool), weak_count (int — number of sources with low relevance), "
    "reason (one sentence). "
    "A source is relevant if its content directly supports or opposes the topic claim. "
    "Be strict but not paranoid. No preamble, no markdown fences, just raw JSON."
)


async def check_sources(topic: str, sources: list[dict], agent: str) -> dict:
    """Check source quality and relevance. Returns a dict with pass, weak_count, reason.

    If pass is False and weak_count >= 3: adds retry_search=True.
    If pass is False and weak_count < 3: adds retry_search=False and a warning message.
    Always fails open on error so the live show never breaks.
    """
    if not sources:
        return dict(_SAFE_DEFAULT)

    src_text = "\n".join(
        f"- {s.get('title', '')}: {s.get('content', '')}" for s in sources
    )
    prompt = f"Topic: {topic}\nAgent: {agent}\n\nSources:\n{src_text}"

    try:
        response = await gemini_client.generate(prompt, _SYSTEM, max_tokens=150)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
            if raw.endswith("```"):
                raw = raw[: raw.rfind("```")]
            raw = raw.strip()
        result = json.loads(raw)
        if not result.get("pass", True):
            weak_count = result.get("weak_count", 0)
            result["retry_search"] = weak_count >= 3
            if not result["retry_search"]:
                result["warning"] = (
                    "Research signal is weak for this topic — debate may lack evidence depth"
                )
        return result
    except Exception:
        return dict(_SAFE_DEFAULT)
