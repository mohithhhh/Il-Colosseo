import os
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

PRIMARY_MODEL = "gemini-3.1-flash-lite-preview"
FALLBACK_MODEL = "gemini-2.5-flash-lite"
MAX_TOKENS = 150


async def _generate(prompt: str, system: str, max_tokens: int = MAX_TOKENS):
    """Call generate_content, falling back to FALLBACK_MODEL on rate limits."""
    for model_name in (PRIMARY_MODEL, FALLBACK_MODEL):
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system,
            generation_config=genai.types.GenerationConfig(max_output_tokens=max_tokens),
        )
        try:
            return model.generate_content(prompt)
        except ResourceExhausted:
            if model_name == FALLBACK_MODEL:
                raise


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
) -> str:
    """Generate a debate argument for the given agent."""
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

    response = await _generate(prompt, system)
    return response.text.strip()


async def judge(
    topic: str,
    history: list[dict],
    research_log: list[dict] | None = None,
    judge_instruction: str = "",
    curveball: str | None = None,
) -> tuple[str, str]:
    """Generate the judge's verdict. Returns (verdict_text, winner_str)."""
    system = _build_judge_system()
    if judge_instruction:
        system += f" {judge_instruction}"
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
            context_lines.append(
                f"  {entry['agent']} (Round {entry['round']}) searched: \"{entry['query']}\""
            )
            for i, src in enumerate(entry.get("sources", [])[:3], 1):
                context_lines.append(f"    Source {i}: {src['title']} — {src['content'][:100]}")

    context_lines.append("")
    context_lines.append("Deliver your verdict.")

    response = await _generate("\n".join(context_lines), system)
    verdict_text = response.text.strip()

    winner = "TIE"
    for line in reversed(verdict_text.splitlines()):
        line = line.strip()
        if line.startswith("Winner:"):
            candidate = line.replace("Winner:", "").strip().upper()
            if candidate in ("PRO", "CON", "TIE"):
                winner = candidate
            break

    return verdict_text, winner


async def reflect(
    agent: str,
    topic: str,
    history: list[dict],
    verdict: str,
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
    prompt = (
        f"Topic: {topic}\n\n"
        f"Your final argument: {last_arg}\n\n"
        f"Judge's verdict: {verdict}\n\n"
        "Has your position shifted? One sentence."
    )

    response = await _generate(prompt, system, max_tokens=100)
    return response.text.strip()
