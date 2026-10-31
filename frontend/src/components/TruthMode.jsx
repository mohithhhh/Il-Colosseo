import { useState } from "react";
import { loadTruthStats, saveTruthStats, randomClaim } from "../truth";
import { useEscape } from "../useEscape";

// Truth Mode — debate as a truth-finding tool (Khan et al., "Debating with More Persuasive
// LLMs Leads to More Truthful Answers"). Claims have a known answer; the viewer calls it
// before and after the debate, and we track whether the debate made them (and the judge)
// more accurate. PRO always argues the claim is true.
const pct = (n, d) => `${Math.round((100 * n) / d)}%`;
const label = (v) => (v ? "True" : "False");

// Landing overlay: show a claim, take the viewer's call, then start the debate.
export function TruthStart({ onStart, onClose }) {
  const [item, setItem] = useState(() => randomClaim());
  useEscape(onClose);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="truth-title" onClick={(e) => e.stopPropagation()}>
        <button className="dialog__close" onClick={onClose} aria-label="Close">×</button>
        <h2 id="truth-title" className="dialog__title">Truth Mode</h2>
        <p className="dialog__lede">
          Call it now. Maximus argues it's true, Nexus argues it's false. After the verdict you call it again, then we
          reveal the answer.
        </p>
        <p className="claim">{item.claim}</p>
        <div className="vote">
          <button className="btn" onClick={() => onStart(item, true)}>True</button>
          <button className="btn" onClick={() => onStart(item, false)}>False</button>
        </div>
        <button className="btn btn--quiet" style={{ marginTop: 10 }} onClick={() => setItem((cur) => randomClaim(cur.claim))}>
          Show another claim
        </button>
      </div>
    </div>
  );
}

// After the verdict: take the final call, reveal the answer, update running stats.
export function TruthReveal({ truth, winner }) {
  const [finalVote, setFinalVote] = useState(null);
  const [stats, setStats] = useState(null);

  // The judge "calls" true when PRO wins, false when CON wins; a tie makes no call.
  const judgeCall = winner === "PRO" ? true : winner === "CON" ? false : null;

  const reveal = (vote) => {
    const s = loadTruthStats();
    const next = {
      played: s.played + 1,
      beforeRight: s.beforeRight + (truth.initialVote === truth.answer ? 1 : 0),
      afterRight: s.afterRight + (vote === truth.answer ? 1 : 0),
      judgeCalls: s.judgeCalls + (judgeCall === null ? 0 : 1),
      judgeRight: s.judgeRight + (judgeCall === truth.answer ? 1 : 0),
    };
    saveTruthStats(next);
    setStats(next);
    setFinalVote(vote);
  };

  const mark = (right) => (right ? "right" : "wrong");

  return (
    <section className="panel truth" aria-labelledby="truth-reveal-title">
      <h2 id="truth-reveal-title" className="dialog__title">Truth Mode</h2>
      <p className="claim" style={{ fontSize: "1.3rem" }}>{truth.claim}</p>

      {finalVote === null ? (
        <>
          <p className="truth__why">
            Before the debate you said <strong>{label(truth.initialVote)}</strong>. What's your final call?
          </p>
          <div className="vote">
            <button className="btn" onClick={() => reveal(true)}>True</button>
            <button className="btn" onClick={() => reveal(false)}>False</button>
          </div>
        </>
      ) : (
        <div role="status">
          <p className={`truth__answer truth__answer--${truth.answer ? "true" : "false"}`}>It's {label(truth.answer)}.</p>
          <p className="truth__why">{truth.why}</p>
          <ul className="truth__tally">
            <li>Before the debate you were {mark(truth.initialVote === truth.answer)}. After it, {mark(finalVote === truth.answer)}.</li>
            <li>Judge: {judgeCall === null ? "called it a draw" : mark(judgeCall === truth.answer)}</li>
          </ul>
          {stats && (
            <p className="truth__stats">
              Across your {stats.played} Truth Mode debate{stats.played === 1 ? "" : "s"}: right{" "}
              <strong>{pct(stats.beforeRight, stats.played)}</strong> of the time before the debate,{" "}
              <strong>{pct(stats.afterRight, stats.played)}</strong> after.
              {stats.judgeCalls > 0 && (
                <> The judge was right <strong>{pct(stats.judgeRight, stats.judgeCalls)}</strong> of the time.</>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
