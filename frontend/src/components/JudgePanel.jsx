import { useRef, useEffect } from "react";

const VERDICT_CLASS = {
  PRO: "verdict-pro",
  CON: "verdict-con",
  TIE: "verdict-tie",
};

const VERDICT_LABEL = {
  PRO: "Pro wins",
  CON: "Con wins",
  TIE: "Tie",
};

export default function JudgePanel({ data, curveball }) {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [data.displayText]);

  const verdictClass = data.winner ? VERDICT_CLASS[data.winner] : "";
  const verdictLabel = data.winner ? VERDICT_LABEL[data.winner] : "";

  return (
    <div
      className="glass rounded-2xl fade-in w-full"
      style={{ padding: "20px 24px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-white/70"
          style={{ fontWeight: 500, fontSize: "0.75rem", letterSpacing: "0.06em" }}
        >
          Arbitrus
        </span>
      </div>

      {/* Divider */}
      <div
        style={{
          height: "1px",
          background: "var(--glass-divider)",
          marginBottom: "16px",
        }}
      />

      {/* Verdict text */}
      <div
        ref={bodyRef}
        className="agent-body"
        style={{
          lineHeight: 1.8,
          fontWeight: 300,
          fontSize: "0.875rem",
          color: "rgba(255,255,255,0.85)",
          maxHeight: "120px",
        }}
      >
        {data.displayText || (
          <span style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
            Deliberating...
          </span>
        )}
      </div>

      {/* Grounding citations */}
      {data.citations && data.citations.length > 0 && (
        <div style={{ marginTop: "14px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {data.citations.map((c, i) => (
            <a
              key={i}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "0.68rem",
                fontWeight: 400,
                color: "rgba(255,255,255,0.4)",
                textDecoration: "none",
                padding: "4px 9px",
                background: "rgba(255,255,255,0.05)",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                letterSpacing: "0.02em",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
            >
              {c.title || c.domain || c.url}
            </a>
          ))}
        </div>
      )}

      {/* Audience challenge section */}
      {curveball && (
        <div style={{ marginTop: "16px" }}>
          <div style={{ height: "0.5px", background: "rgba(255,255,255,0.1)", marginBottom: "10px" }} />
          <span
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.28)",
              fontWeight: 500,
            }}
          >
            On the audience challenge
          </span>
          <p
            style={{
              marginTop: "8px",
              marginBottom: 0,
              fontStyle: "italic",
              fontSize: "0.82rem",
              color: "rgba(212,169,106,0.65)",
              lineHeight: 1.7,
            }}
          >
            "{curveball}"
          </p>
        </div>
      )}

      {/* Verdict banner */}
      {data.winner && (
        <div
          className={`rounded-xl mt-4 flex items-center justify-center backdrop-filter-blur ${verdictClass}`}
          style={{
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            padding: "10px 20px",
          }}
        >
          <span
            className="text-white/80"
            style={{ fontWeight: 500, fontSize: "0.8rem" }}
          >
            {verdictLabel}
          </span>
        </div>
      )}
    </div>
  );
}
