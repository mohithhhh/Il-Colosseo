import AgentCard from "./AgentCard";

export default function RoundRow({ roundData, curveball }) {
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Round label with flanking divider lines */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{ flex: 1, height: "1px", background: "var(--glass-divider)" }} />
        <span
          style={{
            fontSize: "0.68rem",
            fontWeight: 500,
            color: "rgba(255,255,255,0.3)",
            letterSpacing: "0.1em",
          }}
        >
          ROUND {roundData.round}
        </span>
        <div style={{ flex: 1, height: "1px", background: "var(--glass-divider)" }} />
      </div>

      {/* PRO and CON cards side by side */}
      <div style={{ display: "flex", gap: "16px" }}>
        <AgentCard agent="PRO" data={roundData.PRO} round={roundData.round} curveball={curveball} />
        <AgentCard agent="CON" data={roundData.CON} round={roundData.round} curveball={curveball} />
      </div>
    </div>
  );
}
