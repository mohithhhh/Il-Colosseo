import os
import base64
import msgpack
import httpx
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

FISH_AUDIO_API_KEY = os.getenv("FISH_AUDIO_API", "")
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")

# Optional per-agent voice reference IDs from Fish Audio library
# Leave unset to use the default Fish Audio voice for all agents
VOICE_MAP = {
    "PRO":   os.getenv("FISH_AUDIO_VOICE_PRO"),
    "CON":   os.getenv("FISH_AUDIO_VOICE_CON"),
    "JUDGE": os.getenv("FISH_AUDIO_VOICE_JUDGE"),
}

# Sarvam Bulbul v3 speakers — one voice per agent, shared across all supported languages
SARVAM_SPEAKER_MAP = {
    "PRO":   os.getenv("SARVAM_VOICE_PRO", "shubh"),
    "CON":   os.getenv("SARVAM_VOICE_CON", "anand"),
    "JUDGE": os.getenv("SARVAM_VOICE_JUDGE", "priya"),
}


async def synthesize(text: str, agent: str, language: str = "en") -> str:
    """Synthesize speech for the given agent.

    Routes to Sarvam Bulbul v3 for non-English debate languages (it doesn't speak
    English as naturally), and Fish Audio S2 Pro for English. Returns base64-encoded
    audio, or '' on failure/missing key — the frontend falls back to Web Speech API.
    """
    if not text:
        return ""
    if language and language != "en":
        return await _synthesize_sarvam(text, agent, language)
    return await _synthesize_fish(text, agent)


async def _synthesize_fish(text: str, agent: str) -> str:
    """Synthesize speech via Fish Audio S2 Pro. Returns base64-encoded mp3 or '' on failure."""
    if not FISH_AUDIO_API_KEY:
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
        print(f"[TTS] Fish Audio exception: {e}")
    return ""


async def _synthesize_sarvam(text: str, agent: str, language: str) -> str:
    """Synthesize speech via Sarvam Bulbul v3. Returns base64-encoded mp3 or '' on failure."""
    if not SARVAM_API_KEY:
        return ""

    payload = {
        "text": text[:2500],  # bulbul:v3 hard limit
        "language_code": language,
        "speaker": SARVAM_SPEAKER_MAP.get(agent, "shubh"),
        "model": "bulbul:v3",
        "output_audio_codec": "mp3",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.sarvam.ai/text-to-speech",
                json=payload,
                headers={
                    "api-subscription-key": SARVAM_API_KEY,
                    "Content-Type": "application/json",
                },
            )
            if response.status_code == 200:
                audios = response.json().get("audios") or []
                if audios:
                    return audios[0]  # already base64-encoded
            print(f"[TTS] Sarvam error {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"[TTS] Sarvam exception: {e}")
    return ""
