import { toLines, emphasis } from "../speech";

const Inline = ({ line }) =>
  emphasis(line).map((part, i) => (i % 2 ? <em key={i}>{part}</em> : part));

// Renders a speech or verdict: "•" lines become a list, anything else stays as paragraphs.
export default function SpeechText({ text }) {
  const { bulleted, lines } = toLines(text);
  if (bulleted) {
    return (
      <ul>
        {lines.map((l, i) => <li key={i}><Inline line={l} /></li>)}
      </ul>
    );
  }
  return lines.map((l, i) => <p key={i}><Inline line={l} /></p>);
}
