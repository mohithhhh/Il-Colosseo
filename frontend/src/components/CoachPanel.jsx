function List({ title, items, mark, markClass }) {
  if (!items?.length) return null;
  return (
    <div>
      <span className="label">{title}</span>
      <ul>
        {items.map((s, i) => (
          <li key={i}>
            <span className={markClass} aria-hidden="true">{mark}</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Human vs AI: the coach's feedback on the human's speeches.
export default function CoachPanel({ data }) {
  if (!data) return null;
  return (
    <section className="panel coach" aria-labelledby="coach-title">
      <h2 id="coach-title" className="coach__title">Your coach report</h2>

      <div className="coach__cols">
        <List title="What worked" items={data.strengths} mark="+" markClass="coach__plus" />
        <List title="Work on" items={data.improve} mark="→" markClass="coach__arrow" />
      </div>

      {data.missed_rebuttal && (
        <div className="coach__block">
          <span className="label">The rebuttal you missed</span>
          <p>{data.missed_rebuttal}</p>
        </div>
      )}

      {data.champion_rewrite && (
        <div className="coach__block">
          <span className="label">How a champion would say it</span>
          <p className="coach__rewrite">“{data.champion_rewrite}”</p>
        </div>
      )}
    </section>
  );
}
