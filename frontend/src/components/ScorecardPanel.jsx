// Rubric scorecard — paired bars per criterion. Mark colors validated for CVD separation
// against the dark arena surface (dataviz validate_palette.js); text stays in neutral ink.
const SERIES = { PRO: "#3b82f6", CON: "#ef4444" };
const CRITERIA = [
  ["evidence", "Evidence"],
  ["rebuttal", "Rebuttal"],
  ["logic", "Logic"],
  ["clarity", "Clarity"],
  ["responsiveness", "Responsiveness"],
];

const label = (side, humanSide) =>
  side === humanSide ? "You" : side === "PRO" ? "Maximus" : "Nexus";

function Bar({ side, value, name, criterion }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }} title={`${name} · ${criterion}: ${value}/10`}>
      <div style={{ flex: 1, height: "6px", borderRadius: "4px", background: "rgba(255,255,255,0.06)" }}>
        <div
          style={{
            width: `${value * 10}%`,
            height: "100%",
            borderRadius: "4px",
            background: SERIES[side],
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <span style={{ width: "18px", textAlign: "right", fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>
        {value}
      </span>
    </div>
  );
}

export default function ScorecardPanel({ scores, humanSide }) {
  if (!scores?.PRO || !scores?.CON) return null;
  const total = (side) => CRITERIA.reduce((sum, [key]) => sum + (scores[side][key] ?? 0), 0);

  return (
    <div className="glass rounded-2xl fade-in w-full" style={{ padding: "20px 24px" }}>
      <div className="flex items-center justify-between mb-3" style={{ flexWrap: "wrap", gap: "8px" }}>
        <span className="text-white/70" style={{ fontWeight: 500, fontSize: "0.75rem", letterSpacing: "0.06em" }}>
          Scorecard
        </span>
        {/* Legend — identity is never color alone */}
        <div style={{ display: "flex", gap: "14px", fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>
          {["PRO", "CON"].map((side) => (
            <span key={side} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: SERIES[side] }} />
              {label(side, humanSide)} · {total(side)}/50
            </span>
          ))}
        </div>
      </div>
      <div style={{ height: "1px", background: "var(--glass-divider)", marginBottom: "14px" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {CRITERIA.map(([key, name]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ width: "110px", flexShrink: 0, fontSize: "0.72rem", color: "rgba(255,255,255,0.55)" }}>
              {name}
            </span>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
              {["PRO", "CON"].map((side) => (
                <Bar key={side} side={side} value={scores[side][key] ?? 0} name={label(side, humanSide)} criterion={name} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
