import { NAME } from "../speech";

// A debater's reflection after the verdict.
export default function ReflectionCard({ agent, displayText }) {
  if (!displayText) return null;
  return (
    <div className={`panel thought thought--${agent.toLowerCase()}`}>
      <p className="thought__by">{NAME[agent]}, on reflection</p>
      <p>{displayText}</p>
    </div>
  );
}
