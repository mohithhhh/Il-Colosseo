import { sideName } from "../speech";

// Concordia, the mediator: what both sides could endorse after the debate, revised once
// after each side objected to the first draft.
export default function CommonGroundPanel({ data, humanSide }) {
  if (!data?.statement) return null;

  return (
    <section className="panel accord" aria-labelledby="accord-title">
      <header className="accord__head">
        <span className="medallion medallion--mediator" aria-hidden="true">C</span>
        <div>
          <h2 id="accord-title" className="accord__title">Common ground</h2>
          <span className="label">drafted by Concordia, the mediator, and revised after both sides objected</span>
        </div>
      </header>

      <p className="accord__statement">{data.statement}</p>

      {data.disputed && (
        <div className="accord__disputed">
          <span className="label">Still disputed</span>
          <p>{data.disputed}</p>
        </div>
      )}

      {data.objections && (
        <details>
          <summary>What each side objected to in the first draft</summary>
          {["PRO", "CON"].map((side) =>
            data.objections[side] ? (
              <p key={side}>
                <strong>{sideName(side, humanSide)}:</strong> {data.objections[side]}
              </p>
            ) : null
          )}
        </details>
      )}
    </section>
  );
}
