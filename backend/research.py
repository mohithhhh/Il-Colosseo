import os
import re
import json
from urllib.parse import quote

import httpx
from dotenv import load_dotenv, find_dotenv

import gemini_client

load_dotenv(find_dotenv())

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
TAVILY_URL = "https://api.tavily.com/search"
DEEP_RESEARCH_ENABLED = os.getenv("DEEP_RESEARCH_ENABLED", "true").lower() != "false"

_SKIP_DOMAINS = (
    "reddit.com", "twitter.com", "x.com", "facebook.com",
    "instagram.com", "youtube.com", "tiktok.com",
)


async def search(query: str) -> list[dict]:
    """Search Tavily for real-time sources. Returns up to 10 cleaned results."""
    if not TAVILY_API_KEY or not query:
        return []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                TAVILY_URL,
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "max_results": 10,
                    "search_depth": "advanced",
                },
                headers={"Authorization": f"Bearer {TAVILY_API_KEY}"},
            )
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPStatusError, httpx.RequestError):
        return []

    results = []
    for r in data.get("results", [])[:10]:
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": (r.get("content") or r.get("snippet") or "")[:400],
        })
    return results


def deduplicate(sources: list[dict]) -> list[dict]:
    """Remove sources with duplicate URLs, keeping the first occurrence."""
    seen: set[str] = set()
    out: list[dict] = []
    for s in sources:
        url = s.get("url", "")
        if url and url not in seen:
            seen.add(url)
            out.append(s)
        elif not url:
            out.append(s)
    return out


async def fetch_top_source(url: str) -> str | None:
    """Fetch clean text from a URL. Returns first 2500 chars or None on any failure."""
    if not DEEP_RESEARCH_ENABLED or not url:
        return None
    if any(domain in url for domain in _SKIP_DOMAINS):
        return None
    if "paywall" in url or "subscribe" in url:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            response = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type:
                return None
            html = response.text
    except Exception:
        return None

    for tag in ("script", "style", "nav", "header", "footer"):
        html = re.sub(rf"<{tag}[^>]*>.*?</{tag}>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:2500] if text else None


async def wikipedia_anchor(topic: str) -> str | None:
    """Fetch a plain-text Wikipedia summary for the topic. Returns extract or None."""
    if not DEEP_RESEARCH_ENABLED or not topic:
        return None
    encoded = quote(topic.strip().replace(" ", "_"))
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
    except Exception:
        return None
    extract = data.get("extract", "")
    if len(extract) < 100:
        return None
    return extract


async def _gemini_call(prompt: str, system: str, max_tokens: int = 600) -> str | None:
    """Single Gemini call returning text or None on failure."""
    try:
        result = await gemini_client.generate(prompt, system, max_tokens)
        return result.text.strip()
    except Exception:
        return None


async def extract_claims(
    topic: str, agent: str, sources: list[dict], round_num: int
) -> list[dict] | None:
    """Extract 5 specific, citable claims from sources for the given agent. Returns list or None."""
    if not DEEP_RESEARCH_ENABLED or not sources:
        return None

    system = (
        f"You are a claim extractor for a debate research system. "
        f"Given a topic and source snippets, extract exactly 5 specific, verifiable, citable claims "
        f"that support the {agent} position. Each claim must be something an agent can state confidently. "
        'Return JSON only: { "claims": [ { "claim": "...", "source_title": "...", "confidence": "high|medium|low" } ] }. '
        "No preamble, no markdown fences, just raw JSON."
    )
    source_text = "\n".join(
        f"[{i+1}] {s['title']}: {s['content']}"
        for i, s in enumerate(sources[:10])
    )
    user_msg = f"Topic: {topic}\nAgent: {agent}\nRound: {round_num}\n\nSources:\n{source_text}"

    raw = await _gemini_call(user_msg, system, max_tokens=600)
    if not raw:
        return None
    raw = re.sub(r"^```(?:json)?\s*", "", raw).rstrip("`").strip()
    try:
        data = json.loads(raw)
        claims = data.get("claims", [])
        return claims if isinstance(claims, list) and claims else None
    except Exception:
        return None
