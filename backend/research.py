import os
import httpx
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
TAVILY_URL = "https://api.tavily.com/search"


async def search(query: str) -> list[dict]:
    """Search Tavily for real-time sources. Returns up to 5 cleaned results."""
    if not TAVILY_API_KEY or not query:
        return []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                TAVILY_URL,
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "max_results": 5,
                    "search_depth": "basic",
                },
                headers={"Authorization": f"Bearer {TAVILY_API_KEY}"},
            )
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPStatusError, httpx.RequestError):
        return []

    results = []
    for r in data.get("results", [])[:5]:
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": (r.get("content") or r.get("snippet") or "")[:200],
        })
    return results
