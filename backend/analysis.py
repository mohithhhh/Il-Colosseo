"""
Debate analysis enhancers that run beside the main pipeline:

- verify_quotes  — deterministic check that quoted text really appears in a fetched source
- watch_speech   — "Manipulation Watch": flags persuasion that misleads without lying
                   (cherry-picking, missing context, loaded framing…)
- score_debate   — rubric scorecard per side, separate from the judge's parsed verdict
- common_ground  — Habermas-style mediator: draft → both sides critique → revise
- coach_report   — feedback for a human debater in Human vs AI mode

All fail open: on any error they return an empty/neutral result so a debate never breaks.
"""
import asyncio
import json
import os
import re

import gemini_client
from agents import _language_instruction

ANALYSIS_ENABLED = os.getenv("ANALYSIS_ENABLED", "true").lower() != "false"

FLAG_TYPES = (
    "cherry_pick", "missing_context", "loaded_framing",
    "false_balance", "overgeneralization", "unsupported",
)
CRITERIA = ("evidence", "rebuttal", "logic", "clarity", "responsiveness")

_QUOTE_RE = re.compile(r'["“]([^"“”]{12,300})["”]')


def _parse_json(raw: str):
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip()).rstrip("`").strip()
    return json.loads(raw)


def _norm(s: str) -> str:
    return " ".join(re.sub(r"[^\w\s]", " ", s.lower()).split())


def _transcript(history: list[dict]) -> str:
    return "\n".join(f"{h['agent']} (Round {h['round']}): {h['text']}" for h in history)


def verify_quotes(text: str, sources: list[dict]) -> list[dict]:
    """Every "quoted" span of 3+ words in the speech, marked verified if it appears
    verbatim (case/punctuation-insensitive) in a source's fetched text."""
    out = []
    for m in _QUOTE_RE.finditer(text):
        quote = m.group(1).strip()
        needle = _norm(quote)
        if len(needle.split()) < 3:
            continue
        match = next((s for s in sources if needle in _norm(s.get("content", ""))), None)
        out.append({
            "quote": quote,
            "verified": match is not None,
            "source_title": match.get("title", "") if match else "",
            "url": match.get("url", "") if match else "",
        })
    return out


_WATCH_SYSTEM = (
    "You audit debate speeches for persuasion that misleads WITHOUT necessarily stating "
    "anything false. Flag only clear cases of: cherry_pick (selective evidence that hides "
    "the wider picture), missing_context (true fact framed without context that changes "
    "its meaning), loaded_framing (emotionally loaded wording standing in for evidence), "
    "false_balance (treating a fringe view as equal to a consensus), overgeneralization "
    "(sweeping claim from narrow evidence), unsupported (factual claim with no support in "
    "the provided sources). A clean speech gets no flags — do not invent problems. "
    'Return raw JSON only: {"flags": [{"type": "<one of the types>", '
    '"excerpt": "<short exact phrase from the speech>", "note": "<one short sentence>"}]} '
    "with at most 2 flags. Write the note in the same language as the speech."
)


async def watch_speech(text: str, agent: str, sources: list[dict] | None = None) -> list[dict]:
    if not ANALYSIS_ENABLED or not text:
        return []
    src = "\n".join(
        f"- {s.get('title', '')}: {s.get('content', '')[:200]}" for s in (sources or [])[:6]
    )
    prompt = f"Speaker: {agent}\nSpeech:\n{text}\n\nSources the speaker had:\n{src or '(none)'}"
    try:
        response = await gemini_client.generate(prompt, _WATCH_SYSTEM, max_tokens=300)
        flags = _parse_json(response.text).get("flags", [])
        return [
            {"type": f["type"], "excerpt": str(f.get("excerpt", ""))[:120], "note": str(f.get("note", ""))[:200]}
            for f in flags[:2]
            if isinstance(f, dict) and f.get("type") in FLAG_TYPES
        ]
    except Exception:
        return []


_SCORE_SYSTEM = (
    "You are a strict debate adjudicator scoring a finished debate on a rubric. "
    "Score each side 0-10 on: evidence (specific, sourced support), rebuttal (engages the "
    "opponent's actual claims), logic (sound reasoning, no fallacies), clarity (concise, "
    "well-structured), responsiveness (addresses the audience challenge if there was one; "
    "otherwise adapts across rounds). Use the full range; do not default to 7s. "
    'Return raw JSON only: {"PRO": {"evidence": n, "rebuttal": n, "logic": n, "clarity": n, '
    '"responsiveness": n}, "CON": {...same keys}}'
)


async def score_debate(topic: str, history: list[dict], curveball: str | None = None) -> dict:
    if not ANALYSIS_ENABLED:
        return {}
    prompt = f"Topic: {topic}\n"
    if curveball:
        prompt += f'Audience challenge before round 3: "{curveball}"\n'
    prompt += f"\nTranscript:\n{_transcript(history)}"
    try:
        response = await gemini_client.generate(prompt, _SCORE_SYSTEM, max_tokens=200)
        data = _parse_json(response.text)
        return {
            side: {c: max(0, min(10, int(data[side][c]))) for c in CRITERIA}
            for side in ("PRO", "CON")
        }
    except Exception:
        return {}


_MEDIATOR_SYSTEM = (
    "You are Concordia, a neutral mediator. After a debate, write the statement that BOTH "
    "sides could honestly endorse: the facts and values they actually share, stated "
    "precisely enough to mean something (not vague platitudes). "
    'Return raw JSON only: {"statement": "<2-3 sentences of common ground>", '
    '"disputed": "<one sentence naming the crux they still genuinely disagree on>"}'
)


async def common_ground(topic: str, history: list[dict], verdict: str, language: str = "en") -> dict:
    """Draft a common-ground statement, have each side critique it, then revise once.
    Mirrors the critique-and-revise loop of DeepMind's Habermas Machine at debate scale."""
    if not ANALYSIS_ENABLED:
        return {}
    lang = _language_instruction(language)
    base = f"Topic: {topic}\n\nTranscript:\n{_transcript(history)}\n\nJudge's verdict:\n{verdict}"
    try:
        draft = (await gemini_client.generate(base, _MEDIATOR_SYSTEM + lang, max_tokens=250)).text

        async def critique(side: str) -> str:
            system = (
                f"You are the {side} debater. A mediator proposed a common-ground statement. "
                "In one sentence, say what in it you could NOT honestly endorse, or 'I endorse it.'"
            ) + lang
            resp = await gemini_client.generate(f"{base}\n\nProposed statement:\n{draft}", system, max_tokens=80)
            return resp.text.strip()

        pro_c, con_c = await asyncio.gather(critique("PRO"), critique("CON"))
        revised = await gemini_client.generate(
            f"{base}\n\nYour draft:\n{draft}\n\nPRO's objection: {pro_c}\nCON's objection: {con_c}\n\n"
            "Revise the statement so both sides could endorse it.",
            _MEDIATOR_SYSTEM + lang,
            max_tokens=250,
        )
        data = _parse_json(revised.text)
        return {
            "statement": str(data.get("statement", ""))[:600],
            "disputed": str(data.get("disputed", ""))[:300],
            "objections": {"PRO": pro_c[:300], "CON": con_c[:300]},
        }
    except Exception:
        return {}


_COACH_SYSTEM = (
    "You are a world-class debate coach giving feedback to a human student who just debated "
    "an AI. Be specific to what they actually said; quote them. Be encouraging but honest. "
    'Return raw JSON only: {"strengths": ["<one sentence>", "<one sentence>"], '
    '"improve": ["<one sentence>", "<one sentence>"], '
    '"missed_rebuttal": "<the opponent claim they most needed to answer but did not, or empty>", '
    '"champion_rewrite": "<their weakest point rewritten the way a champion would say it, 1-2 sentences>"}'
)


async def coach_report(
    topic: str, history: list[dict], human_side: str, flags: list[dict] | None = None, language: str = "en"
) -> dict:
    if not ANALYSIS_ENABLED:
        return {}
    prompt = (
        f"Topic: {topic}\nThe human argued {human_side}.\n\nTranscript:\n{_transcript(history)}"
    )
    if flags:
        prompt += "\n\nPersuasion issues flagged in the human's speeches:\n" + "\n".join(
            f"- {f['type']}: \"{f['excerpt']}\" — {f['note']}" for f in flags
        )
    try:
        response = await gemini_client.generate(prompt, _COACH_SYSTEM + _language_instruction(language), max_tokens=400)
        data = _parse_json(response.text)
        return {
            "strengths": [str(s)[:250] for s in data.get("strengths", [])][:3],
            "improve": [str(s)[:250] for s in data.get("improve", [])][:3],
            "missed_rebuttal": str(data.get("missed_rebuttal", ""))[:300],
            "champion_rewrite": str(data.get("champion_rewrite", ""))[:400],
        }
    except Exception:
        return {}
