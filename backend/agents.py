import os

import gemini_client

MAX_TOKENS = 150
GROUNDING_ENABLED = os.getenv("GROUNDING_ENABLED", "true").lower() != "false"

# BCP-47 codes matching Sarvam's supported TTS languages — kept in sync with tts.py
LANGUAGE_NAMES = {
    "hi-IN": "Hindi", "ta-IN": "Tamil", "te-IN": "Telugu", "bn-IN": "Bengali",
    "kn-IN": "Kannada", "ml-IN": "Malayalam", "mr-IN": "Marathi", "gu-IN": "Gujarati",
    "pa-IN": "Punjabi", "od-IN": "Odia", "en-IN": "English",
}


def _language_instruction(language: str) -> str:
    """Directive appended to a system prompt to force a non-English debate language."""
    name = LANGUAGE_NAMES.get(language)
    if not name or language in ("en", "en-IN"):
        return ""
    return (
        f" Respond entirely in {name}, written in native {name} script. "
        "Only proper nouns or technical terms without a natural equivalent may stay in English. "
        'Exception: if instructed to end with a literal "Winner: PRO" / "Winner: CON" / "Winner: TIE" '
        "line, that line must stay exactly as specified, in English, unchanged."
    )


async def _generate(prompt: str, system: str, max_tokens: int = MAX_TOKENS, tools: list | None = None):
    """Call generate_content, falling back to FALLBACK_MODEL on rate limits."""
    return await gemini_client.generate(prompt, system, max_tokens, tools=tools)


async def _generate_with_citations(prompt: str, system: str, max_tokens: int = MAX_TOKENS) -> tuple[str, list[dict]]:
    """Try a grounded (Google Search) call first so real, live citations back the argument.
    Falls back to a plain call on any failure — rate limit, quota, unsupported tool — so
    the debate never breaks just because grounding isn't available."""
    if GROUNDING_ENABLED:
        try:
            response = await _generate(prompt, system, max_tokens, tools=gemini_client.google_search_tool())
            return response.text.strip(), gemini_client.extract_citations(response)
        except Exception:
            pass
    response = await _generate(prompt, system, max_tokens)
    return response.text.strip(), []


def _build_pro_system(
    research: list[dict],
    wikipedia_anchor: str | None = None,
    claims: list[dict] | None = None,
) -> str:
    base = (
        "You are the PRO debater in a formal structured debate. "
        "Argue in favor of the proposition with clarity and conviction. "
        "Give exactly 3 sharp bullet points (use • as the bullet). "
        "Each bullet must be one concise sentence — no more. "
        "In round 2 and 3, open with one short rebuttal bullet before your 3 points. "
        "Never break character. No preamble, no summary."
    )
    return base + _research_block(research, wikipedia_anchor, claims)


def _build_con_system(
    research: list[dict],
    wikipedia_anchor: str | None = None,
    claims: list[dict] | None = None,
) -> str:
    base = (
        "You are the CON debater in a formal structured debate. "
        "Argue against the proposition with clarity and conviction. "
        "Give exactly 3 sharp bullet points (use • as the bullet). "
        "Each bullet must be one concise sentence — no more. "
        "In round 2 and 3, open with one short rebuttal bullet before your 3 points. "
        "Never break character. No preamble, no summary."
    )
    return base + _research_block(research, wikipedia_anchor, claims)


def _build_judge_system() -> str:
    return (
        "You are the Judge in a formal structured debate. "
        "Deliver a verdict in exactly 3 bullet points (use • as the bullet): "
        "one bullet on PRO's strongest point, one on CON's strongest point, one declaring the winner with reasoning. "
        "Keep each bullet to one sentence. "
        "End with exactly one of these lines on its own line: "
        '"Winner: PRO" or "Winner: CON" or "Winner: TIE". '
        "No preamble, no extra commentary."
    )


def _research_block(
    research: list[dict],
    wikipedia_anchor: str | None = None,
    claims: list[dict] | None = None,
) -> str:
    block = "\n\n"

    if wikipedia_anchor:
        block += (
            "[BACKGROUND — verified Wikipedia summary]\n"
            f"{wikipedia_anchor}\n\n"
            "Use this as your ground truth baseline. Do not contradict it without strong evidence.\n\n"
        )

    if claims:
        block += "[EXTRACTED CLAIMS — use these as your argument backbone]\n"
        for i, c in enumerate(claims[:5], 1):
            block += (
                f"{i}. {c.get('claim', '')} "
                f"(Source: {c.get('source_title', '')}, Confidence: {c.get('confidence', '')})\n"
            )
        block += "\nCite at least 2 of these claims by name in your argument.\n\n"

    if research:
        block += (
            "You have access to the following real-time research. "
            "Cite at least one source naturally in your argument. "
            "Do not list sources — weave them in as a debater would.\n\n"
        )
        source_num = 1
        for src in research[:10]:
            if src.get("is_full_article"):
                block += f"[FULL ARTICLE — {src['title']}]\n{src['content']}\n\n"
            else:
                block += f"[SOURCE {source_num}] {src['title']} — {src['content']}\n"
                source_num += 1

    return block if block.strip() else ""


async def argue(
    agent: str,
    topic: str,
    round_number: int,
    history: list[dict],
    research: list[dict] | None = None,
    agent_instruction: str = "",
    retry_instruction: str = "",
    curveball: str | None = None,
    wikipedia_anchor: str | None = None,
    claims: list[dict] | None = None,
    language: str = "en",
) -> tuple[str, list[dict]]:
    """Generate a debate argument for the given agent. Returns (text, citations)."""
    research = research or []

    if agent == "PRO":
        system = _build_pro_system(research, wikipedia_anchor, claims)
        role_label = "PRO debater"
    elif agent == "CON":
        system = _build_con_system(research, wikipedia_anchor, claims)
        role_label = "CON debater"
    else:
        raise ValueError(f"Unknown agent: {agent}")

    if agent_instruction:
        system += f" {agent_instruction}"
    system += _language_instruction(language)
    if curveball and round_number == 3:
        system += (
            f'\n\nAUDIENCE CHALLENGE (you must address this directly in your argument):\n'
            f'"{curveball}"\n'
            f'Do not deflect or ignore this. Name it explicitly and respond to it with evidence.'
        )
    if retry_instruction:
        system += f" {retry_instruction}"

    if history:
        context_lines = [
            f"Debate topic: {topic}",
            f"This is round {round_number} of 3.",
            "",
            "Previous arguments:",
        ]
        for entry in history:
            context_lines.append(f"{entry['agent']} (Round {entry['round']}): {entry['text']}")
        context_lines.append("")
        context_lines.append(
            f"Now deliver your Round {round_number} argument as the {role_label}."
        )
        prompt = "\n".join(context_lines)
    else:
        prompt = (
            f"Debate topic: {topic}\n\n"
            f"This is Round 1 of 3. Deliver your opening argument as the {role_label}."
        )

    return await _generate_with_citations(prompt, system)


async def judge(
    topic: str,
    history: list[dict],
    research_log: list[dict] | None = None,
    judge_instruction: str = "",
    curveball: str | None = None,
    language: str = "en",
) -> tuple[str, str, list[dict]]:
    """Generate the judge's verdict. Returns (verdict_text, winner_str, citations)."""
    system = _build_judge_system()
    if judge_instruction:
        system += f" {judge_instruction}"
    system += _language_instruction(language)
    if curveball:
        system += (
            f'\nThe audience injected this challenge before round 3: "{curveball}"\n'
            f'In your verdict, explicitly assess whether each agent genuinely addressed it '
            f'with evidence, or deflected it. Call out the difference by name.'
        )

    context_lines = [
        f"Debate topic: {topic}",
        "",
        "Full debate transcript:",
    ]
    for entry in history:
        context_lines.append(f"{entry['agent']} (Round {entry['round']}): {entry['text']}")

    if research_log:
        context_lines.append("")
        context_lines.append("Research conducted by each agent:")
        for entry in research_log:
            queries = entry.get("queries") or [entry.get("query", "")]
            context_lines.append(
                f"  {entry['agent']} (Round {entry['round']}) searched: \"{'; '.join(queries)}\""
            )
            for i, src in enumerate(entry.get("sources", [])[:3], 1):
                context_lines.append(f"    Source {i}: {src['title']} — {src['content'][:100]}")

    context_lines.append("")
    context_lines.append("Deliver your verdict.")

    verdict_text, citations = await _generate_with_citations("\n".join(context_lines), system)

    winner = "TIE"
    for line in reversed(verdict_text.splitlines()):
        line = line.strip()
        if line.startswith("Winner:"):
            candidate = line.replace("Winner:", "").strip().upper()
            if candidate in ("PRO", "CON", "TIE"):
                winner = candidate
            break

    return verdict_text, winner, citations


async def reflect(
    agent: str,
    topic: str,
    history: list[dict],
    verdict: str,
    language: str = "en",
) -> str:
    """One-sentence honest reflection after hearing the full debate and verdict."""
    last_arg = next(
        (e["text"] for e in reversed(history) if e["agent"] == agent), ""
    )

    system = (
        f"You are the {agent} debater. You have just heard the complete debate and the judge's verdict. "
        "In exactly one sentence, state honestly whether your position has shifted. "
        "You may fully maintain, partially concede, or completely reverse your position. "
        "Be specific and direct. No preamble, no 'I think' — just the honest sentence."
    )
    system += _language_instruction(language)
    prompt = (
        f"Topic: {topic}\n\n"
        f"Your final argument: {last_arg}\n\n"
        f"Judge's verdict: {verdict}\n\n"
        "Has your position shifted? One sentence."
    )

    response = await _generate(prompt, system, max_tokens=100)
    return response.text.strip()
