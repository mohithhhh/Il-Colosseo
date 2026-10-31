import { useState } from "react";
import { loadTruthStats, saveTruthStats, randomClaim } from "../truth";

// Truth Mode — debate as a truth-finding tool (Khan et al., "Debating with More Persuasive
// LLMs Leads to More Truthful Answers"). Claims have a known answer; the viewer calls it
// before and after the debate, and we track whether the debate made them (and the judge)
// more accurate. PRO always argues the claim is true.
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "—");

const voteBtn = (active) => ({
  flex: 1,
  padding: "10px 0",
  borderRadius: "100px",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)",
  background: active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.2)",
  cursor: "pointer",
});

const caption = {
  fontSize: "0.6rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.35)",
  fontWeight: 500,
};

// Landing overlay: show a claim, take the viewer's call, then start the debate.
export function TruthStart({ onStart, onClose }) {
  const [item, setItem] = useState(() => randomClaim());
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", padding: "16px" }}
      onClick={onClose}
    >
      <div className="glass rounded-2xl fade-in" style={{ maxWidth: "520px", width: "100%", padding: "24px" }} onClick={(e) => e.stopPropagation()}>
        <span style={caption}>Truth Mode · true or false?</span>
        <p className="font-cinzel" style={{ margin: "14px 0 6px", fontSize: "1.15rem", lineHeight: 1.5, color: "rgba(255,255,255,0.92)" }}>
          {item.claim}
        </p>
        <p style={{ margin: "0 0 18px", fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
          Make your call now. Maximus argues it's true, Nexus argues it's false — then you call it again and we reveal the answer.
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="font-cinzel" style={voteBtn(false)} onClick={() => onStart(item, true)}>True</button>
          <button className="font-cinzel" style={voteBtn(false)} onClick={() => onStart(item, false)}>False</button>
        </div>
        <button
          onClick={() => setItem((cur) => randomClaim(cur.claim))}
          style={{ marginTop: "14px", background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "0.72rem", cursor: "pointer" }}
        >
          ↻ Another claim
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

  const label = (v) => (v ? "True" : "False");

  return (
    <div className="glass rounded-2xl fade-in w-full" style={{ padding: "20px 24px" }}>
      <span style={caption}>Truth Mode</span>
      <p style={{ margin: "10px 0 16px", fontSize: "0.9rem", color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>
        {truth.claim}
      </p>

      {finalVote === null ? (
        <>
          <p style={{ margin: "0 0 12px", fontSize: "0.78rem", color: "rgba(255,255,255,0.5)" }}>
            You said <strong style={{ color: "rgba(255,255,255,0.8)" }}>{label(truth.initialVote)}</strong> before the debate. What's your final call?
          </p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="font-cinzel" style={voteBtn(false)} onClick={() => reveal(true)}>True</button>
            <button className="font-cinzel" style={voteBtn(false)} onClick={() => reveal(false)}>False</button>
          </div>
        </>
      ) : (
        <div className="fade-in">
          <p className="font-cinzel" style={{ margin: "0 0 6px", fontSize: "1.1rem", color: "rgba(255,255,255,0.95)" }}>
            It's {label(truth.answer)}.
          </p>
          <p style={{ margin: "0 0 16px", fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>{truth.why}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.78rem", color: "rgba(255,255,255,0.7)" }}>
            <span>Before the debate: {truth.initialVote === truth.answer ? "✓ right" : "✗ wrong"} · After: {finalVote === truth.answer ? "✓ right" : "✗ wrong"}</span>
            <span>Judge: {judgeCall === null ? "no call (tie)" : judgeCall === truth.answer ? "✓ right" : "✗ wrong"}</span>
          </div>
          {stats && (
            <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--glass-divider)", fontSize: "0.75rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
              Across your {stats.played} Truth Mode debate{stats.played === 1 ? "" : "s"}: right{" "}
              <strong style={{ color: "rgba(255,255,255,0.85)" }}>{pct(stats.beforeRight, stats.played)}</strong> before the debate →{" "}
              <strong style={{ color: "rgba(255,255,255,0.85)" }}>{pct(stats.afterRight, stats.played)}</strong> after.
              Judge accuracy {pct(stats.judgeRight, stats.judgeCalls)}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
