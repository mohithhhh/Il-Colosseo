import { useState, useEffect } from "react";

const hasSpeechAPI =
  typeof window !== "undefined" &&
  !!(window.SpeechRecognition || window.webkitSpeechRecognition);

const MicIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

export default function CurveballPanel({
  curveballDraft,
  isListening,
  onStartListening,
  onSubmit,
}) {
  const [textInput, setTextInput] = useState("");
  const [editedDraft, setEditedDraft] = useState("");

  // Sync incoming voice transcript into local editable state
  useEffect(() => {
    setEditedDraft(curveballDraft || "");
  }, [curveballDraft]);

  const activeContent = editedDraft.trim() || textInput.trim();
  const canSubmit = activeContent.length > 0;

  const handleSubmit = () => {
    const content = editedDraft.trim() || textInput.trim();
    if (!content) return;
    onSubmit(content);
  };

  return (
    <div
      className="glass rounded-2xl fade-in"
      style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}
    >
      {/* Label */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{ flex: 1, height: "1px", background: "var(--glass-divider)" }} />
        <span
          style={{
            fontSize: "0.68rem",
            fontWeight: 500,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Audience challenge
        </span>
        <div style={{ flex: 1, height: "1px", background: "var(--glass-divider)" }} />
      </div>

      {/* Two-column inputs */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>

        {/* Left — microphone (only if Speech API available) */}
        {hasSpeechAPI && (
          <div
            style={{
              flex: "1 1 180px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <button
              onClick={onStartListening}
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: isListening
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(255,255,255,0.07)",
                border: `1px solid ${isListening ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)"}`,
                color: "rgba(255,255,255,0.75)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: isListening ? "mic-pulse 0.8s ease-in-out infinite alternate" : "none",
                transition: "background 0.2s, border-color 0.2s",
              }}
            >
              <MicIcon />
            </button>
            <span
              style={{
                fontSize: "0.62rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: isListening ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.3)",
                transition: "color 0.2s",
              }}
            >
              {isListening ? "Listening..." : "Speak your challenge"}
            </span>

            {/* Editable voice transcript pill */}
            {editedDraft && (
              <input
                value={editedDraft}
                onChange={(e) => setEditedDraft(e.target.value.slice(0, 280))}
                style={{
                  width: "100%",
                  padding: "6px 12px",
                  borderRadius: "100px",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "rgba(255,255,255,0.75)",
                  fontSize: "0.78rem",
                  fontStyle: "italic",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>
        )}

        {/* Right — text input */}
        <div
          style={{
            flex: "1 1 180px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value.slice(0, 280))}
            placeholder="Or type your challenge..."
            rows={3}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.8)",
              fontSize: "0.82rem",
              lineHeight: 1.6,
              resize: "none",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.28)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)")}
          />
          <span
            style={{
              fontSize: "0.625rem",
              color: "rgba(255,255,255,0.22)",
              textAlign: "right",
              paddingRight: "2px",
            }}
          >
            {textInput.length}/280
          </span>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="font-cinzel"
        style={{
          width: "100%",
          padding: "11px 0",
          borderRadius: "100px",
          fontSize: "0.72rem",
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: canSubmit ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
          background: canSubmit ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${canSubmit ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)"}`,
          cursor: canSubmit ? "pointer" : "default",
          transition: "background 0.2s, color 0.2s, border-color 0.2s",
        }}
        onMouseEnter={(e) => {
          if (!canSubmit) return;
          e.currentTarget.style.background = "rgba(255,255,255,0.14)";
          e.currentTarget.style.color = "rgba(255,255,255,0.95)";
        }}
        onMouseLeave={(e) => {
          if (!canSubmit) return;
          e.currentTarget.style.background = "rgba(255,255,255,0.09)";
          e.currentTarget.style.color = "rgba(255,255,255,0.85)";
        }}
      >
        Throw it into the arena
      </button>
    </div>
  );
}
