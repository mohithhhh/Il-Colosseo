import { useState } from "react";

const PRESETS = [
  "AI Singularity",
  "Remote Work Culture",
  "Sustainability",
  "Digital Privacy",
];

export default function TopicInput({ onStart, disabled }) {
  const [topic, setTopic] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = topic.trim();
    if (trimmed) onStart(trimmed);
  };

  const handlePreset = (preset) => {
    setTopic(preset);
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-2xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full flex items-center glass-pill overflow-hidden topic-input-form"
        style={{ padding: "6px 6px 6px 20px" }}
      >
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What's the next great debate?"
          disabled={disabled}
          className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/40 text-sm"
          style={{ fontWeight: 300, fontSize: "0.9rem" }}
        />
        <button
          type="submit"
          disabled={disabled || !topic.trim()}
          className="glass-pill px-5 py-2 text-white/90 text-sm transition-opacity duration-150"
          style={{
            fontWeight: 500,
            fontSize: "0.8rem",
            opacity: disabled || !topic.trim() ? 0.4 : 0.9,
            cursor: disabled || !topic.trim() ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => {
            if (!disabled && topic.trim()) e.currentTarget.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            if (!disabled && topic.trim()) e.currentTarget.style.opacity = "0.9";
          }}
        >
          Begin
        </button>
      </form>

      <div className="flex flex-wrap justify-center gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => handlePreset(preset)}
            disabled={disabled}
            className="glass-pill px-3 py-1 text-white/55 text-xs transition-opacity duration-150"
            style={{
              fontWeight: 300,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.3 : 1,
            }}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
