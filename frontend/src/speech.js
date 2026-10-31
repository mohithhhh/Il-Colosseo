export const NAME = { PRO: "Maximus", CON: "Nexus", JUDGE: "Arbitrus" };
export const INITIAL = { PRO: "M", CON: "N", JUDGE: "A" };

export const sideName = (side, humanSide) => (side === humanSide ? "You" : NAME[side]);

// streamWords rebuilds the text word by word, so compare word counts, not strings.
export const doneStreaming = ({ text, displayText }) =>
  !!text && displayText.split(" ").length >= text.split(" ").filter(Boolean).length;

// "researching" | "speaking" | "done" | null (nothing yet) for one side's turn in a round.
export function phase(turn) {
  if (!turn) return null;
  if (turn.text) return doneStreaming(turn) ? "done" : "speaking";
  return turn.research ? "researching" : null;
}

// Gemini sometimes marks titles with *asterisks*; split into [plain, emphasised, plain, ...].
export const emphasis = (line) => line.split(/\*([^*\n]+)\*/);

// Speeches arrive as "• point" lines. Split them so each renders as its own list item.
export function toLines(text) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[•*-]\s*/.test(l));
  return {
    bulleted: bullets.length > 0 && bullets.length >= lines.length - 1,
    lines: lines.map((l) => l.replace(/^[•*-]\s*/, "")),
  };
}
