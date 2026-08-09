import { useEffect, useRef } from "react";
import { useLiveVoice } from "../hooks/useLiveVoice";

const DISPLAY_NAME = { PRO: "Maximus", CON: "Nexus", JUDGE: "Arbitrus" };
const GOLD = "rgba(212,169,106,0.85)";

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

// Overlay panel for live, real-time voice conversation with a single debate agent —
// additive "Enter the Arena" mode, separate from the scripted PRO/CON/JUDGE SSE debate.
export default function LiveArenaPanel({ topic, onClose }) {
  const { state, connect, disconnect } = useLiveVoice();
  const { status, agent, transcripts, isAgentSpeaking, error } = state;
  const scrollRef = useRef(null);

  const lastTranscriptText = transcripts[transcripts.length - 1]?.text;
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcripts.length, lastTranscriptText]);

  const handleClose = () => {
    disconnect();
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(8,8,12,0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        className="glass rounded-2xl fade-in"
        style={{
          width: "min(520px, 92vw)",
          maxHeight: "82vh",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="font-cinzel" style={{ margin: 0, fontSize: "1rem", color: "rgba(255,255,255,0.85)", letterSpacing: "0.06em" }}>
            Enter the Arena
          </h2>
          <button
            onClick={handleClose}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "1.2rem", cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
          >
            ×
          </button>
        </div>

        {status === "idle" && (
          <>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
              Speak live with a gladiator. Choose who to face — your microphone will be requested.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              {["PRO", "CON", "JUDGE"].map((a) => (
                <button
                  key={a}
                  onClick={() => connect(a, topic)}
                  className="font-cinzel"
                  style={{
                    flex: 1,
                    padding: "12px 0",
                    borderRadius: "12px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.8)",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    cursor: "pointer",
                    transition: "background 0.2s, color 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.13)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                >
                  {DISPLAY_NAME[a]}
                </button>
              ))}
            </div>
          </>
        )}

        {status === "connecting" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "24px 0" }}>
            <div style={{ display: "flex", gap: "10px" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="loading-dot" style={{ animationDelay: `${i * 0.25}s` }} />
              ))}
            </div>
            <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>
              Connecting to {DISPLAY_NAME[agent]}...
            </span>
          </div>
        )}

        {status === "error" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "16px 0" }}>
            <span style={{ fontSize: "0.8rem", color: "rgba(252,165,165,0.8)", textAlign: "center" }}>
              {error || "Something went wrong."}
            </span>
            <button
              onClick={handleClose}
              className="glass-pill px-3 py-1 text-white/60 text-xs"
              style={{ cursor: "pointer" }}
            >
              Close
            </button>
          </div>
        )}

        {(status === "live" || status === "ended") && (
          <>
            {/* Speaking indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: GOLD,
                  background: "rgba(212,169,106,0.1)",
                  border: `1px solid ${isAgentSpeaking ? GOLD : "rgba(212,169,106,0.3)"}`,
                  animation: isAgentSpeaking ? "mic-pulse 0.8s ease-in-out infinite alternate" : "none",
                }}
              >
                <MicIcon />
              </div>
              <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.6)" }}>
                {status === "ended"
                  ? `Session with ${DISPLAY_NAME[agent]} ended`
                  : isAgentSpeaking
                    ? `${DISPLAY_NAME[agent]} is speaking...`
                    : "Listening — go ahead, speak"}
              </span>
            </div>

            {/* Live transcript */}
            <div
              ref={scrollRef}
              style={{
                flex: 1,
                minHeight: "200px",
                maxHeight: "40vh",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                padding: "12px 4px",
              }}
            >
              {transcripts.length === 0 && (
                <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.28)", fontStyle: "italic" }}>
                  Say something to begin...
                </span>
              )}
              {transcripts.map((t, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>
                    {t.role === "agent" ? DISPLAY_NAME[agent] : "You"}
                  </span>
                  <span style={{ fontSize: "0.85rem", lineHeight: 1.6, color: t.role === "agent" ? GOLD : "rgba(255,255,255,0.8)" }}>
                    {t.text}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={handleClose}
              className="font-cinzel"
              style={{
                padding: "10px 0",
                borderRadius: "100px",
                fontSize: "0.72rem",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.8)",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.18)",
                cursor: "pointer",
              }}
            >
              Leave the Arena
            </button>
          </>
        )}
      </div>
    </div>
  );
}
