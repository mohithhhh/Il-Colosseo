import AgentCard from "./AgentCard";

const NUMERAL = { 1: "I", 2: "II", 3: "III" };

// One round: numeral, the crowd's challenge in round III, then the two speeches side by side.
// `composer` replaces the human's speech slot while it's their turn.
export default function RoundRow({ roundData, curveball, humanSide, composer }) {
  return (
    <section className="round">
      <h2 className="round__head">
        <span className="round__numeral" aria-hidden="true">{NUMERAL[roundData.round] ?? roundData.round}</span>
        <span className="sr-only">Round {roundData.round}</span>
      </h2>
      {curveball && roundData.round === 3 && (
        <p className="challenge">The crowd demands an answer: <q>{curveball}</q></p>
      )}
      <div className="duel">
        {["PRO", "CON"].map((side) =>
          composer && side === humanSide ? (
            <div key={side}>{composer}</div>
          ) : (
            <AgentCard key={side} agent={side} data={roundData[side]} />
          )
        )}
      </div>
    </section>
  );
}
