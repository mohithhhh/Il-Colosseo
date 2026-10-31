import SpeechText from "./SpeechText";
import { doneStreaming, sideName } from "../speech";

function winnerLine(winner, humanSide) {
  if (winner === "TIE") return "A draw";
  if (winner === humanSide) return "You win";
  return `${sideName(winner, humanSide)} wins`;
}

// Arbitrus's verdict. The winner is carved in only once the reasoning has been read out.
export default function JudgePanel({ data, curveball, humanSide }) {
  const done = doneStreaming(data);

  return (
    <section className="panel verdict" aria-labelledby="verdict-title">
      <header className="verdict__head">
        <span className="medallion medallion--judge" aria-hidden="true">A</span>
        <div>
          <h2 id="verdict-title" className="verdict__by">The verdict</h2>
          <span className="label">from Arbitrus, the judge</span>
        </div>
      </header>

      {done && data.winner && (
        <p className={`verdict__winner verdict__winner--${data.winner.toLowerCase()}`} role="status">
          {winnerLine(data.winner, humanSide)}
        </p>
      )}

      <div className="verdict__text">
        {data.displayText ? (
          // The "Winner: X" line is for the backend's parser; the inscription above says it.
          <SpeechText text={data.displayText.replace(/^\s*\**Winner:.*$/im, "")} />
        ) : (
          <p className="label">Weighing the arguments…</p>
        )}
      </div>

      {done && data.citations?.length > 0 && (
        <div className="cites">
          {data.citations.map((c, i) => (
            <a key={i} href={c.url} target="_blank" rel="noopener noreferrer">{c.title || c.domain || c.url}</a>
          ))}
        </div>
      )}

      {curveball && (
        <p className="verdict__challenge">
          <span className="label">The crowd's challenge was</span>
          <q>{curveball}</q>
        </p>
      )}
    </section>
  );
}
