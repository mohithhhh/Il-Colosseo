export default function ResearchPanel({ research }) {
  if (!research) return null;
  const { queries, sources, wikipedia_anchor, claims } = research;

  return (
    <div
      className="glass rounded-xl"
      style={{
        padding: "10px 14px",
        marginBottom: "12px",
        animation: "slideDown 0.3s ease forwards",
      }}
    >
      {/* Query pills — staggered 200ms each */}
      {queries && queries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBottom: "8px" }}>
          {queries.map((q, i) => (
            <p
              key={i}
              style={{
                fontSize: "0.72rem",
                fontWeight: 300,
                color: "rgba(255,255,255,0.4)",
                margin: 0,
                animation: `fadeIn 0.2s ease ${i * 200}ms both`,
              }}
            >
              {i === 0 ? "Searching: " : "↳ "}
              {q}
            </p>
          ))}
        </div>
      )}

      {/* Badges row */}
      {(wikipedia_anchor || (claims && claims.length > 0)) && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          {wikipedia_anchor && (
            <span
              style={{
                fontSize: "0.6rem",
                fontWeight: 500,
                letterSpacing: "0.06em",
                padding: "2px 8px",
                borderRadius: "9999px",
                background: "rgba(45,212,191,0.08)",
                border: "1px solid rgba(45,212,191,0.22)",
                color: "rgba(45,212,191,0.72)",
                whiteSpace: "nowrap",
              }}
            >
              Wikipedia anchored
            </span>
          )}
          {claims && claims.length > 0 && (
            <span
              style={{
                fontSize: "0.62rem",
                fontWeight: 300,
                color: "rgba(255,255,255,0.28)",
              }}
            >
              {claims.length} claims extracted
            </span>
          )}
        </div>
      )}

      {/* Source pills */}
      {sources && sources.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {sources
            .filter((s) => !s.is_full_article)
            .map((src, i) => (
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
