import { useState } from "react";
import ResearchPanel from "./ResearchPanel";
import SpeechText from "./SpeechText";
import { NAME, INITIAL, phase } from "../speech";

const FLAG_LABEL = {
  cherry_pick: "Cherry-picked",
  missing_context: "Missing context",
  loaded_framing: "Loaded framing",
  false_balance: "False balance",
  overgeneralization: "Overgeneralization",
  unsupported: "Unsupported",
};

const STATE = {
  researching: "Researching",
  speaking: "Speaking",
  done: null,
};

// Verified quotes (found verbatim in a fetched source, or not) and Manipulation Watch
// flags: persuasion that misleads without stating anything false.
function SpeechAnalysis({ quotes, flags }) {
  if (!quotes?.length && !flags?.length) return null;
  return (
    <ul className="notes" aria-label="Fact check">
      {quotes?.map((q, i) =>
        q.verified ? (
          <li key={`q${i}`} className="note note--verified">
            <span className="note__icon" aria-hidden="true">✓</span>
            <span>
              Quote verified in{" "}
              <a href={q.url} target="_blank" rel="noopener noreferrer">{q.source_title || "the source"}</a>
            </span>
          </li>
        ) : (
          <li key={`q${i}`} className="note note--unverified">
            <span className="note__icon" aria-hidden="true">?</span>
            <span>Couldn't find this quote in the sources: <q>{q.quote}</q></span>
          </li>
        )
      )}
      {flags?.map((f, i) => (
        <li key={`f${i}`} className="note note--flag" title={f.excerpt ? `"${f.excerpt}"` : undefined}>
          <span className="note__icon" aria-hidden="true">⚑</span>
          <span><strong>{FLAG_LABEL[f.type] || f.type}.</strong> {f.note}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AgentCard({ agent, data }) {
  const [showSources, setShowSources] = useState(false);
  const side = agent === "PRO" ? "pro" : "con";
  const p = phase(data);
  const hasSources = data.sources?.length > 0;
  const label = data.human ? "You" : NAME[agent];
  const state = data.human ? "Your speech" : STATE[p];

  return (
    <article className={`panel speech speech--${side} ${p === "speaking" || p === "researching" ? "is-speaking" : ""} ${p ? "" : "is-idle"}`}>
      <header className="speech__head">
        <span className={`medallion medallion--sm medallion--${side} ${p === "speaking" ? "is-live" : ""}`} aria-hidden="true">
          {data.human ? "Y" : INITIAL[agent]}
        </span>
        <div className="speech__who">
          <div className="speech__name">{label}</div>
          {state && <div className="speech__state">{state}{p === "researching" && "…"}</div>}
        </div>
        {hasSources && p === "done" && (
          <button className="speech__toggle" aria-expanded={showSources} onClick={() => setShowSources((s) => !s)}>
            {data.sources.length} source{data.sources.length === 1 ? "" : "s"}
          </button>
        )}
      </header>

      {showSources && hasSources && (
        <ul className="sources">
          {data.sources.map((src, i) => (
            <li key={i}>
              <a href={src.url} target="_blank" rel="noopener noreferrer">{src.title || src.url}</a>
            </li>
          ))}
        </ul>
      )}

      <ResearchPanel research={data.research} />

      <div className="speech__body">
        {data.displayText ? (
          <SpeechText text={data.displayText} />
        ) : (
          !data.research && <p className="speech__waiting">Hasn't spoken yet.</p>
        )}
      </div>

      {p === "done" && <SpeechAnalysis quotes={data.quotes} flags={data.flags} />}
    </article>
  );
}
