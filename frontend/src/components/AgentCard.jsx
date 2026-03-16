import { useRef, useEffect, useState } from "react";
import ResearchPanel from "./ResearchPanel";

const DISPLAY_NAME = { PRO: "Maximus", CON: "Nexus" };

export default function AgentCard({ agent, data, round, curveball }) {
  const bodyRef = useRef(null);
  const [popScore, setPopScore] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const prevScore = useRef(data.score);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [data.displayText]);

  useEffect(() => {
    if (data.score !== prevScore.current) {
      prevScore.current = data.score;
      setPopScore(true);
      const t = setTimeout(() => setPopScore(false), 300);
      return () => clearTimeout(t);
    }
  }, [data.score]);

  const label = DISPLAY_NAME[agent] || agent;
  const hasSources = data.sources && data.sources.length > 0;

  return (
    <div
      className="glass rounded-2xl flex flex-col"
      style={{ flex: 1, minWidth: 0, padding: "20px 24px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-white/70"
          style={{ fontWeight: 500, fontSize: "0.75rem", letterSpacing: "0.06em" }}
        >
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {curveball && round === 3 && (
            <div
              style={{
                padding: "2px 8px",
                borderRadius: "9999px",
                background: "rgba(212,169,106,0.1)",
                border: "1px solid rgba(212,169,106,0.3)",
                fontSize: "0.56rem",
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "rgba(212,169,106,0.85)",
                whiteSpace: "nowrap",
              }}
            >
              Addressing challenge
            </div>
          )}
          {hasSources && (
            <button
              onClick={() => setShowSources((s) => !s)}
              className="glass-pill"
              style={{
                padding: "2px 10px",
                fontSize: "0.62rem",
                fontWeight: 500,
                color: showSources ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)",
                cursor: "pointer",
                letterSpacing: "0.06em",
                transition: "color 0.15s",
              }}
            >
              {showSources ? "▲ sources" : "⊙ sources"}
            </button>
          )}
          <div
            className={`glass-pill px-3 py-0.5 text-white/80 ${popScore ? "score-pop" : ""}`}
            style={{ fontWeight: 500, fontSize: "0.75rem" }}
          >
            {data.score}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "var(--glass-divider)", marginBottom: "14px" }} />

      {/* Sources transparency panel */}
      {showSources && hasSources && (
        <div
          className="fade-in"
          style={{
            marginBottom: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {data.sources.map((src, i) => (
            <a
              key={i}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                fontSize: "0.7rem",
                fontWeight: 400,
                color: "rgba(255,255,255,0.45)",
                textDecoration: "none",
                padding: "5px 10px",
                background: "rgba(255,255,255,0.05)",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                letterSpacing: "0.02em",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
            >
              {src.title || src.url}
            </a>
          ))}
        </div>
      )}

      {/* Research panel — slides in before speech text */}
      <ResearchPanel research={data.research} />

      {/* Speech text */}
      <div
        ref={bodyRef}
        style={{
          lineHeight: 1.8,
          fontWeight: 400,
          fontSize: "0.875rem",
          color: "rgba(255,255,255,0.85)",
        }}
      >
        {data.displayText || (
          <span style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
            Waiting...
          </span>
        )}
      </div>
    </div>
  );
}
