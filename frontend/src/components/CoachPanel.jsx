const caption = {
  display: "block",
  fontSize: "0.6rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.3)",
  fontWeight: 500,
  marginBottom: "6px",
};
const body = { margin: 0, fontSize: "0.82rem", lineHeight: 1.7, color: "rgba(255,255,255,0.78)", fontWeight: 300 };

function List({ title, items, marker }) {
  if (!items?.length) return null;
  return (
    <div style={{ flex: "1 1 220px" }}>
      <span style={caption}>{title}</span>
      {items.map((s, i) => (
        <p key={i} style={{ ...body, marginBottom: "4px" }}>
          {marker} {s}
        </p>
      ))}
    </div>
  );
}

// Human vs AI: the coach's feedback on the human's speeches.
export default function CoachPanel({ data }) {
  if (!data) return null;
  return (
    <div className="glass rounded-2xl fade-in w-full" style={{ padding: "20px 24px" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/70" style={{ fontWeight: 500, fontSize: "0.75rem", letterSpacing: "0.06em" }}>
          Your coach report
        </span>
      </div>
      <div style={{ height: "1px", background: "var(--glass-divider)", marginBottom: "16px" }} />

      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
        <List title="What worked" items={data.strengths} marker="+" />
        <List title="Work on" items={data.improve} marker="→" />
      </div>

      {data.missed_rebuttal && (
        <div style={{ marginTop: "16px" }}>
          <span style={caption}>The rebuttal you missed</span>
          <p style={body}>{data.missed_rebuttal}</p>
        </div>
      )}

      {data.champion_rewrite && (
        <div style={{ marginTop: "16px" }}>
          <span style={caption}>How a champion would say it</span>
          <p style={{ ...body, fontStyle: "italic", color: "rgba(212,169,106,0.85)" }}>"{data.champion_rewrite}"</p>
        </div>
      )}
    </div>
  );
}
