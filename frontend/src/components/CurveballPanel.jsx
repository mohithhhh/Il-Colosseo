import { useState, useEffect, useRef } from "react";

const hasSpeechAPI =
  typeof window !== "undefined" &&
  !!(window.SpeechRecognition || window.webkitSpeechRecognition);

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

// The audience challenge between rounds II and III, and the human's turn in Human vs AI
// (variant "pro"/"con", longer limit). Dictation appends to whatever is already typed.
export default function CurveballPanel({
  voiceDraft,
  isListening,
  onStartListening,
  onSubmit,
  variant = "crowd",
  title = "Challenge the gladiators",
  hint = "Both must answer it in round III. Ask a question, add a fact, or push back.",
  placeholder = "What should they have to address?",
  submitLabel = "Send the challenge",
  maxLength = 280,
}) {
  const [text, setText] = useState("");
  const base = useRef("");

  useEffect(() => {
    if (isListening) base.current = text.trim();
    // Only snapshot when dictation starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  useEffect(() => {
    if (voiceDraft) setText([base.current, voiceDraft].filter(Boolean).join(" ").slice(0, maxLength));
  }, [voiceDraft, maxLength]);

  const content = text.trim();

  return (
    <form
      className={`panel composer composer--${variant}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (content) onSubmit(content);
      }}
    >
      <h3 id={`composer-${variant}`} className="composer__title">{title}</h3>
      {hint && <p className="composer__hint">{hint}</p>}
      <textarea
        aria-labelledby={`composer-${variant}`}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        rows={maxLength > 280 ? 7 : 3}
        autoFocus
      />
      <div className="composer__row">
        {hasSpeechAPI && (
          <button type="button" className={`btn mic ${isListening ? "is-listening" : ""}`} onClick={onStartListening} aria-pressed={isListening}>
            <MicIcon />
            {isListening ? "Listening" : "Dictate"}
          </button>
        )}
        <span className="composer__count">{text.length}/{maxLength}</span>
        <button type="submit" className="btn btn--primary" disabled={!content}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
