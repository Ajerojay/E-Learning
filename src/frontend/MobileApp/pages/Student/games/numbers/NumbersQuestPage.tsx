import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./NumbersQuestPage.css";
import IdleAnswerHint from "../shared/IdleAnswerHint";
import "../../../../WebView/AppNumbersQuestPage.css";
import GameExitGesture from "../shared/GameExitGesture";
import { getOrCreateActiveChildId } from "../../../../../../backend/childProgress";
import {
  loadPrimaryGameCodeForCategory,
  recordGameProgressRpc,
} from "../../../../../../backend/gameProgressDb";
import { GameOverlay, GamePopup, Countdown, GamePauseButton, GamePausePopup, GameOverPopup } from "../shared/GamePopup";
import {
  useLevelIntro,
  LevelIntroOverlay,
  COUNTDOWN_READY_SUBTITLE,
  type LevelIntroContent,
} from "../shared/levelIntro";
import { speakNative } from "../../../../nativeTts";
import QuestLevelSelect from "../shared/QuestLevelSelect";
import ChildMusicToggle from "../../ChildMusicToggle";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "../shared/questLevelMap";
import { LiveStarHud } from "../shared/LevelStars";
import { KidGameTitle } from "../shared/KidGameTitle";
import { randomSequenceDifferentFromLast } from "../shared/questionSequence";

import cloudImg from "../../images/cloud.png";
import bgImg from "../../images/numbers-bg.jpg";
import dropImg from "../../images/rain.png";

type LevelName = "Easy" | "Medium" | "Hard";

type LevelConfig = {
  name: LevelName;
  targetMin: number;
  targetMax: number;
  dropCount: number;
};

const levels: LevelConfig[] = [
  { name: "Easy", targetMin: 1, targetMax: 3, dropCount: 5 },
  { name: "Medium", targetMin: 4, targetMax: 6, dropCount: 7 },
  { name: "Hard", targetMin: 7, targetMax: 10, dropCount: 10 },
];

function pickTargetForLevel(levelIndex: number, history: Set<number>[]) {
  const current = levels[levelIndex] ?? levels[0];
  const usedAtLowerLevels = new Set(
    history.slice(0, levelIndex).flatMap((levelTargets) => Array.from(levelTargets))
  );
  const available = Array.from(
    { length: current.targetMax - current.targetMin + 1 },
    (_, index) => current.targetMin + index
  ).filter((value) => !usedAtLowerLevels.has(value));
  const choices = available.length
    ? available
    : Array.from(
        { length: current.targetMax - current.targetMin + 1 },
        (_, index) => current.targetMin + index
      );
  const [target] = randomSequenceDifferentFromLast(
    `numbers-quest-level-${levelIndex}`,
    choices,
    1,
    (value) => String(value)
  );
  if (target === undefined) {
    throw new Error(`No available number target for ${current.name}.`);
  }
  history[levelIndex]?.add(target);
  return target;
}

type DropPos = { top: string; left: string };

const NUMBERS_GAME_INTRO: LevelIntroContent = {
  title: "Count the raindrops!",
  subtitle: "Tap the raindrops that match the number on the cloud, then press Submit.",
  speech:
    "Hi! Look at the number on the cloud. Tap that many raindrops, then press Submit. You can do it!",
  displayMs: 4000,
};

const positionsByCount: Record<number, DropPos[]> = {
  5: [
    { top: "4%", left: "6%" },
    { top: "0%", left: "36%" },
    { top: "8%", left: "66%" },
    { top: "46%", left: "20%" },
    { top: "50%", left: "50%" },
  ],
  7: [
    { top: "0%", left: "2%" },
    { top: "4%", left: "28%" },
    { top: "0%", left: "54%" },
    { top: "6%", left: "78%" },
    { top: "48%", left: "14%" },
    { top: "52%", left: "40%" },
    { top: "46%", left: "66%" },
  ],
  10: [
    { top: "0%", left: "0%" },
    { top: "0%", left: "22%" },
    { top: "0%", left: "44%" },
    { top: "0%", left: "66%" },
    { top: "0%", left: "88%" },
    { top: "40%", left: "0%" },
    { top: "40%", left: "22%" },
    { top: "40%", left: "44%" },
    { top: "40%", left: "66%" },
    { top: "40%", left: "88%" },
  ],
};

export default function NumbersQuestPage() {
  const navigate = useNavigate();
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const lastSpokenRef = useRef<{ text: string; at: number } | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const isVoiceSpeakingRef = useRef(false);
  const [voicesReady, setVoicesReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [paused, setPaused] = useState(false);

  const [levelIndex, setLevelIndex] = useState(0);
  const targetHistory = useMemo(() => levels.map(() => new Set<number>()), []);
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("numbers");
  // A fresh route visit from Start Number Activity owns the one full intro.
  const playSession = 0;
  const [target, setTarget] = useState<number>(3);
  const [selected, setSelected] = useState<number[]>([]);
  const [wrongAttempts, setWrongAttempts] = useState<number>(0);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [locked, setLocked] = useState<boolean>(false);
  const [message, setMessage] = useState<string>(
    "Tap the raindrops that match the number!"
  );
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [proceedPromptLevel, setProceedPromptLevel] = useState<number | null>(
    null
  );
  const [levelSummaryOpen, setLevelSummaryOpen] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);
  const [isFinishedAllLevels, setIsFinishedAllLevels] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);

  const level = levels[levelIndex] ?? levels[0];

  const startCountdown = useCallback(() => setCountdown(3), []);

  const introEnabled =
    !mapOpen &&
    !timeUpOpen &&
    !isFinishedAllLevels &&
    proceedPromptLevel === null &&
    !levelSummaryOpen;

  const { levelIntroActive, onLevelStart, startCountdownOnly, cancelIntro } = useLevelIntro({
    content: NUMBERS_GAME_INTRO,
    soundEnabled,
    enabled: introEnabled,
    sessionKey: playSession,
    onStartCountdown: startCountdown,
  });

  const positions = useMemo(() => {
    const base = positionsByCount[level.dropCount] ?? positionsByCount[5];
    return base.slice(0, level.dropCount);
  }, [level.dropCount]);

  useEffect(() => {
    if (levelIntroActive) setTimerRunning(false);
  }, [levelIntroActive]);

  useEffect(() => {
    if (levelIntroActive) return;
    if (countdown === null) return;
    setTimerRunning(false);
    if (countdown <= 0) {
      setCountdown(null);
      setTimerRunning(true);
      return;
    }
    const t = window.setTimeout(() => setCountdown((p) => (p === null ? null : p - 1)), 850);
    return () => window.clearTimeout(t);
  }, [countdown, levelIntroActive]);

  useEffect(() => {
    if (!timerRunning) return;
    if (levelIntroActive || countdown !== null) return;
    if (proceedPromptLevel !== null || levelSummaryOpen || timeUpOpen || gameOverOpen || paused) return;

    if (timeLeft <= 0) {
      setTimerRunning(false);
      // Speak immediately on timeout (same feel as Shapes timing).
      sayKid("Time's up!", { interrupt: true, skipDedupe: true });
      playKidBeep(0);
      setTimeUpOpen(true);
      setMessage("Time's up!");
      return;
    }

    const t = window.setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => window.clearTimeout(t);
  }, [
    timerRunning,
    timeLeft,
    levelIntroActive,
    countdown,
    proceedPromptLevel,
    levelSummaryOpen,
    timeUpOpen,
    paused,
  ]);

  useEffect(() => {
    // reset on level change
    setTimeLeft(30);
    setTimerRunning(false);
    setCountdown(null);
    setSelected([]);
    setLocked(false);
    setWrongAttempts(0);
    setProceedPromptLevel(null);
    setLevelSummaryOpen(false);
    setTimeUpOpen(false);
    setIsFinishedAllLevels(false);
    warnedSecondsRef.current = new Set();
    setMessage("Tap the raindrops that match the number!");

    setTarget(pickTargetForLevel(levelIndex, targetHistory));
    if (!mapOpen) onLevelStart();
  }, [levelIndex, level.targetMax, level.targetMin, onLevelStart, mapOpen, targetHistory]);

  useEffect(() => {
    const load = async () => {
      const id = await getOrCreateActiveChildId();
      setChildId(id);
      const code = await loadPrimaryGameCodeForCategory("numbers");
      setGameCode(code);
    };
    void load();
  }, []);

  const saveNumbersProgress = async (
    score: number,
    finished: boolean,
    attempts: number
  ) => {
    if (!childId || !gameCode) return;
    await recordGameProgressRpc(childId, gameCode, score, attempts, finished);
  };

  const generateRound = () => {
    setTarget(pickTargetForLevel(levelIndex, targetHistory));
    setSelected([]);
    setLocked(false);
    warnedSecondsRef.current = new Set();
    setMessage("Tap the raindrops that match the number!");
  };

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
      if (speakNative(text, { interrupt: options?.interrupt !== false, rate: 0.9, pitch: 1.2 })) return;
      if (!("speechSynthesis" in window)) return;
      if (!voicesReady) {
        void window.speechSynthesis.getVoices();
      }
      window.speechSynthesis.cancel();
      const now = Date.now();
      const last = lastSpokenRef.current;
      if (!options?.skipDedupe && last && last.text === text && now - last.at < 450)
        return;
      lastSpokenRef.current = { text, at: now };
      const u = new SpeechSynthesisUtterance(text);
      const voice = getHappyVoice();
      if (!voice) return;
      u.voice = voice;
      u.rate = 0.9;
      u.pitch = 1.2;
      u.volume = 1;

      // Pause music when voice starts speaking
      isVoiceSpeakingRef.current = true;
      if (bgMusicRef.current && musicEnabled) {
        bgMusicRef.current.pause();
      }

      // Resume music when voice ends
      u.onend = () => {
        isVoiceSpeakingRef.current = false;
        if (bgMusicRef.current && musicEnabled) {
          bgMusicRef.current.play().catch(() => {});
        }
      };

      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  };

  const speakFeedback = (text: string) => {
    try {
      if (!soundEnabled) return;
      if (speakNative(text, { interrupt: true, rate: 0.9, pitch: 1.2 })) return;
      if (!("speechSynthesis" in window)) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((v) =>
          /(female|girl|kid|child|zira|samantha|jenny)/i.test(v.name)
        ) || voices[0];

      if (voice) {
        utterance.voice = voice;
      }

      utterance.rate = 0.9;
      utterance.pitch = 1.2;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore feedback errors
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
    if (levelIntroActive) return;
    if (countdown === null) return;
    if (countdown <= 0) {
      sayKid("Go!", { interrupt: true, skipDedupe: true });
      playKidBeep(0);
      return;
    }
    sayKid(String(countdown), { interrupt: true, skipDedupe: true });
    playKidBeep(countdown);
  }, [countdown, levelIntroActive]);

  useEffect(() => {
    // 5-second warning voice + beep
    if (!timerRunning) return;
    if (levelIntroActive || countdown !== null) return;
    if (proceedPromptLevel !== null || levelSummaryOpen || timeUpOpen || gameOverOpen || paused) return;
    if (timeLeft > 5 || timeLeft <= 0) return;
    if (warnedSecondsRef.current.has(timeLeft)) return;

    warnedSecondsRef.current.add(timeLeft);
    // Straight countdown: 5,4,3,2,1
    sayKid(String(timeLeft), { interrupt: true, skipDedupe: true });
    playKidBeep(timeLeft);
  }, [
    timerRunning,
    countdown,
    proceedPromptLevel,
    levelSummaryOpen,
    timeUpOpen,
    timeLeft,
  ]);

  const handleClick = (id: number) => {
    if (levelIntroActive || countdown !== null || paused) return;
    if (locked) return;
    setTimerRunning(true);
    if (selected.includes(id)) return;

    const nextCount = selected.length + 1;
    // Speak the count number (1,2,3...) while the kid taps
    sayKid(String(nextCount), { interrupt: true, skipDedupe: true });
    setSelected((prev) => [...prev, id]);
  };

  const checkAnswer = () => {
    if (levelIntroActive || countdown !== null || paused || gameOverOpen || timeUpOpen) return;
    if (locked || selected.length === 0) return;

    setLocked(true);
    const isCorrect = selected.length === target;

    if (isCorrect) {
      setMessage("Great job! Correct!");
      speakFeedback("Great job!");
      setCorrectRounds((p) => {
        const next = p + 1;
        const finishedAll = levelIndex >= 2 && next >= totalRoundsToComplete;
        const maxSteps = levels.length * totalRoundsToComplete;
        const stepsDone = levelIndex * totalRoundsToComplete + next;
        const pct = finishedAll ? 100 : Math.round((stepsDone / maxSteps) * 100);
        void saveNumbersProgress(pct, finishedAll, wrongAttempts);

        if (next >= totalRoundsToComplete) {
          void completeLevel(levelIndex, { timeLeft, wrongAttempts });
          if (levelIndex >= 2) {
            setMessage("Amazing! You finished all levels!");
            setIsFinishedAllLevels(true);
            sayKid(
              "Congratulations! Amazing counting! You finished all number levels!",
              { interrupt: true, skipDedupe: true }
            );
          } else {
            setProceedPromptLevel(levelIndex);
          }
          setTimerRunning(false);
        }
        return next;
      });
    } else {
      const nextWrong = wrongAttempts + 1;
      const maxSteps = levels.length * totalRoundsToComplete;
      const stepsDone = levelIndex * totalRoundsToComplete + correctRounds;
      const pct = Math.round((stepsDone / maxSteps) * 100);
      void saveNumbersProgress(pct, false, nextWrong);
      setWrongAttempts(nextWrong);
      setMessage("Oops! Try again.");
      speakFeedback("Try again!");
    }

    window.setTimeout(() => {
      // If level is complete, wait for popup instead of generating next round.
      if (isCorrect && correctRounds + 1 >= totalRoundsToComplete) {
        setLocked(false);
        return;
      }
      setLocked(false);
      setSelected([]);
      generateRound();
    }, 800);
  };

  const [correctRounds, setCorrectRounds] = useState(0);
  const totalRoundsToComplete = 3;
  useStarTimeUp(timeUpOpen, levelIndex, correctRounds > 0 || wrongAttempts > 0, recordLevelResult, wrongAttempts);
  const onTooManyWrong = useCallback(() => {
    setGameOverOpen(true);
    setTimerRunning(false);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts });
  }, [levelIndex, recordLevelResult, wrongAttempts]);
  useWrongAttemptGameOver(wrongAttempts, onTooManyWrong);
  const canProceedAfterTimeUp = false;

  const handlePlayAgain = () => {
    cancelIntro();
    setIsFinishedAllLevels(false);
    setCorrectRounds(0);
    setWrongAttempts(0);
    setGameOverOpen(false);
    setSelected([]);
    setLocked(false);
    setProceedPromptLevel(null);
    setLevelSummaryOpen(false);
    setTimeUpOpen(false);
    setLevelIndex(0);
    setTimeLeft(30);
    setTimerRunning(false);
    setMessage("Tap the raindrops that match the number!");
    setTarget(pickTargetForLevel(0, targetHistory));
    setCountdown(null);
    warnedSecondsRef.current = new Set();
    window.setTimeout(() => startCountdownOnly(), 120);
  };

  return (
    <div className="nq-page-bg nq-page-bg--no-card" style={{ backgroundImage: `url(${bgImg})` }}>
      {mapOpen && (
        <QuestLevelSelect
          title="Number Quest"
          unlockedCount={unlockedCount}
          levelStars={levelStars}
          onSelectLevel={(index) => {
            if (index === levelIndex) generateRound();
            else setLevelIndex(index);
            setMapOpen(false);
          }}
          onBack={() => navigate("/quest/number", { replace: true })}
        />
      )}
      <header className="nq-header">
        <div className="nq-top-bar">
          <GameExitGesture className="nq-back-btn" onExit={() => setMapOpen(true)} />
        </div>
        <div className="nq-heading">
          <KidGameTitle className="nq-title nq-title--page" tag="h2">
            Count the Raindrops!
          </KidGameTitle>
        </div>
        <div className="nq-meta-row nq-meta-row--page">
          <div className="nq-level-badge">
            <span>Level {levelIndex + 1}</span>
            <span className="nq-level-name">: {level.name}</span>
          </div>
          <LiveStarHud timeLeft={timeLeft} tried={correctRounds > 0 || wrongAttempts > 0} wrong={wrongAttempts} />
          <div className="nq-timer">⏱ {timeLeft}s</div>
          <ChildMusicToggle />
          <button
            type="button"
            className="nq-sound-toggle nq-effects-toggle"
            onClick={() => {
              setSoundEnabled((prev) => {
                const next = !prev;
                if (!next && "speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }
                return next;
              });
            }}
            aria-label={soundEnabled ? "Turn sound off" : "Turn sound on"}
          >
            <span className="nq-effects-icon">{soundEnabled ? "🔊" : "🔇"}</span>
            <span className="nq-control-label">{soundEnabled ? " On" : " Off"}</span>
          </button>
          <GamePauseButton onClick={() => setPaused(true)} />
        </div>
      </header>

      <IdleAnswerHint active={timerRunning && !paused && !mapOpen && !levelIntroActive && countdown === null && !locked && !isFinishedAllLevels && selected.length <= target} questionKey={`${levelIndex}-${target}-${selected.length}`} />
      <div className="nq-scene nq-scene--page">
        <div className="nq-cloud-wrapper nq-cloud-wrapper--page">
          <img src={cloudImg} className="nq-cloud-img" alt="" />
          <div className="nq-cloud-number">{target}</div>
          <div className="nq-drops-area" data-drop-count={level.dropCount}>
            {positions.map((pos, index) => (
                <img
                  key={index}
                  data-drop-index={index}
                  data-idle-answer={!selected.includes(index) && selected.length < target ? "true" : undefined}
                  src={dropImg}
                  className="nq-drop"
                  style={{ top: pos.top, left: pos.left, visibility: selected.includes(index) ? "hidden" : "visible" }}
                  onClick={() => handleClick(index)}
                  alt="raindrop"
                />
              ))}
          </div>
        </div>
      </div>

      {!isFinishedAllLevels && <button
        type="button"
        className="nq-submit-btn nq-submit-btn--page"
        data-idle-answer={selected.length === target ? "true" : undefined}
        onClick={checkAnswer}
        disabled={selected.length === 0 || locked || levelIntroActive || countdown !== null}
      >
        Submit
      </button>}

      <LevelIntroOverlay
        isOpen={levelIntroActive && introEnabled}
        content={NUMBERS_GAME_INTRO}
      />

      {countdown !== null && (
        <GameOverlay isOpen={countdown !== null}>
          <GamePopup
            title={<Countdown value={countdown} />}
            subtitle={COUNTDOWN_READY_SUBTITLE}
          />
        </GameOverlay>
      )}

      <GamePausePopup
        open={paused}
        subtitle="Ready to count more raindrops?"
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />

      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/numbers")}
        onReplay={() => {
          setGameOverOpen(false);
          setWrongAttempts(0);
          setTimeUpOpen(false);
          setSelected([]);
          setLocked(false);
          setCorrectRounds(0);
          setTimeLeft(30);
          setTimerRunning(false);
          generateRound();
          startCountdownOnly();
        }}
      />
      {timeUpOpen && !gameOverOpen && (
        <GameOverlay isOpen={timeUpOpen}>
          <GamePopup
            title="⏰ Time's up!"
            subtitle={`You completed ${correctRounds}/${totalRoundsToComplete} rounds in Level ${levelIndex + 1}.`}
            buttons={
              levelIndex < 2
                ? canProceedAfterTimeUp
                  ? [
                      {
                        label: `Proceed to Level ${levelIndex + 2}`,
                        onClick: () => {
                          setTimeUpOpen(false);
                          setCorrectRounds(0);
                          setLevelIndex((p) => Math.min(p + 1, 2));
                        },
                      },
                      {
                        label: "Replay Level",
                        onClick: () => {
                          setTimeUpOpen(false);
                          setCorrectRounds(0);
                          generateRound();
                          setTimeLeft(30);
                          startCountdownOnly();
                        },
                        variant: "secondary",
                      },
                    ]
                  : [
                      {
                        label: "Back to Lesson",
                        onClick: () => navigate("/quest/number"),
                      },
                      {
                        label: "Replay Level",
                        onClick: () => {
                          setTimeUpOpen(false);
                          setCorrectRounds(0);
                          generateRound();
                          setTimeLeft(30);
                          startCountdownOnly();
                        },
                        variant: "secondary",
                      },
                    ]
                : [
                    {
                      label: "Back to Lesson",
                      onClick: () => {
                        setTimeUpOpen(false);
                        navigate("/quest/number");
                      },
                      variant: "secondary",
                    },
                    {
                      label: "Replay Level",
                      onClick: () => {
                        setTimeUpOpen(false);
                        setCorrectRounds(0);
                        generateRound();
                        setTimeLeft(30);
                        startCountdownOnly();
                      },
                    },
                  ]
            }
          />
        </GameOverlay>
      )}

      {proceedPromptLevel !== null && levelIndex < 2 && (
        <GameOverlay isOpen={proceedPromptLevel !== null}>
          <GamePopup
            title="🎉 Awesome!"
            timeLeft={timeLeft}
            wrong={wrongAttempts}
            subtitle={`Level ${levelIndex + 1} complete! Proceed to Level ${levelIndex + 2}?`}
            buttons={[
              {
                label: "Yes",
                onClick: () => {
                  setProceedPromptLevel(null);
                  setCorrectRounds(0);
                  setLevelIndex((p) => Math.min(p + 1, 2));
                },
                variant: "yes",
              },
              {
                label: "No",
                onClick: () => {
                  setProceedPromptLevel(null);
                  setLevelSummaryOpen(true);
                },
                variant: "no",
              },
            ]}
          />
        </GameOverlay>
      )}

      {levelSummaryOpen && levelIndex < 2 && (
        <GameOverlay isOpen={levelSummaryOpen}>
          <GamePopup
            title="Keep playing?"
            subtitle={`Rounds: ${correctRounds}/${totalRoundsToComplete} | Wrong Attempts: ${wrongAttempts}`}
            buttons={[
              {
                label: "Back to Lesson",
                onClick: () => {
                  setLevelSummaryOpen(false);
                  navigate("/quest/number");
                },
                variant: "no",
              },
              {
                label: "Replay Level",
                onClick: () => {
                  setLevelSummaryOpen(false);
                  setCorrectRounds(0);
                  generateRound();
                  startCountdownOnly();
                },
                variant: "yes",
              },
            ]}
          />
        </GameOverlay>
      )}

      {!isFinishedAllLevels && <div className="nq-panel nq-panel--page">
        <div className="nq-message">{message}</div>
        <div className="nq-selection-count">
          Selected: {selected.length}/{target}
        </div>
        <div className="nq-score">
          Rounds: {correctRounds}/{totalRoundsToComplete} | Wrong Attempts: {wrongAttempts}
        </div>
      </div>}

      {isFinishedAllLevels && (
        <div className="nq-finish-overlay">
          <GameOverlay isOpen={isFinishedAllLevels}>
            <GamePopup
              title="🎉 Amazing!"
              timeLeft={timeLeft}
              wrong={wrongAttempts}
              subtitle="You finished all number levels!"
              buttons={[
                { label: "Games", onClick: () => navigate("/quest/number"), variant: "yes" },
              ]}
            >
              Rounds: {correctRounds}/{totalRoundsToComplete} | Wrong Attempts: {wrongAttempts}
            </GamePopup>
          </GameOverlay>
        </div>
      )}
    </div>
  );
}
