import os
import json
from dotenv import load_dotenv, find_dotenv

import gemini_client

load_dotenv(find_dotenv())

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

    try:
        response = await gemini_client.generate(prompt, _SYSTEM, max_tokens=100)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
            if raw.endswith("```"):
                raw = raw[: raw.rfind("```")]
            raw = raw.strip()
        return json.loads(raw)
    except Exception:
        return dict(_SAFE_DEFAULT)
