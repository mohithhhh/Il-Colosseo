export default function ResearchPanel({ research }) {
  if (!research) return null;
  const { query, sources } = research;

  return (
    <div
      className="glass rounded-xl"
      style={{
        padding: "10px 14px",
        marginBottom: "12px",
        animation: "slideDown 0.3s ease forwards",
      }}
    >
      <p
        style={{
          fontSize: "0.72rem",
          fontWeight: 300,
          color: "rgba(255,255,255,0.4)",
          marginBottom: sources.length ? "8px" : 0,
          margin: sources.length ? "0 0 8px" : 0,
        }}
      >
        Searching: {query}
      </p>

      {sources.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {sources.map((src, i) => (
            <div
              key={i}
              className="glass-pill"
              style={{
                padding: "3px 10px",
                fontSize: "0.68rem",
                fontWeight: 300,
                color: "rgba(255,255,255,0.35)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                animation: `fadeIn 0.2s ease ${i * 300}ms both`,
              }}
            >
              {src.title.length > 40 ? src.title.slice(0, 40) + "…" : src.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
