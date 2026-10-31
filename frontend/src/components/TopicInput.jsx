import { useState } from "react";

const PRESETS = [
  "AI will create more jobs than it destroys",
  "Remote work beats the office",
  "Social media does more harm than good",
  "Privacy matters more than security",
];

// BCP-47 codes match Sarvam Bulbul v3's supported TTS languages (backend/tts.py).
// "en" keeps the existing English pipeline (Fish Audio) untouched.
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "bn-IN", label: "বাংলা" },
  { code: "kn-IN", label: "ಕನ್ನಡ" },
  { code: "ml-IN", label: "മലയാളം" },
  { code: "mr-IN", label: "मराठी" },
  { code: "gu-IN", label: "ગુજરાતી" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ" },
  { code: "od-IN", label: "ଓଡ଼ିଆ" },
];

// Human vs AI: null = watch two AIs; "PRO"/"CON" = the user argues that side.
const ROLES = [
  { value: null, name: "Watch", hint: "Maximus and Nexus argue. You listen.", cls: "" },
  { value: "PRO", name: "Argue for", hint: "Take Maximus's place and defend the motion.", cls: "role--pro" },
  { value: "CON", name: "Argue against", hint: "Take Nexus's place and oppose it.", cls: "role--con" },
];

export default function TopicInput({ onStart, language, onLanguageChange }) {
  const [topic, setTopic] = useState("");
  const [humanSide, setHumanSide] = useState(null);
  const trimmed = topic.trim();

  return (
    <form
      className="motion"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onStart(trimmed, language, humanSide);
      }}
    >
      <div>
        <label htmlFor="motion" className="label motion__label">The motion</label>
        <div className="motion__field">
          <input
            id="motion"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Type any claim worth fighting over"
            autoComplete="off"
          />
        </div>
        <div className="suggestions">
          {PRESETS.map((preset) => (
            <button key={preset} type="button" className="chip" onClick={() => setTopic(preset)}>
              {preset}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="roles">
        <legend className="label">Your role</legend>
        <div className="roles__grid" role="radiogroup" aria-label="Your role">
          {ROLES.map(({ value, name, hint, cls }) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={humanSide === value}
              className={`role ${cls}`}
              onClick={() => setHumanSide(value)}
            >
              <span className="role__name">{name}</span>
              <span className="role__hint">{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="motion__actions">
        <label className="lang">
          Language
          <select value={language} onChange={(e) => onLanguageChange(e.target.value)}>
            {LANGUAGES.map(({ code, label }) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn--primary" disabled={!trimmed}>
          Begin the debate
        </button>
      </div>
    </form>
  );
}
