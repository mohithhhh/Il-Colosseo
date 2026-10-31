import { useEffect, useRef } from "react";
import { useLiveVoice } from "../hooks/useLiveVoice";
import { useEscape } from "../useEscape";
import { NAME, INITIAL } from "../speech";

const ROLE = { PRO: "argues for", CON: "argues against", JUDGE: "judges" };
const MEDALLION = { PRO: "pro", CON: "con", JUDGE: "judge" };

// Overlay for a live, real-time voice conversation with one debate agent. Separate from
// the scripted PRO/CON/JUDGE SSE debate.
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
  useEscape(handleClose);

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="live-title">
        <button className="dialog__close" onClick={handleClose} aria-label="Close">×</button>
        <h2 id="live-title" className="dialog__title">Live voice</h2>

        {status === "idle" && (
          <>
            <p className="dialog__lede">
              Talk to a gladiator out loud, in real time{topic ? <> about <q>{topic}</q></> : null}. Your browser will ask
              for the microphone.
            </p>
            <div className="gladiators">
              {["PRO", "CON", "JUDGE"].map((a) => (
                <button key={a} className="gladiator" onClick={() => connect(a, topic)}>
                  <span className={`medallion medallion--${MEDALLION[a]}`} aria-hidden="true">{INITIAL[a]}</span>
                  <span className="gladiator__name">{NAME[a]}</span>
                  <span className="gladiator__role">{ROLE[a]}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {status === "connecting" && (
          <p className="status-line">
            Connecting to {NAME[agent]}
            <span className="dots" aria-hidden="true"><i /><i /><i /></span>
          </p>
        )}

        {status === "error" && (
          <>
            <p className="alert" role="alert">{error || "The connection failed. Close this and try again."}</p>
            <button className="btn" style={{ marginTop: 14 }} onClick={handleClose}>Close</button>
          </>
        )}

        {(status === "live" || status === "ended") && (
          <>
            <div className="live-status" role="status">
              <span className={`medallion medallion--sm medallion--${MEDALLION[agent]} ${isAgentSpeaking ? "is-live" : ""}`} aria-hidden="true">
                {INITIAL[agent]}
              </span>
              {status === "ended"
                ? `Your session with ${NAME[agent]} has ended.`
                : isAgentSpeaking
                  ? `${NAME[agent]} is speaking`
                  : "Listening. Go ahead and speak."}
            </div>

            <div ref={scrollRef} className="transcript">
              {transcripts.length === 0 && <p className="label">Say something to begin.</p>}
              {transcripts.map((t, i) => (
                <div key={i}>
                  <span className="transcript__who">{t.role === "agent" ? NAME[agent] : "You"}</span>
                  <span className={t.role === "agent" ? "transcript__agent" : undefined}>{t.text}</span>
                </div>
              ))}
            </div>

            <button className="btn" style={{ width: "100%" }} onClick={handleClose}>
              {status === "ended" ? "Close" : "End the conversation"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
