export default function ReflectionCard({ agent, displayText }) {
  if (!displayText) return null;

  const label = agent === "PRO" ? "Maximus" : "Nexus";

  return (
    <div
      className="glass rounded-xl fade-in"
      style={{ flex: 1, minWidth: 0, padding: "12px 16px" }}
    >
      <span
        style={{
          display: "block",
          fontSize: "0.68rem",
          fontWeight: 300,
          color: "rgba(255,255,255,0.3)",
          marginBottom: "6px",
        }}
      >
        After reflection · {label}
      </span>
      <p
        style={{
          fontSize: "0.8rem",
          fontWeight: 300,
          color: "rgba(255,255,255,0.65)",
          lineHeight: 1.7,
          margin: 0,
        }}
      >
        {displayText}
      </p>
    </div>
  );
}
