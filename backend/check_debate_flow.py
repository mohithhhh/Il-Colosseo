"""Offline check of the debate SSE flow with Gemini, search and TTS stubbed out.

Run from backend/:  .venv/bin/python check_debate_flow.py
"""
import asyncio
import json
import os
from types import SimpleNamespace

os.environ.setdefault("GEMINI_API_KEY", "offline-check")  # client needs a key to construct; never called

import gemini_client
import research as research_module
import main
import analysis

SOURCE = {"title": "Sky Report", "url": "https://example.com/sky", "content": "Observers agree the sky is blue today across the region."}


async def fake_generate(prompt, system, max_tokens=150, tools=None):
    if "audit debate speeches" in system:
        out = {"flags": [{"type": "cherry_pick", "excerpt": "sky", "note": "Ignores cloudy days."}, {"type": "made_up"}]}
    elif "strict debate adjudicator" in system:
        out = {side: {c: 12 if side == "PRO" else 6 for c in analysis.CRITERIA} for side in ("PRO", "CON")}
    elif "You are Concordia" in system:
        out = {"statement": "Both agree skies vary.", "disputed": "How often."}
    elif "mediator proposed" in system:
        return SimpleNamespace(text="I endorse it.")
    elif "debate coach" in system:
        out = {"strengths": ["Clear."], "improve": ["Cite more."], "missed_rebuttal": "", "champion_rewrite": "Better."}
    elif "You are the Judge" in system:
        return SimpleNamespace(text="• PRO good\n• CON ok\n• PRO wins\nWinner: PRO")
    elif "debater in a formal structured debate" in system:
        return SimpleNamespace(text='• As the report says, "the sky is blue today" — and "pigs fly daily in Paris".')
    else:
        out = {"pass": True}
    return SimpleNamespace(text=json.dumps(out))


async def fake_search(query):
    return [SOURCE]


async def none(*_a, **_k):
    return None


async def silent(*_a, **_k):
    return ""


async def collect(gen):
    events = []
    async for chunk in gen:
        raw = chunk.removeprefix("data: ").strip()
        events.append("DONE" if raw == "[DONE]" else json.loads(raw))
    return events


def types_of(events):
    return [e if e == "DONE" else e["type"] for e in events]


async def run():
    gemini_client.generate = fake_generate
    research_module.search = fake_search
    research_module.wikipedia_anchor = none
    research_module.fetch_top_source = none
    main.vector_store.query_memory = lambda _t: asyncio.sleep(0, result=[])
    main.vector_store.index_debate = lambda _a: asyncio.sleep(0)
    main.synthesize = silent

    async def fake_write(_artifact):
        return "debates/test.json"
    main.write_artifact = fake_write

    # Quote verification is plain string matching.
    q = analysis.verify_quotes('He said "The SKY is blue, today" and "pigs fly daily in Paris".', [SOURCE])
    assert [x["verified"] for x in q] == [True, False], q

    # 1. AI vs AI round: both sides speak with quotes + flags.
    ev = await collect(main.run_round("Is the sky blue?", 1, [], [], {}))
    speeches = [e for e in ev if e != "DONE" and e["type"] == "speech"]
    assert [s["agent"] for s in speeches] == ["PRO", "CON"], types_of(ev)
    assert speeches[0]["quotes"][0]["verified"] is True
    assert speeches[0]["quotes"][1]["verified"] is False
    assert [f["type"] for f in speeches[0]["flags"]] == ["cherry_pick"], "unknown flag types are dropped"
    assert types_of(ev)[-2:] == ["round_complete", "DONE"]

    # 2. Human plays CON: round pauses after PRO, then resumes without re-running PRO.
    ev = await collect(main.run_round("Is the sky blue?", 1, [], [], {}, human_side="CON"))
    assert types_of(ev)[-2:] == ["awaiting_human", "DONE"], types_of(ev)
    paused = ev[-2]
    assert [h["agent"] for h in paused["history"]] == ["PRO"]
    ev = await collect(main.run_round(
        "Is the sky blue?", 1, paused["history"], paused["research_log"], paused["topic_meta"],
        human_side="CON", human_speech="Skies are often grey.",
    ))
    speeches = [e for e in ev if e != "DONE" and e["type"] == "speech"]
    assert [(s["agent"], s.get("human")) for s in speeches] == [("CON", True)], types_of(ev)
    history = ev[-2]["history"]
    assert [h["agent"] for h in history] == ["PRO", "CON"]

    # 3. Human plays PRO: pauses before anything runs.
    ev = await collect(main.run_round("Is the sky blue?", 1, [], [], {}, human_side="PRO"))
    assert types_of(ev) == ["awaiting_human", "DONE"], types_of(ev)

    # 4. Judge in human mode: scorecard clamped, one AI reflection, common ground, coach.
    ev = await collect(main.run_judge("Is the sky blue?", history, [], {}, human_side="CON"))
    t = types_of(ev)
    assert t == ["speech", "scorecard", "reflection", "common_ground", "coach", "artifact_saved", "DONE"], t
    assert ev[1]["scores"]["PRO"]["evidence"] == 10, "scores clamp to 0-10"
    assert ev[2]["agent"] == "PRO"
    assert ev[3]["statement"] and ev[3]["objections"]["CON"] == "I endorse it."

    # 5. Judge in AI mode: both reflect, no coach.
    ev = await collect(main.run_judge("Is the sky blue?", history, [], {}))
    t = types_of(ev)
    assert t == ["speech", "scorecard", "reflection", "reflection", "common_ground", "artifact_saved", "DONE"], t

    # 6. Rate limiter.
    main._hits.clear()
    assert not any(main._rate_limited("1.2.3.4") for _ in range(main.RATE_LIMIT_PER_HOUR))
    assert main._rate_limited("1.2.3.4") and not main._rate_limited("5.6.7.8")

    # Client IP comes from the proxy-appended (rightmost) X-Forwarded-For entry, not the spoofable left.
    conn = SimpleNamespace(headers={"x-forwarded-for": "6.6.6.6, 9.9.9.9"}, client=SimpleNamespace(host="10.0.0.1"))
    assert main._client_ip(conn) == "9.9.9.9"
    assert main._client_ip(SimpleNamespace(headers={}, client=SimpleNamespace(host="10.0.0.1"))) == "10.0.0.1"

    print("all debate flow checks passed")


if __name__ == "__main__":
    asyncio.run(run())
