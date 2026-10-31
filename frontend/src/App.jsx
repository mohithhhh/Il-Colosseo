import { useEffect, useState } from "react";
import { useDebate } from "./hooks/useDebate";
import TopicInput from "./components/TopicInput";
import RoundRow from "./components/RoundRow";
import JudgePanel from "./components/JudgePanel";
import ReflectionCard from "./components/ReflectionCard";
import CurveballPanel from "./components/CurveballPanel";
import LiveArenaPanel from "./components/LiveArenaPanel";
import ScorecardPanel from "./components/ScorecardPanel";
import CommonGroundPanel from "./components/CommonGroundPanel";
import CoachPanel from "./components/CoachPanel";
import { TruthStart, TruthReveal } from "./components/TruthMode";
import { NAME, INITIAL, phase, doneStreaming, sideName } from "./speech";

const STEPS = ["I", "II", "III", "Verdict"];
const emptyTurn = { text: "", displayText: "", sources: [] };
const Dots = () => <span className="dots" aria-hidden="true"><i /><i /><i /></span>;

function Fighter({ side, humanSide, live, state }) {
  const cls = side === "PRO" ? "pro" : "con";
  return (
    <div className={`fighter fighter--${cls}`}>
      <span className={`medallion medallion--${cls} ${live ? "is-live" : ""}`} aria-hidden="true">
        {side === humanSide ? "Y" : INITIAL[side]}
      </span>
      <div>
        <div className="fighter__name">{sideName(side, humanSide)}</div>
        <div className="fighter__state">{state}</div>
      </div>
    </div>
  );
}

export default function App() {
  const { state, start, proceed, reset, startListening, submitCurveball, submitHumanSpeech } = useDebate();
  const {
    status, pendingAction, rounds, judge, reflections, warnings,
    curveball, voiceDraft, awaitingCurveball, isListening, error,
    humanSide, awaitingHuman, scorecard, commonGround, coach,
  } = state;
  const [dismissedWarnings, setDismissedWarnings] = useState([]);
  const [liveTopic, setLiveTopic] = useState("");
  const [showLive, setShowLive] = useState(false);
  const [language, setLanguage] = useState("en");
  const [showTruth, setShowTruth] = useState(false);
  const [truth, setTruth] = useState(null); // { claim, answer, why, initialVote } in Truth Mode

  const handleStart = (topic, lang, side) => {
    setTruth(null);
    setLiveTopic(topic);
    start(topic, lang, side);
  };

  const handleTruthStart = (item, initialVote) => {
    setShowTruth(false);
    setTruth({ ...item, initialVote });
    setLiveTopic(item.claim);
    start(item.claim, language, null);
  };

  const handleReset = () => {
    setTruth(null);
    setDismissedWarnings([]);
    reset();
  };

  const isIdle = status === "idle";
  const last = rounds.at(-1);
  const humanTurn = awaitingHuman && status === "waiting";
  // The human's speech slot: the open round if their side hasn't spoken in it, else the next one.
  const humanRound = humanTurn && (last && !last[humanSide]?.text ? last.round : (last?.round ?? 0) + 1);
  const shownRounds =
    humanTurn && humanRound > (last?.round ?? 0)
      ? [...rounds, { round: humanRound, PRO: emptyTurn, CON: emptyTurn }]
      : rounds;

  const judging = judge.text !== "";
  const roundsDone = last?.round === 3 && phase(last.PRO) === "done" && phase(last.CON) === "done";
  const deliberating = status === "running" && roundsDone && !judging;
  const step = judging || deliberating ? 4 : (shownRounds.at(-1)?.round ?? 1);

  const fighterState = (side) => {
    if (side === humanSide && humanTurn) return "Your turn";
    const p = phase(shownRounds.at(-1)?.[side]);
    if (status === "running" && p === "researching") return "Researching";
    if (status === "running" && p === "speaking") return "Speaking";
    return side === "PRO" ? "For the motion" : "Against the motion";
  };
  const isLive = (side) => status === "running" && phase(last?.[side]) === "speaking" && !judging;

  // What the arena is waiting on, when nothing on screen says so already.
  const lastPhases = last ? [phase(last.PRO), phase(last.CON)] : [];
  const busy = status === "running" && !judging && !lastPhases.includes("speaking") && !lastPhases.includes("researching");
  const nextUp = ["PRO", "CON"].find((s) => s !== humanSide && !phase(last?.[s]));
  const statusLine = deliberating
    ? `${NAME.JUDGE} is weighing the arguments`
    : busy
      ? rounds.length === 0
        ? "Reading up on the motion"
        : nextUp
          ? `${NAME[nextUp]} is preparing`
          : "Preparing the next round"
      : null;

  // Follow new content, but only if the reader is already near the bottom.
  useEffect(() => {
    const nearBottom = window.innerHeight + window.scrollY > document.body.scrollHeight - 400;
    if (!isIdle && nearBottom) window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [isIdle, rounds, judge.displayText, reflections, pendingAction, awaitingCurveball, awaitingHuman, scorecard, commonGround, coach, status]);

  const overlays = (
    <>
      {showLive && <LiveArenaPanel topic={liveTopic} onClose={() => setShowLive(false)} />}
      {showTruth && <TruthStart onStart={handleTruthStart} onClose={() => setShowTruth(false)} />}
    </>
  );

  // ── Landing ──
  if (isIdle) {
    return (
      <>
        <div className="backdrop" data-mode="landing" />
        <main className="landing">
          <div className="landing__inner">
            <h1 className="inscription">Il Colosseo</h1>
            <p className="tagline">
              Two AI gladiators research any motion live, argue it over three rounds, and face a judge. Watch, or step
              into the ring yourself.
            </p>
            {error && <p className="alert" role="alert" style={{ marginBottom: 20 }}>{error}</p>}
            <TopicInput onStart={handleStart} language={language} onLanguageChange={setLanguage} />
            <div className="elsewhere">
              <button className="elsewhere__item" onClick={() => setShowTruth(true)}>
                <span className="elsewhere__title">Truth Mode</span>
                <span className="elsewhere__hint">Call a claim true or false, watch it debated, then see if you changed your mind.</span>
              </button>
              <button className="elsewhere__item" onClick={() => setShowLive(true)}>
                <span className="elsewhere__title">Live voice</span>
                <span className="elsewhere__hint">Talk to a gladiator out loud, in real time.</span>
              </button>
            </div>
          </div>
        </main>
        {overlays}
      </>
    );
  }

  // ── Arena ──
  const composer = humanTurn && (
    <CurveballPanel
      variant={humanSide.toLowerCase()}
      voiceDraft={voiceDraft}
      isListening={isListening}
      onStartListening={startListening}
      onSubmit={submitHumanSpeech}
      title={`Your turn: ${humanSide === "PRO" ? "argue for" : "argue against"} the motion`}
      hint={humanRound === 1 ? "Open with your strongest points." : `Answer ${NAME[humanSide === "PRO" ? "CON" : "PRO"]}, then press your case.`}
      placeholder="Make your points, cite evidence, rebut your opponent…"
      submitLabel="Deliver your speech"
      maxLength={1500}
    />
  );

  return (
    <>
      <div className="backdrop" data-mode="arena" />
      <div className="arena">
        <header className="topbar">
          <div className="topbar__row">
            <span className="wordmark">Il Colosseo</span>
            <p className="topbar__motion" title={liveTopic}>{liveTopic}</p>
            <div className="topbar__actions">
              <button className="btn btn--quiet" onClick={() => setShowLive(true)}>Live voice</button>
              <button className="btn btn--quiet" onClick={handleReset}>New debate</button>
            </div>
          </div>
          <div className="standings">
            <Fighter side="PRO" humanSide={humanSide} live={isLive("PRO")} state={fighterState("PRO")} />
            <ol className="tracker" aria-label="Progress">
              {STEPS.map((s, i) => (
                <li
                  key={s}
                  data-state={status === "complete" || i + 1 < step ? "done" : i + 1 === step ? "now" : "next"}
                  aria-current={i + 1 === step && status !== "complete" ? "step" : undefined}
                  aria-label={i < 3 ? `Round ${i + 1}` : "Verdict"}
                >
                  {s}
                </li>
              ))}
            </ol>
            <Fighter side="CON" humanSide={humanSide} live={isLive("CON")} state={fighterState("CON")} />
          </div>
        </header>

        <main className="floor">
          {warnings.map((msg, i) =>
            dismissedWarnings.includes(i) ? null : (
              <div key={i} className="notice" role="status">
                <span>{msg}</span>
                <button onClick={() => setDismissedWarnings((d) => [...d, i])} aria-label="Dismiss">×</button>
              </div>
            )
          )}

          {shownRounds.map((roundData) => (
            <RoundRow
              key={roundData.round}
              roundData={roundData}
              curveball={curveball}
              humanSide={humanSide}
              composer={roundData.round === humanRound ? composer : null}
            />
          ))}

          {statusLine && (
            <p className="status-line" role="status">
              {statusLine}
              <Dots />
            </p>
          )}

          {awaitingCurveball && (
            <CurveballPanel
              voiceDraft={voiceDraft}
              isListening={isListening}
              onStartListening={startListening}
              onSubmit={submitCurveball}
            />
          )}

          {pendingAction !== null && (
            <div className="proceed">
              <button className="btn btn--primary" onClick={proceed}>
                {pendingAction === "judge" ? "Hear the verdict" : `Start round ${pendingAction}`}
              </button>
            </div>
          )}

          {judging && <JudgePanel data={judge} curveball={curveball} humanSide={humanSide} />}
          {judging && doneStreaming(judge) && <ScorecardPanel scores={scorecard} humanSide={humanSide} />}

          {(reflections.PRO.displayText || reflections.CON.displayText) && (
            <div className="thoughts">
              <ReflectionCard agent="PRO" displayText={reflections.PRO.displayText} />
              <ReflectionCard agent="CON" displayText={reflections.CON.displayText} />
            </div>
          )}

          <CommonGroundPanel data={commonGround} humanSide={humanSide} />
          <CoachPanel data={coach} />

          {truth && status === "complete" && <TruthReveal truth={truth} winner={judge.winner} />}

          {status === "complete" && (
            <div className="proceed">
              <button className="btn" onClick={handleReset}>Start a new debate</button>
            </div>
          )}
        </main>
      </div>
      {overlays}
    </>
  );
}
