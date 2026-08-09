"""
Gemini Live API bridge — real-time, bidirectional voice conversation with a debate
agent (PRO, CON, or JUDGE). Additive to the existing text/SSE debate flow: this powers
a separate "Enter the Arena" live-voice mode, not the scripted debate itself.

The FastAPI WebSocket route in main.py relays raw PCM16 audio between the browser and
the Gemini Live session opened here — this module only owns persona/session config.
"""
import os

from google.genai import types

import gemini_client

LIVE_MODEL = "gemini-2.5-flash-native-audio-latest"
LIVE_ENABLED = os.getenv("LIVE_VOICE_ENABLED", "true").lower() != "false"

# Browser mic capture is resampled to this on the way in; Gemini always replies at 24kHz.
INPUT_MIME = "audio/pcm;rate=16000"

VOICE_MAP = {"PRO": "Puck", "CON": "Charon", "JUDGE": "Kore"}

PERSONAS = {
    "PRO": (
        "You are Maximus, the PRO debater in Il Colosseo, a formal debate arena. "
        "You are now in a live voice conversation with an audience member, not delivering "
        "a formal speech. Speak naturally and conversationally, but stay fully in character: "
        "confident, persuasive, and always arguing in favor of the debate topic. "
        "Keep replies short and spoken, like a real conversation — a sentence or two at a time. "
        "If the audience member changes the subject, gently steer back to defending your position."
    ),
    "CON": (
        "You are Nexus, the CON debater in Il Colosseo, a formal debate arena. "
        "You are now in a live voice conversation with an audience member, not delivering "
        "a formal speech. Speak naturally and conversationally, but stay fully in character: "
        "sharp, skeptical, and always arguing against the debate topic. "
        "Keep replies short and spoken, like a real conversation — a sentence or two at a time. "
        "If the audience member changes the subject, gently steer back to arguing your position."
    ),
    "JUDGE": (
        "You are Arbitrus, the Judge in Il Colosseo, a formal debate arena. "
        "You are now in a live voice conversation with an audience member, not delivering "
        "a formal verdict. Speak calmly, fairly, and with authority, like a real judge "
        "explaining their reasoning aloud. Keep replies short and spoken, a sentence or two at a time."
    ),
}


def _system_instruction(agent: str, topic: str | None) -> str:
    persona = PERSONAS.get(agent, PERSONAS["JUDGE"])
    if topic:
        persona += f'\n\nThe debate topic on the floor right now is: "{topic}". Ground your answers in it.'
    return persona


def connect(agent: str, topic: str | None = None):
    """Open a Gemini Live session configured for the given agent persona.
    Returns an async context manager — use with `async with live.connect(...) as session:`.
    """
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=_system_instruction(agent, topic),
        input_audio_transcription={},
        output_audio_transcription={},
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                disabled=False, silence_duration_ms=300
            ),
        ),
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=VOICE_MAP.get(agent, "Kore")
                )
            )
        ),
    )
    return gemini_client.client.aio.live.connect(model=LIVE_MODEL, config=config)
