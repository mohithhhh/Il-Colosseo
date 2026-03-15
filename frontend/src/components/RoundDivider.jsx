export default function RoundDivider({ round, totalRounds = 3 }) {
  const label = round > 0 ? `R${round}` : "";

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ width: "48px", flexShrink: 0 }}
    >
      {/* Top line */}
      <div
        style={{
          flex: 1,
          width: "1px",
          background: "var(--glass-divider)",
        }}
      />

      {/* Round indicator */}
      <div
        className="glass-pill my-3 flex items-center justify-center"
        style={{
          width: "36px",
          height: "36px",
          flexShrink: 0,
        }}
      >
        <span
          className="text-white/60"
          style={{ fontWeight: 500, fontSize: "0.7rem" }}
        >
          {label}
        </span>
      </div>

      {/* Bottom line */}
      <div
        style={{
          flex: 1,
          width: "1px",
          background: "var(--glass-divider)",
        }}
      />
    </div>
  );
}
