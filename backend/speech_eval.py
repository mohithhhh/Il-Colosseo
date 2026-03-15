import os
import json
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

PRIMARY_MODEL = "gemini-3.1-flash-lite-preview"
FALLBACK_MODEL = "gemini-2.5-flash-lite"

_SAFE_DEFAULT = {"pass": True, "reason": "eval skipped"}
_DISABLED_RESULT = {"pass": True, "reason": "disabled"}

_SPEECH_EVAL_ENABLED = os.getenv("SPEECH_EVAL_ENABLED", "true").lower() != "false"

_SYSTEM = (
    "You are a debate speech quality checker. "
    "Evaluate the given speech strictly and quickly. "
    "Return JSON only with keys: pass (bool), reason (one sentence). "
    "A speech passes if: it is at least 3 sentences long, "
    "it references or implies at least one external piece of evidence or source, "
    "and — in round 2 or later — it directly addresses a specific claim made by the opponent. "
    "Be strict. No preamble, no markdown fences, just raw JSON."
)


async def evaluate_speech(
    speech: str,
    agent: str,
    round_num: int,
    prior_speech: str | None = None,
) -> dict:
    """Evaluate speech quality. Returns dict with pass (bool) and reason.

    Fails open on error. Respects SPEECH_EVAL_ENABLED env var (default true).
    """
    if not _SPEECH_EVAL_ENABLED:
        return dict(_DISABLED_RESULT)

    parts = [f"Round {round_num}. Agent: {agent}. Speech: {speech}"]
    if round_num >= 2 and prior_speech:
        parts.append(f"Opponent's previous speech: {prior_speech}")
    prompt = "\n".join(parts)

    for model_name in (PRIMARY_MODEL, FALLBACK_MODEL):
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=_SYSTEM,
            generation_config=genai.types.GenerationConfig(max_output_tokens=100),
        )
        try:
            response = model.generate_content(prompt)
            raw = response.text.strip()
            if raw.startswith("```"):
                raw = "\n".join(raw.split("\n")[1:])
                if raw.endswith("```"):
                    raw = raw[: raw.rfind("```")]
                raw = raw.strip()
            return json.loads(raw)
        except ResourceExhausted:
            if model_name == FALLBACK_MODEL:
                break
        except (json.JSONDecodeError, Exception):
            break

    return dict(_SAFE_DEFAULT)
