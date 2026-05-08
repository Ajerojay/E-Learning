import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LetterQuestPage.css";

import pageBg from "./images/letter-bg.png";
import gameBg from "./images/letters-bg.jpg";
import bear from "./images/bear-2.png";

import appleA from "./images/a.png";
import appleB from "./images/b.png";
import appleC from "./images/c.png";

import basketSet from "./images/basket.png";

import appleZ from "./images/z.png";
import appleK from "./images/k.png";
import appleI from "./images/i.png";
import appleE from "./images/e.png";
import appleM from "./images/m.png";
import appleR from "./images/r.png";

import basketZ from "./images/z-basket.png";
import basketK from "./images/k-basket.png";
import basketI from "./images/i-basket.png";
import basketE from "./images/e-basket.png";
import basketM from "./images/m-basket.png";
import basketO from "./images/o-basket.png";
import basketR from "./images/r-basket.png";

/* LEVELS */
const levels = [
  [
    { letter: "A", img: appleA, id: 1 },
    { letter: "B", img: appleB, id: 2 },
    { letter: "C", img: appleC, id: 3 },
  ],
  [
    { letter: "A", img: appleA, id: 4 },
    { letter: "B", img: appleB, id: 5 },
    { letter: "C", img: appleC, id: 6 },
    { letter: "B", img: appleB, id: 7 },
    { letter: "A", img: appleA, id: 8 },
  ],
];

const level3Pool = [
  { letter: "Z", apple: appleZ, basket: basketZ },
  { letter: "K", apple: appleK, basket: basketK },
  { letter: "I", apple: appleI, basket: basketI },
  { letter: "E", apple: appleE, basket: basketE },
  { letter: "M", apple: appleM, basket: basketM },
  { letter: "R", apple: appleR, basket: basketR },
];

export default function LetterQuestPage() {
  const navigate = useNavigate();
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const lastSpokenRef = useRef<{ text: string; at: number } | null>(null);
  const [levelIndex, setLevelIndex] = useState(0);
  const [placedIds, setPlacedIds] = useState<number[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [hasPlayed, setHasPlayed] = useState(false);
  const [proceedPromptLevel, setProceedPromptLevel] = useState<number | null>(
    null
  );
  const [levelSummaryOpen, setLevelSummaryOpen] = useState(false);
  const [finalCongratsOpen, setFinalCongratsOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voicesReady, setVoicesReady] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);

  const makeLevel3Set = (count = 4) =>
    [...level3Pool].sort(() => Math.random() - 0.5).slice(0, count);

  const [level3Targets, setLevel3Targets] = useState(() => makeLevel3Set());
  const [level3Remaining, setLevel3Remaining] = useState(() => level3Targets);

  const currentApples = levels[levelIndex] || [];
  const totalItems =
    levelIndex === 2 ? level3Targets.length : currentApples.length;
  const progress =
    levelIndex === 2
      ? level3Targets.length - level3Remaining.length
      : placedIds.length;

  const isFinished = finalCongratsOpen;
  const levelNames = ["Easy", "Medium", "Hard"];

  const getHappyVoice = () => {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const preferred = voices.find(
      (v) =>
        /en(-|_)us|english/i.test(v.lang) &&
        /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(v.name)
    );
    if (preferred) return preferred;
    const femaleAnyLang = voices.find((v) =>
      /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(v.name)
    );
    return femaleAnyLang ?? null;
  };

  const sayKid = (
    text: string,
    options?: { interrupt?: boolean; skipDedupe?: boolean }
  ) => {
    try {
      if (!soundEnabled) return;
      if (!("speechSynthesis" in window)) return;
      if (!voicesReady) {
        void window.speechSynthesis.getVoices();
      }
      if (options?.interrupt) window.speechSynthesis.cancel();
      const now = Date.now();
      const last = lastSpokenRef.current;
      if (!options?.skipDedupe && last && last.text === text && now - last.at < 450)
        return;
      lastSpokenRef.current = { text, at: now };
      const u = new SpeechSynthesisUtterance(text);
      const voice = getHappyVoice();
      if (!voice) return;
      u.voice = voice;
      u.rate = 1.12;
      u.pitch = 1.55;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  };

  const playKidBeep = (n: number) => {
    try {
      if (!soundEnabled) return;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n === 0 ? 880 : 520 + (5 - Math.min(n, 5)) * 80;
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
      window.setTimeout(() => ctx.close(), 250);
    } catch {
      // ignore
    }
  };

  const resetCommon = () => {
    setPlacedIds([]);
    setSelected(null);
    setWrongAttempts(0);
    setFeedback("");
    setHasPlayed(false);
    setProceedPromptLevel(null);
    setLevelSummaryOpen(false);
    setTimeLeft(30);
    setTimerRunning(false);
    setCountdown(3);
    setTimeUpOpen(false);
    warnedSecondsRef.current = new Set();
  };

  const resetCurrentLevel = () => {
    resetCommon();
    if (levelIndex === 2) {
      const next = makeLevel3Set();
      setLevel3Targets(next);
      setLevel3Remaining(next);
      setFinalCongratsOpen(false);
    }
  };

  const handleDragStart = (e: any, letter: string, id: number) => {
    if (countdown !== null || timeUpOpen) return;
    e.dataTransfer.setData("application/json", JSON.stringify({ letter, id }));
    setSelected(letter);
    setTimerRunning(true);
    sayKid(letter, { interrupt: true, skipDedupe: true });
  };

  const handleDrop = (e: any) => {
    if (countdown !== null || timeUpOpen) return;
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData("application/json"));
    if (!data) return;

    const { letter, id } = data;
    setHasPlayed(true);
    setTimerRunning(true);

    // LEVEL 3
    if (levelIndex === 2) {
      const match = level3Remaining.find((b) => b.letter === letter);

      if (match) {
        setFeedback(`Correct! ${letter}`);
        const updated = level3Remaining.filter((b) => b.letter !== letter);
        setLevel3Remaining(updated);

        if (updated.length === 0) setFinalCongratsOpen(true);
      } else {
        setWrongAttempts((p) => p + 1);
        setFeedback("Oops! Try again.");
      }
      return;
    }

    // NORMAL LEVEL
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    let target = "";
    if (x < rect.width / 3) target = "A";
    else if (x < (rect.width / 3) * 2) target = "B";
    else target = "C";

    if (letter === target && !placedIds.includes(id)) {
      const updated = [...placedIds, id];
      setPlacedIds(updated);
      setFeedback(`Great job! ${letter}`);
      setSelected(null);

      if (updated.length === totalItems) {
        setProceedPromptLevel(levelIndex);
      }
    } else {
      setWrongAttempts((p) => p + 1);
      setFeedback("Oops! Try again.");
    }
  };

  const handleProceed = () => {
    resetCommon();
    setFinalCongratsOpen(false);
    setLevelIndex((prev) => Math.min(prev + 1, 2));
    if (levelIndex + 1 === 2) {
      const next = makeLevel3Set();
      setLevel3Targets(next);
      setLevel3Remaining(next);
    }
  };

  const handlePlayAgain = () => {
    resetCommon();
    setLevelIndex(0);
    const next = makeLevel3Set();
    setLevel3Targets(next);
    setLevel3Remaining(next);
    setFinalCongratsOpen(false);
  };

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const onVoicesChanged = () => setVoicesReady(true);
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    void window.speechSynthesis.getVoices();
    return () => {
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        onVoicesChanged
      );
    };
  }, []);

  useEffect(() => {
    setTimeLeft(30);
    setTimerRunning(false);
    setCountdown(3);
    setTimeUpOpen(false);
    warnedSecondsRef.current = new Set();
  }, [levelIndex]);

  useEffect(() => {
    if (countdown === null) return;
    setTimerRunning(false);
    if (countdown <= 0) {
      setCountdown(null);
      setTimerRunning(true);
      sayKid("Go!", { interrupt: true, skipDedupe: true });
      playKidBeep(0);
      return;
    }
    sayKid(String(countdown), { interrupt: true, skipDedupe: true });
    playKidBeep(countdown);
    const t = window.setTimeout(
      () => setCountdown((p) => (p === null ? null : p - 1)),
      900
    );
    return () => window.clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (!timerRunning) return;
    if (countdown !== null) return;
    if (proceedPromptLevel !== null || levelSummaryOpen || timeUpOpen || isFinished)
      return;

    if (timeLeft <= 0) {
      setTimerRunning(false);
      setFeedback("Time's up!");
      setTimeUpOpen(true);
      sayKid("Time's up!", { interrupt: true, skipDedupe: true });
      playKidBeep(0);
      return;
    }

    const t = window.setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => window.clearTimeout(t);
  }, [
    timerRunning,
    countdown,
    proceedPromptLevel,
    levelSummaryOpen,
    timeUpOpen,
    isFinished,
    timeLeft,
  ]);

  useEffect(() => {
    if (!timerRunning) return;
    if (countdown !== null) return;
    if (proceedPromptLevel !== null || levelSummaryOpen || timeUpOpen || isFinished)
      return;
    if (timeLeft > 5 || timeLeft <= 0) return;
    if (warnedSecondsRef.current.has(timeLeft)) return;

    warnedSecondsRef.current.add(timeLeft);
    sayKid(String(timeLeft), { interrupt: true, skipDedupe: true });
    playKidBeep(timeLeft);
  }, [
    timerRunning,
    countdown,
    proceedPromptLevel,
    levelSummaryOpen,
    timeUpOpen,
    isFinished,
    timeLeft,
  ]);

  return (
    <div className="page-bg" style={{ backgroundImage: `url(${gameBg})` }}>
      <div className="top-bar">
        <button className="back-btn" onClick={() => navigate("/student")}>← Back</button>
        <button className="lesson-btn" onClick={() => navigate("/lesson/letters")}>← Lesson</button>
        <button
          type="button"
          className="lesson-btn lq-sound-btn"
          onClick={() => {
            setSoundEnabled((prev) => {
              const next = !prev;
              if (!next && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
              }
              return next;
            });
          }}
        >
          {soundEnabled ? "🔊 On" : "🔇 Off"}
        </button>
      </div>

      <h2 className="title">Match the Letters!</h2>

      <div className="game-card">
        <div
          className={`game-container level-${levelIndex}`}
          style={{ backgroundImage: `url(${pageBg})` }}
        >
          <div className="level">
            Level {levelIndex + 1}: {levelNames[levelIndex]} | ⏱ {timeLeft}s
          </div>

          {countdown !== null && (
            <div className="lq-countdown" aria-hidden="true">
              <div className="lq-countdown-bubble">{countdown}</div>
            </div>
          )}

          {timeUpOpen && (
              <div className="level-popup level-popup--summary">
              ⏰ Time&apos;s up!
              <br />
              <span className="level-popup__meta">
                Progress: {progress}/{totalItems} | Wrong Attempts: {wrongAttempts}
              </span>
              <br />
              <br />
              {levelIndex < 2 ? (
                <>
                  <button
                    onClick={() => {
                      setTimeUpOpen(false);
                      handleProceed();
                    }}
                  >
                    Proceed to Level {levelIndex + 2}
                  </button>
                  <button
                    onClick={() => {
                      setTimeUpOpen(false);
                      resetCurrentLevel();
                    }}
                  >
                    Replay this Level
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setTimeUpOpen(false);
                      resetCurrentLevel();
                    }}
                  >
                    Replay this Level
                  </button>
                  <button
                    onClick={() => {
                      setTimeUpOpen(false);
                      handlePlayAgain();
                    }}
                  >
                    Play Again
                  </button>
                </>
              )}
            </div>
          )}

          {/* LEVEL COMPLETE PROMPT (PIC 1) */}
          {proceedPromptLevel !== null && levelIndex < 2 && (
            <div className="level-popup">
              🎉 Level {levelIndex + 1} Complete!
              <br />
              Proceed to Level {levelIndex + 2} ?
              <br />
              <br />
              <button onClick={handleProceed}>Yes, let's go!</button>
              <button
                onClick={() => {
                  setProceedPromptLevel(null);
                  setLevelSummaryOpen(true);
                }}
              >
                Not now
              </button>
            </div>
          )}

          {/* SUMMARY POPUP AFTER "NOT NOW" (PIC 2) */}
          {levelSummaryOpen && levelIndex < 2 && (
            <div className="level-popup level-popup--summary">
              {feedback ? feedback : "Great job!"}
              <br />
              <span className="level-popup__meta">
                Progress: {progress}/{totalItems} | Wrong Attempts: {wrongAttempts}
              </span>
              <br />
              <br />
              <button onClick={handleProceed}>Proceed to Level {levelIndex + 2}</button>
              <button
                onClick={() => {
                  setLevelSummaryOpen(false);
                  resetCurrentLevel();
                }}
              >
                Replay this Level
              </button>
            </div>
          )}

          {/* APPLES */}
          {levelIndex === 2
            ? level3Remaining.map((a, i) => (
                <img
                  key={i}
                  src={a.apple}
                  draggable={countdown === null && !timeUpOpen}
                  onDragStart={(e) => handleDragStart(e, a.letter, i)}
                  className="apple apple--l3"
                  style={{
                    left: `${
                      level3Remaining.length === 1
                        ? 50
                        : 10 + (i * 80) / (level3Remaining.length - 1)
                    }%`,
                  }}
                />
              ))
            : currentApples.map(
                (a, i) =>
                  !placedIds.includes(a.id) && (
                    <img
                      key={a.id}
                      src={a.img}
                      draggable={countdown === null && !timeUpOpen}
                      onClick={() => setSelected(a.letter)}
                      onDragStart={(e) => handleDragStart(e, a.letter, a.id)}
                      className={`apple ${
                        selected === a.letter ? "selected" : ""
                      }`}
                      style={{
                        left: `calc(50% + ${
                          (i - (currentApples.length - 1) / 2) * 180
                        }px)`,
                      }}
                    />
                  )
              )}

          <img src={bear} className="bear" />

          <div
            className="basket-set"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {levelIndex === 2 ? (
              <div className="level3-baskets">
                {level3Targets.map((b, i) => (
                  <img key={i} src={b.basket} className="basket-img" />
                ))}
              </div>
            ) : (
              <img src={basketSet} className="basket-img" />
            )}
          </div>
        </div>
      </div>

      <div className="cq-panel">
        <div className="cq-message">
          {!hasPlayed
            ? "Drag each apple into the correct basket!"
            : isFinished
            ? "Congrats! You finished it!"
            : feedback}
        </div>

        <div className="cq-score">
          Progress: {progress}/{totalItems} | Wrong Attempts: {wrongAttempts}
        </div>

        {isFinished && (
          <div className="cq-actions">
            <button className="play-btn" onClick={handlePlayAgain}>
              Play Again
            </button>
            <button className="view-btn" onClick={() => navigate("/parent-progress")}>View Progress</button>
          </div>
        )}
      </div>
    </div>
  );
}