import os
import json
import re
from datetime import datetime


def _topic_slug(topic: str) -> str:
    slug = topic.lower()[:40].replace(" ", "_")
    return re.sub(r"[^\w]", "", slug)


async def write_artifact(debate: dict) -> str:
    """Write the debate artifact to debates/{slug}_{timestamp}.json. Returns the filepath."""
    os.makedirs("debates", exist_ok=True)
    slug = _topic_slug(debate.get("topic", "debate"))
    ts = datetime.now().strftime("%Y%m%dT%H%M%S")
    filepath = f"debates/{slug}_{ts}.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(debate, f, indent=2, ensure_ascii=False)
    return filepath
