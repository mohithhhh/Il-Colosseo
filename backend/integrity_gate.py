import os
import json
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

PRIMARY_MODEL = "gemini-3.1-flash-lite-preview"
FALLBACK_MODEL = "gemini-2.5-flash-lite"

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

    for model_name in (PRIMARY_MODEL, FALLBACK_MODEL):
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=_SYSTEM,
            generation_config=genai.types.GenerationConfig(max_output_tokens=150),
        )
        try:
            response = model.generate_content(prompt)
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
        except ResourceExhausted:
            if model_name == FALLBACK_MODEL:
                break
        except (json.JSONDecodeError, Exception):
            break

    return dict(_SAFE_DEFAULT)
