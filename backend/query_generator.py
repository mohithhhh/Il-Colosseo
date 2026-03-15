import re


def _clean(text: str) -> str:
    """Strip punctuation and collapse whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", text)).strip()


async def generate_pro_query(topic: str, history: list[dict], search_strategy: str = "") -> str:
    """Build a PRO-side search query without an LLM call."""
    base = _clean(topic)
    # Round 2+ — focus the query on the angle Pro last argued
    if history:
        last_pro = next((e["text"] for e in reversed(history) if e["agent"] == "PRO"), "")
        # Extract first ~6 words of the last argument as context
        words = last_pro.split()[:6]
        if words:
            base = " ".join(words)
    query = f"evidence supporting {base}"
    if search_strategy:
        query = f"{query} {search_strategy}"
    return query[:120]


async def generate_con_query(topic: str, history: list[dict], pro_speech: str, search_strategy: str = "") -> str:
    """Build a CON-side search query targeting Pro's latest speech without an LLM call."""
    # Use the first 8 words of Pro's speech as the anchor
    words = pro_speech.split()[:8]
    if words:
        query = f"against {' '.join(words)}"
    else:
        query = f"problems with {_clean(topic)}"
    if search_strategy:
        query = f"{query} {search_strategy}"
    return query[:120]
