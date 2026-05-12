import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./NumbersQuestPage.css";
import { getOrCreateActiveChildId } from "../lib/childProgress";
import {
  loadPrimaryGameCodeForCategory,
  recordGameProgressRpc,
} from "../lib/gameProgressDb";
import { GameOverlay, GamePopup, Countdown } from "./GamePopup";
import bgMusic from "./bg-music-loop.mp3";

import cloudImg from "../Student/images/cloud.png";
import bgImg from "../Student/images/numbers-bg.jpg";
import dropImg from "../Student/images/rain.png";

type LevelName = "Easy" | "Medium" | "Hard";

type LevelConfig = {
  name: LevelName;
  targetMin: number;
  targetMax: number;
  dropCount: number;
};

const levels: LevelConfig[] = [
  { name: "Easy", targetMin: 1, targetMax: 3, dropCount: 5 },
  { name: "Medium", targetMin: 1, targetMax: 5, dropCount: 7 },
  { name: "Hard", targetMin: 1, targetMax: 9, dropCount: 10 },
];

type DropPos = { top: number; left: number };

const positionsByCount: Record<number, DropPos[]> = {
  5: [
    { top: 20, left: 350 },
    { top: 10, left: -90 },
    { top: 80, left: 240 },
    { top: 100, left: 10 },
    { top: 16, left: 125 },
  ],
  7: [
    { top: 10, left: -90 },
    { top: 0, left: 80 },
    { top: 20, left: 350 },
    { top: 70, left: -10 },
    { top: 80, left: 240 },
    { top: 120, left: 100 },
    { top: 108, left: 360 },
  ],
  10: [
    { top: 0, left: -90 },
    { top: 0, left: 80 },
    { top: 10, left: 260 },
    { top: 20, left: 430 },
    { top: 56, left: -30 },
    { top: 70, left: 140 },
    { top: 76, left: 320 },
    { top: 92, left: 480 },
    { top: 118, left: 70 },
    { top: 124, left: 380 },
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

  const [levelIndex, setLevelIndex] = useState(0);
  const [target, setTarget] = useState<number>(3);
  const [selected, setSelected] = useState<number[]>([]);
  const [wrongAttempts, setWrongAttempts] = useState<number>(0);
  const [locked, setLocked] = useState<boolean>(false);
  const [message, setMessage] = useState<string>(
    "Tap the raindrops that match the number!"
  );
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [proceedPromptLevel, setProceedPromptLevel] = useState<number | null>(
    null
  );
  const [levelSummaryOpen, setLevelSummaryOpen] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);
  const [isFinishedAllLevels, setIsFinishedAllLevels] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);

  const level = levels[levelIndex] ?? levels[0];

  const positions = useMemo(() => {
    const base = positionsByCount[level.dropCount] ?? positionsByCount[5];
    return base.slice(0, level.dropCount);
  }, [level.dropCount]);

  useEffect(() => {
    if (countdown === null) return;
    setTimerRunning(false);
    if (countdown <= 0) {
      setCountdown(null);
      setTimerRunning(true);
      return;
    }
    const t = window.setTimeout(() => setCountdown((p) => (p === null ? null : p - 1)), 900);
    return () => window.clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (!timerRunning) return;
    if (countdown !== null) return;
    if (proceedPromptLevel !== null || levelSummaryOpen || timeUpOpen) return;

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
  }, [timerRunning, timeLeft, countdown, proceedPromptLevel, levelSummaryOpen, timeUpOpen]);

  useEffect(() => {
    // reset on level change
    setTimeLeft(30);
    setTimerRunning(false);
    setCountdown(3);
    setSelected([]);
    setLocked(false);
    setWrongAttempts(0);
    setProceedPromptLevel(null);
    setLevelSummaryOpen(false);
    setTimeUpOpen(false);
    setIsFinishedAllLevels(false);
    warnedSecondsRef.current = new Set();
    setMessage("Tap the raindrops that match the number!");

    const num =
      Math.floor(Math.random() * (level.targetMax - level.targetMin + 1)) +
      level.targetMin;
    setTarget(num);
  }, [levelIndex, level.targetMax, level.targetMin]);

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
    const num =
      Math.floor(Math.random() * (level.targetMax - level.targetMin + 1)) +
      level.targetMin;
    setTarget(num);
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
      if (!("speechSynthesis" in window)) return;
      if (!voicesReady) {
        void window.speechSynthesis.getVoices();
      }
      if (options?.interrupt) {
        window.speechSynthesis.cancel();
      }
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
    // Initialize background music
    if (!bgMusicRef.current) {
      const audio = new Audio(bgMusic);
      audio.loop = true;
      audio.volume = 0.3;
      bgMusicRef.current = audio;

      if (musicEnabled) {
        audio.play().catch(() => {});
      }
    }

    return () => {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    // Handle music enabled/disabled toggle
    if (bgMusicRef.current) {
      if (musicEnabled && !isVoiceSpeakingRef.current) {
        bgMusicRef.current.play().catch(() => {});
      } else {
        bgMusicRef.current.pause();
      }
    }
  }, [musicEnabled]);

  useEffect(() => {
    // 3-2-1 start countdown voice + beep
    if (countdown === null) return;
    if (countdown <= 0) {
      sayKid("Go!", { interrupt: true, skipDedupe: true });
      playKidBeep(0);
      return;
    }
    sayKid(String(countdown), { interrupt: true, skipDedupe: true });
    playKidBeep(countdown);
  }, [countdown]);

  useEffect(() => {
    // 5-second warning voice + beep
    if (!timerRunning) return;
    if (countdown !== null) return;
    if (proceedPromptLevel !== null || levelSummaryOpen || timeUpOpen) return;
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
    if (countdown !== null) return;
    if (locked) return;
    setTimerRunning(true);
    if (selected.includes(id)) return;

    const nextCount = selected.length + 1;
    // Speak the count number (1,2,3...) while the kid taps
    sayKid(String(nextCount), { interrupt: true, skipDedupe: true });
    setSelected((prev) => [...prev, id]);
  };

  const checkAnswer = () => {
    if (countdown !== null) return;
    if (locked || selected.length === 0) return;

    setLocked(true);
    const isCorrect = selected.length === target;

    if (isCorrect) {
      setMessage("Great job! Correct!");
      setCorrectRounds((p) => {
        const next = p + 1;
        const finishedAll = levelIndex >= 2 && next >= totalRoundsToComplete;
        const maxSteps = levels.length * totalRoundsToComplete;
        const stepsDone = levelIndex * totalRoundsToComplete + next;
        const pct = finishedAll ? 100 : Math.round((stepsDone / maxSteps) * 100);
        void saveNumbersProgress(pct, finishedAll, wrongAttempts);

        if (next >= totalRoundsToComplete) {
          if (levelIndex >= 2) {
            setMessage("Amazing! You finished all levels!");
            setIsFinishedAllLevels(true);
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
  const canProceedAfterTimeUp = false;

  return (
    <div className="nq-page-bg nq-page-bg--no-card" style={{ backgroundImage: `url(${bgImg})` }}>
      <div className="nq-top-bar">
        <button type="button" className="nq-back-btn" onClick={() => navigate("/student")}>
          ← Back
        </button>
        <button type="button" className="nq-lesson-btn" onClick={() => navigate("/lesson/numbers")}>
          ← Lesson
        </button>
      </div>

      <div className="nq-meta-row nq-meta-row--page">
        <div className="nq-level-badge">
          Level {levelIndex + 1}: {level.name}
        </div>
        <div className="nq-timer">⏱ {timeLeft}s</div>
        <button
          type="button"
          className="nq-sound-toggle"
          onClick={() => {
            setMusicEnabled((prev) => {
              const next = !prev;
              if (bgMusicRef.current) {
                if (next && !isVoiceSpeakingRef.current) {
                  bgMusicRef.current.play().catch(() => {});
                } else {
                  bgMusicRef.current.pause();
                }
              }
              return next;
            });
          }}
          aria-label={musicEnabled ? "Turn music off" : "Turn music on"}
          title={musicEnabled ? "Mute Music" : "Unmute Music"}
        >
          {musicEnabled ? "🎵" : "🔇"}
        </button>
        <button
          type="button"
          className="nq-sound-toggle"
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
          {soundEnabled ? "🔊 On" : "🔇 Off"}
        </button>
      </div>

      <h2 className="nq-title nq-title--page">Count the Raindrops!</h2>
      <p className="nq-subtitle nq-subtitle--page">
        Tap the raindrops that match the number 💧
      </p>

      <div className="nq-scene nq-scene--page">
        <div className="nq-cloud-wrapper nq-cloud-wrapper--page">
          <img src={cloudImg} className="nq-cloud-img" alt="" />
          <div className="nq-cloud-number">{target}</div>

          <div className="nq-drops-area">
            {positions.map((pos, index) =>
              selected.includes(index) ? null : (
                <img
                  key={index}
                  src={dropImg}
                  className="nq-drop"
                  style={{ top: pos.top, left: pos.left }}
                  onClick={() => handleClick(index)}
                  alt="raindrop"
                />
              )
            )}
          </div>
        </div>

      </div>

      <button
        type="button"
        className="nq-submit-btn nq-submit-btn--page"
        onClick={checkAnswer}
        disabled={selected.length === 0 || locked || countdown !== null}
      >
        Submit
      </button>

      {countdown !== null && (
        <GameOverlay isOpen={countdown !== null}>
          <GamePopup
            title={<Countdown value={countdown} />}
            subtitle="Get ready!"
          />
        </GameOverlay>
      )}

      {timeUpOpen && (
        <GameOverlay isOpen={timeUpOpen}>
          <GamePopup
            title="⏰ Time's up!"
            subtitle={`Level ${levelIndex + 1} | Rounds: ${correctRounds}/${totalRoundsToComplete} | Wrong Attempts: ${wrongAttempts}`}
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
                          setCountdown(3);
                        },
                        variant: "secondary",
                      },
                    ]
                  : [
                      {
                        label: "Back to Lesson",
                        onClick: () => navigate("/lesson/numbers"),
                      },
                      {
                        label: "Replay Level",
                        onClick: () => {
                          setTimeUpOpen(false);
                          setCorrectRounds(0);
                          generateRound();
                          setTimeLeft(30);
                          setCountdown(3);
                        },
                        variant: "secondary",
                      },
                    ]
                : [
                    {
                      label: "Back to Lesson",
                      onClick: () => {
                        setTimeUpOpen(false);
                        navigate("/lesson/numbers");
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
                        setCountdown(3);
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
            title="🎉 Level Complete!"
            subtitle={`Proceed to Level ${levelIndex + 2}?`}
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
            title={message}
            subtitle={`Rounds: ${correctRounds}/${totalRoundsToComplete} | Wrong Attempts: ${wrongAttempts}`}
            buttons={[
              {
                label: "Back to Lesson",
                onClick: () => {
                  setLevelSummaryOpen(false);
                  navigate("/lesson/numbers");
                },
                variant: "no",
              },
              {
                label: "Replay Level",
                onClick: () => {
                  setLevelSummaryOpen(false);
                  setCorrectRounds(0);
                  generateRound();
                  setCountdown(3);
                },
                variant: "yes",
              },
            ]}
          />
        </GameOverlay>
      )}

      <div className="nq-panel nq-panel--page">
        <div className="nq-message">{message}</div>
        <div className="nq-score">
          Rounds: {correctRounds}/{totalRoundsToComplete} | Wrong Attempts: {wrongAttempts}
        </div>
        {isFinishedAllLevels && (
          <div className="nq-actions">
            <button
              type="button"
              className="nq-action-btn nq-action-btn--play"
              onClick={() => {
                setIsFinishedAllLevels(false);
                setCorrectRounds(0);
                setLevelIndex(0);
              }}
            >
              Play Again
            </button>
            <button
              type="button"
              className="nq-action-btn nq-action-btn--progress"
              onClick={() => navigate("/parent-progress")}
            >
              View Progress
            </button>
          </div>
        )}
      </div>
    </div>
  );
}