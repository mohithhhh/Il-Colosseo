import { useRef, useEffect, useState } from "react";
import { useDebate } from "./hooks/useDebate";
import TopicInput from "./components/TopicInput";
import RoundRow from "./components/RoundRow";
import JudgePanel from "./components/JudgePanel";
import ReflectionCard from "./components/ReflectionCard";
const BG = "url('/bg.png')";
const SCRIM_LANDING = "rgba(8, 8, 12, 0.55)";
const SCRIM_ARENA = "rgba(8, 8, 12, 0.80)";

export default function App() {
  const { state, start, proceed, reset } = useDebate();
  const { status, pendingAction, rounds, judge, reflections, warnings, artifactPath, error } = state;
  const scrollRef = useRef(null);
  const [dismissedWarnings, setDismissedWarnings] = useState([]);

  const isIdle = status === "idle";
  const showJudge = !isIdle && judge.text !== "";
  const showReflections =
    reflections.PRO.displayText !== "" || reflections.CON.displayText !== "";
  const activeWarnings = warnings.filter((_, i) => !dismissedWarnings.includes(i));

  // Auto-scroll arena to bottom when new content appears
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rounds.length, judge.text, reflections.PRO.displayText, reflections.CON.displayText, pendingAction]);

  // ── Landing page ──
  if (isIdle) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: BG,
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: SCRIM_LANDING,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2rem",
            width: "100%",
            padding: "0 24px",
          }}
        >
          <h1
            className="font-cinzel"
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: "2.8rem",
              color: "rgba(255,255,255,0.95)",
              letterSpacing: "0.04em",
            }}
          >
            Il Colosseo
          </h1>
          <p
            style={{
              margin: "-1.6rem 0 0",
              fontWeight: 300,
              fontSize: "0.85rem",
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.06em",
              textAlign: "center",
            }}
          >
            Built for gladiators. Rebuilt for intelligence.
          </p>
          <TopicInput onStart={start} disabled={false} />
          {error && (
            <p
              style={{
                color: "rgba(252,165,165,0.8)",
                fontWeight: 300,
                fontSize: "0.8rem",
                margin: 0,
              }}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Arena page ──
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundImage: BG,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: SCRIM_ARENA,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "20px 32px 0",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
            flexShrink: 0,
          }}
        >
          <h1
            className="font-cinzel"
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.08em",
            }}
          >
            Il Colosseo
          </h1>
          <button
            onClick={reset}
            className="glass-pill px-3 py-1 text-white/40 text-xs"
            style={{ fontWeight: 500, cursor: "pointer", fontSize: "0.72rem" }}
          >
            Reset
          </button>
        </div>

        {/* Warning banners — dismissible frosted glass */}
        {activeWarnings.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px", flexShrink: 0 }}>
            {warnings.map((msg, i) =>
              dismissedWarnings.includes(i) ? null : (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "10px 16px",
                    borderRadius: "12px",
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.22)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                >
                  <span style={{ fontSize: "0.78rem", color: "rgba(251,191,36,0.85)", fontWeight: 400 }}>
                    ⚠ {msg}
                  </span>
                  <button
                    onClick={() => setDismissedWarnings((d) => [...d, i])}
                    style={{
                      background: "none",
                      border: "none",
                      color: "rgba(251,191,36,0.5)",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      lineHeight: 1,
                      padding: "0 2px",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* Scrollable rounds — each round appears below the previous */}
        <div
          ref={scrollRef}
          className="arena-scroll"
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "28px",
            paddingBottom: "32px",
          }}
        >
          {/* Loading state — shown while waiting for first SSE event */}
          {status === "running" && rounds.length === 0 && (
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
              minHeight: "60vh",
            }}>
              <p className="font-cinzel arena-loading-text" style={{
                fontSize: "1rem",
                color: "rgba(255,255,255,0.45)",
                letterSpacing: "0.14em",
                margin: 0,
              }}>
                The gladiators are preparing
              </p>
              <div style={{ display: "flex", gap: "10px" }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="loading-dot"
                    style={{ animationDelay: `${i * 0.25}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {rounds.map((roundData) => (
            <RoundRow key={roundData.round} roundData={roundData} />
          ))}

          {/* Inter-round loading dots */}
          {status === "running" && rounds.length > 0 && !judge.text && (
            <div style={{ display: "flex", justifyContent: "center", gap: "10px", padding: "4px 0" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="loading-dot" style={{ animationDelay: `${i * 0.25}s` }} />
              ))}
            </div>
          )}

          {/* Round / Judge proceed button */}
          {pendingAction !== null && (
            <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 8px" }}>
              <button
                onClick={proceed}
                className="font-cinzel"
                style={{
                  padding: "10px 44px",
                  borderRadius: "100px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.8)",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.13)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.95)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                }}
              >
                {pendingAction === "judge"
                  ? "Judge"
                  : `Start Round ${pendingAction}`}
              </button>
            </div>
          )}

          {showJudge && <JudgePanel data={judge} />}

          {/* Artifact saved pill */}
          {artifactPath && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div
                className="glass-pill"
                style={{
                  padding: "6px 14px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>
                  Debate saved
                </span>
                <span style={{ fontSize: "0.69rem", color: "rgba(255,255,255,0.28)", fontFamily: "monospace" }}>
                  {artifactPath}
                </span>
              </div>
            </div>
          )}

          {showReflections && (
            <div style={{ display: "flex", gap: "16px" }}>
              <ReflectionCard agent="PRO" displayText={reflections.PRO.displayText} />
              <ReflectionCard agent="CON" displayText={reflections.CON.displayText} />
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
