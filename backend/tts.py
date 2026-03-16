import os
import base64
import msgpack
import httpx
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

FISH_AUDIO_API_KEY = os.getenv("FISH_AUDIO_API", "")

# Optional per-agent voice reference IDs from Fish Audio library
# Leave unset to use the default Fish Audio voice for all agents
VOICE_MAP = {
    "PRO":   os.getenv("FISH_AUDIO_VOICE_PRO"),
    "CON":   os.getenv("FISH_AUDIO_VOICE_CON"),
    "JUDGE": os.getenv("FISH_AUDIO_VOICE_JUDGE"),
}


async def synthesize(text: str, agent: str) -> str:
    """Synthesize speech via Fish Audio S2 Pro. Returns base64-encoded mp3 or '' on failure."""
    if not text or not FISH_AUDIO_API_KEY:
        return ""

    payload: dict = {
        "text": text,
        "format": "mp3",
        "mp3_bitrate": 128,
        "latency": "normal",
    }

    reference_id = VOICE_MAP.get(agent)
    if reference_id:
        payload["reference_id"] = reference_id

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.fish.audio/v1/tts",
                content=msgpack.packb(payload),
                headers={
                    "Authorization": f"Bearer {FISH_AUDIO_API_KEY}",
                    "Content-Type": "application/msgpack",
                    "model": "s2-pro",
                },
            )
            if response.status_code == 200:
                return base64.b64encode(response.content).decode()
            print(f"[TTS] Fish Audio error {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"[TTS] Exception: {e}")
    return ""
