import os
import json
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

PRIMARY_MODEL = "gemini-3.1-flash-lite-preview"
FALLBACK_MODEL = "gemini-2.5-flash-lite"

_SAFE_DEFAULT = {
    "shape": "canonical",
    "confidence": 0.5,
    "reason": "classification failed",
    "search_strategy": "search directly",
    "agent_instruction": "",
    "judge_instruction": "",
}

_SYSTEM = (
    "You are a topic classifier for a debate system. "
    "Classify the given topic into exactly one of four shapes: "
    "canonical (well-documented, stable facts), "
    "current-event (recent, fast-changing news), "
    "comparison (A vs B, person vs person, product vs product), "
    "or tricky (controversial, politically contested, or highly opinion-dependent). "
    "Return JSON only with keys: shape, confidence (0.0-1.0), reason (one sentence), "
    "search_strategy (one sentence instruction for how to search this topic effectively), "
    "agent_instruction (one sentence added to debater prompts), "
    "judge_instruction (one sentence added to judge prompt). "
    "No preamble, no markdown fences, just raw JSON."
)


async def classify_topic(topic: str) -> dict:
    """Classify the debate topic into a shape and return metadata for downstream use."""
    for model_name in (PRIMARY_MODEL, FALLBACK_MODEL):
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=_SYSTEM,
            generation_config=genai.types.GenerationConfig(max_output_tokens=200),
        )
        try:
            response = model.generate_content(topic)
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
