const caption = {
  fontSize: "0.6rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.28)",
  fontWeight: 500,
};

// Concordia, the mediator: what both sides could endorse after the debate, revised once
// after each side objected to the first draft.
export default function CommonGroundPanel({ data, humanSide }) {
  if (!data?.statement) return null;
  const name = (side) => (side === humanSide ? "You" : side === "PRO" ? "Maximus" : "Nexus");

  return (
    <div className="glass rounded-2xl fade-in w-full" style={{ padding: "20px 24px" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/70" style={{ fontWeight: 500, fontSize: "0.75rem", letterSpacing: "0.06em" }}>
          Concordia · Common ground
        </span>
      </div>
      <div style={{ height: "1px", background: "var(--glass-divider)", marginBottom: "16px" }} />

      <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.8, color: "rgba(255,255,255,0.88)", fontWeight: 300 }}>
        {data.statement}
      </p>

      {data.disputed && (
        <div style={{ marginTop: "16px" }}>
          <span style={caption}>Still disputed</span>
          <p style={{ margin: "6px 0 0", fontSize: "0.82rem", lineHeight: 1.7, color: "rgba(212,169,106,0.8)", fontStyle: "italic" }}>
            {data.disputed}
          </p>
        </div>
      )}

      {data.objections && (
        <details style={{ marginTop: "14px" }}>
          <summary style={{ ...caption, cursor: "pointer" }}>Objections to the first draft</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
            {["PRO", "CON"].map((side) =>
              data.objections[side] ? (
                <p key={side} style={{ margin: 0, fontSize: "0.78rem", lineHeight: 1.6, color: "rgba(255,255,255,0.55)" }}>
                  <strong style={{ fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>{name(side)}:</strong>{" "}
                  {data.objections[side]}
                </p>
              ) : null
            )}
          </div>
        </details>
      )}
    </div>
  );
}
