"""
Shared google-genai client — replaces the deprecated `google-generativeai` SDK
(EOL Nov 2025). Every module that talks to Gemini (agents, research, classifier,
integrity_gate, speech_eval, query_generator) goes through `generate()` here so
the fallback-model + grounding-tool logic only lives in one place.
"""
import os

from dotenv import load_dotenv, find_dotenv
from google import genai
from google.genai import types, errors

load_dotenv(find_dotenv())

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))

PRIMARY_MODEL = "gemini-3.1-flash-lite-preview"
# Google-maintained alias rather than a pinned version — pinned lite models have been
# getting sunset with a hard 404 ("no longer available to new users"), which silently
# broke the entire 429 fallback path. The "-latest" alias tracks whatever's current.
FALLBACK_MODEL = "gemini-flash-lite-latest"


async def generate(
    prompt: str,
    system: str,
    max_tokens: int = 150,
    tools: list | None = None,
):
    """Call Gemini generate_content, falling back to FALLBACK_MODEL on rate limits.

    Returns the raw GenerateContentResponse (use `.text` for the text, or
    `extract_citations()` below for grounding results). Re-raises anything
    that isn't a 429 so callers keep their existing error handling.
    """
    for model_name in (PRIMARY_MODEL, FALLBACK_MODEL):
        try:
            return await client.aio.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=max_tokens,
                    tools=tools,
                ),
            )
        except errors.ClientError as e:
            if e.code == 429 and model_name != FALLBACK_MODEL:
                continue
            raise


def google_search_tool() -> list:
    """Tool config enabling live Google Search grounding for a single call."""
    return [types.Tool(google_search=types.GoogleSearch())]


def extract_citations(response) -> list[dict]:
    """Pull {title, url, domain} citations out of a grounded response. Empty list if none."""
    try:
        gm = response.candidates[0].grounding_metadata
        if not gm or not gm.grounding_chunks:
            return []
        return [
            {"title": c.web.title or "", "url": c.web.uri or "", "domain": c.web.domain or ""}
            for c in gm.grounding_chunks
            if c.web
        ]
    except Exception:
        return []
