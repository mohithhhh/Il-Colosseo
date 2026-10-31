import { sideName } from "../speech";

// Tale of the tape: each criterion scored 0–10, Maximus's bar grows left from the centre,
// Nexus's grows right. Mark colours validated for CVD separation against the dark surface
// (dataviz validate_palette.js); values and labels stay in neutral ink.
const CRITERIA = [
  ["evidence", "Evidence"],
  ["rebuttal", "Rebuttal"],
  ["logic", "Logic"],
  ["clarity", "Clarity"],
  ["responsiveness", "Responsiveness"],
];

function Track({ side, value, who, criterion }) {
  return (
    <div className={`tape__track tape__track--${side.toLowerCase()}`} title={`${who}, ${criterion}: ${value} out of 10`}>
      <div className="tape__bar" style={{ width: `calc((100% - 2.4em) * ${value / 10})` }} />
      <span className="tape__val">{value}</span>
    </div>
  );
}

export default function ScorecardPanel({ scores, humanSide }) {
  if (!scores?.PRO || !scores?.CON) return null;
  const total = (side) => CRITERIA.reduce((sum, [key]) => sum + (scores[side][key] ?? 0), 0);

  return (
    <section className="panel tape" aria-labelledby="tape-title">
      <div className="tape__head">
        {["PRO", "CON"].map((side, i) => (
          <div key={side} className={`tape__side tape__side--${side.toLowerCase()}`} style={{ order: i * 2 }}>
            <span className="tape__name">{sideName(side, humanSide)}</span>
            <span className="tape__total">
              {total(side)} <small>of 50</small>
            </span>
          </div>
        ))}
        <h2 id="tape-title" className="tape__title" style={{ order: 1 }}>Scorecard</h2>
      </div>

      <div className="tape__rows">
        {CRITERIA.map(([key, name]) => (
          <div key={key} className="tape__row">
            <Track side="PRO" value={scores.PRO[key] ?? 0} who={sideName("PRO", humanSide)} criterion={name} />
            <span className="tape__crit">{name}</span>
            <Track side="CON" value={scores.CON[key] ?? 0} who={sideName("CON", humanSide)} criterion={name} />
          </div>
        ))}
      </div>
    </section>
  );
}
