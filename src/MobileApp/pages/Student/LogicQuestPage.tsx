import { useState, useEffect, useRef, useCallback } from "react";
import "./LogicQuestPage.css";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import lion_think from "../../../img/lion_think.png";
import { recordGameProgressRpc, loadPrimaryGameCodeForCategory } from "../../../lib/gameProgressDb";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { GameOverlay, GamePopup, Countdown, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import {
  useLevelIntro,
  LevelIntroOverlay,
  COUNTDOWN_READY_SUBTITLE,
  type LevelIntroContent,
} from "./levelIntro";
import { speakNative } from "../../nativeTts";
import QuestLevelSelect from "./QuestLevelSelect";
import ChildMusicToggle from "./ChildMusicToggle";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { LiveStarHud } from "./LevelStars";

const LOGIC_GAME_INTRO: LevelIntroContent = {
  title: "What comes next?",
  subtitle: "Look at the pattern and drag the right picture into the box.",
  speech: "What comes next? Look at the pattern and drag the right picture into the box.",
};

type LogicChoice = { id: string; emoji: string };
type LogicLevel = {
  id: string;
  sequence: string[];
  correctId: string;
  choices: LogicChoice[];
};

const logicLevels: LogicLevel[] = [
  {
    id: "sun_cloud",
    sequence: ["☀️", "☁️", "☀️"],
    correctId: "cloud",
    choices: [
      { id: "sun", emoji: "☀️" },
      { id: "cloud", emoji: "☁️" },
    ],
  },
  {
    id: "shape_pattern",
    // Level 2: ABB repeating pattern (harder than ABA)
    // 🟦 🟥 🟥  🟦 🟥 🟥  ❓
    sequence: ["🟦", "🟥", "🟥", "🟦", "🟥", "🟥"],
    correctId: "blue",
    choices: [
      { id: "blue", emoji: "🟦" },
      { id: "red", emoji: "🟥" },
    ],
  },
  {
    // harder: repeating 3-symbol pattern (A B C)
    id: "abc_repeat",
    sequence: ["🔺", "🔵", "🟥", "🔺", "🔵", "🟥"],
    correctId: "triangle",
    choices: [
      { id: "triangle", emoji: "🔺" },
      { id: "circle", emoji: "🔵" },
      { id: "square", emoji: "🟥" },
    ],
  },
];

function DraggableChoice({
  id,
  emoji,
  disabled,
}: {
  id: string;
  emoji: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      disabled,
    });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.72 : 1,
    zIndex: isDragging ? 30 : 1,
    cursor: disabled ? "default" : "grab",
  };

  return (
    <div
      ref={setNodeRef}
      className={`choice-btn2 ${isDragging ? "choice-btn2-dragging" : ""}`}
      style={style}
      {...listeners}
      {...attributes}
    >
      {emoji}
    </div>
  );
}

function DropTarget({
  dropped,
  choices,
}: {
  dropped: string | null;
  choices: LogicChoice[];
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: "logic-drop-target",
  });

  const droppedEmoji =
    dropped ? choices.find((c) => c.id === dropped)?.emoji ?? null : null;

  return (
    <span
      ref={setNodeRef}
      className={`drop-box ${isOver ? "drop-box-over" : ""}`}
    >
      {droppedEmoji ?? "❓"}
    </span>
  );
}

export default function Level2Pattern() {
  const navigate = useNavigate();
  // Android touch support: a short movement starts dragging without page scrolling.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    // A small delay prevents accidental taps but lets children switch choices
    // immediately after releasing a previous drag on Android WebView.
    useSensor(TouchSensor, { activationConstraint: { delay: 25, tolerance: 12 } })
  );

  const [popup, setPopup] = useState("");
  const [wrong, setWrong] = useState(0);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [dropped, setDropped] = useState<string | null>(null);
  const [time, setTime] = useState(30);
  const [level, setLevel] = useState(0);
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("logic");
  const [proceedPromptLevel, setProceedPromptLevel] = useState<number | null>(null);
  const [showCongratsPanel, setShowCongratsPanel] = useState(false);
  const [showNoPrompt, setShowNoPrompt] = useState(false);
  const [isStarted, setIsStarted] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState("Drag the correct symbol into the box!");
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);
  const playSession = 0;
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  useStarTimeUp(popup === "TIME_UP", level, score > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    setGameOverOpen(true);
    setPopup("");
    void recordLevelResult(level, { finished: false, tried: true, wrongAttempts: wrong });
  }, [level, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  const currentLevel = logicLevels[level];
  const canProceedAfterTimeUp = false;

  const startCountdown = useCallback(() => setCountdown(3), []);

  const introEnabled =
    isStarted &&
    !mapOpen &&
    !popup &&
    !isFinished &&
    proceedPromptLevel === null &&
    !showNoPrompt;

  const { levelIntroActive, onLevelStart, startCountdownOnly, cancelIntro } = useLevelIntro({
    content: LOGIC_GAME_INTRO,
    soundEnabled,
    enabled: introEnabled,
    sessionKey: playSession,
    onStartCountdown: startCountdown,
  });

  useEffect(() => {
    setDropped(null);
    setCountdown(null);
    setTime(30);
    warnedSecondsRef.current = new Set();
    if (!mapOpen) onLevelStart();
  }, [level, onLevelStart, mapOpen]);

  // Prevent transformed drag elements from moving the Android viewport sideways.
  useEffect(() => {
    const previousBodyOverflowX = document.body.style.overflowX;
    const previousHtmlOverflowX = document.documentElement.style.overflowX;
    document.body.style.overflowX = "hidden";
    document.documentElement.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = previousBodyOverflowX;
      document.documentElement.style.overflowX = previousHtmlOverflowX;
    };
  }, []);

  const sayKid = (text: string) => {
    try {
      if (!soundEnabled) return;
      if (speakNative(text, { interrupt: true, pitch: 1.3 })) return;
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1;
      utterance.pitch = 1.25;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore speech errors
    }
  };

  const speakFeedback = (text: string) => {
    try {
      if (!soundEnabled) return;
      if (speakNative(text, { pitch: 1.3 })) return;
      if (!("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((v) =>
          /(female|girl|kid|child|zira|samantha|jenny)/i.test(v.name)
        ) || voices[0];

      if (voice) utterance.voice = voice;

      utterance.rate = 1;
      utterance.pitch = 1.4;
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
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      // ignore audio errors
    }
  };

  useEffect(() => {
    if (levelIntroActive) return;
    if (!isStarted) return;
    if (countdown === null) return;
    if (popup || isFinished || proceedPromptLevel !== null || showNoPrompt) return;

    if (countdown <= 0) {
      setCountdown(null);
      sayKid("Go!");
      playKidBeep(0);
      return;
    }

    const voiceTimer = window.setTimeout(() => {
      sayKid(String(countdown));
      playKidBeep(countdown);
    }, 0);
    const nextTimer = window.setTimeout(
      () => setCountdown((p) => (p === null ? null : p - 1)),
      850
    );

    return () => {
      window.clearTimeout(voiceTimer);
      window.clearTimeout(nextTimer);
    };
  }, [
    levelIntroActive,
    isStarted,
    countdown,
    popup,
    isFinished,
    proceedPromptLevel,
    showNoPrompt,
    soundEnabled,
  ]);

  useEffect(() => {
    if (!isStarted) return;
    if (isFinished) return;
    if (levelIntroActive || countdown !== null) return;
    if (popup) return;
    if (paused) return;
    if (proceedPromptLevel !== null) return; // ✅ pause timer kapag level complete popup lumabas
  
    if (time === 0) {
      setPopup("TIME_UP");
      setMessage("Time's up!");
      sayKid("Time's up!");
      playKidBeep(0);
      const percent = Math.round((score / logicLevels.length) * 100);
      void saveProgress(percent, false, wrong);
      return;
    }
  
    const timer = setInterval(() => {
      setTime((t) => t - 1);
    }, 1000);
  
    return () => clearInterval(timer);
  }, [time, isFinished, isStarted, countdown, proceedPromptLevel, popup, score, wrong, paused]);

  useEffect(() => {
    if (!isStarted) return;
    if (countdown !== null) return;
    if (popup || isFinished || proceedPromptLevel !== null || showNoPrompt) return;
    if (time > 5 || time <= 0) return;
    if (warnedSecondsRef.current.has(time)) return;

    warnedSecondsRef.current.add(time);
    sayKid(String(time));
    playKidBeep(time);
  }, [isStarted, countdown, popup, isFinished, proceedPromptLevel, showNoPrompt, time, soundEnabled]);

  useEffect(() => {
    const loadProgressContext = async () => {
      const id = await getOrCreateActiveChildId();
      setChildId(id);

      const primaryGameCode = await loadPrimaryGameCodeForCategory("logic");
      if (primaryGameCode) setGameCode(primaryGameCode);
    };

    void loadProgressContext();
  }, []);

  const saveProgress = async (nextScore: number, finished: boolean, attempts: number) => {
    if (!childId || !gameCode) return;

    await recordGameProgressRpc(childId, gameCode, nextScore, attempts, finished);
  };

  const handleDropChoice = (value: string) => {
    if (!isStarted || levelIntroActive || countdown !== null || popup === "TIME_UP" || gameOverOpen || time === 0 || paused)
      return;

    setDropped(value);

    if (value === currentLevel.correctId) {
      const nextScore = score + 1;
      const percent = Math.round((nextScore / logicLevels.length) * 100);
      const finished = level === logicLevels.length - 1;

      setScore(nextScore);
      speakFeedback("Great job!");
      void saveProgress(percent, finished, wrong);
      void completeLevel(level, { timeLeft: time, wrongAttempts: wrong });

      if (finished) {
        setIsFinished(true);
        setShowCongratsPanel(true);
        setMessage("Amazing! You completed all logic levels!");
        sayKid("Congratulations! Amazing thinking! You completed all logic levels!");
      } else {
        setMessage(`Great job! Level ${level + 1} complete!`);
        setShowCongratsPanel(false);
        setTimeout(() => setProceedPromptLevel(level), 450);
      }
    } else {
      const nextWrong = wrong + 1;
      setWrong(nextWrong);
      setMessage("Oops! Try the other symbol.");
      speakFeedback("Try again!");
      const percent = Math.round((score / logicLevels.length) * 100);
      void saveProgress(percent, false, nextWrong);
      setDropped(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!isStarted || levelIntroActive || countdown !== null || popup === "TIME_UP" || gameOverOpen || time === 0)
      return;

    const dragged = String(event.active.id);
    const targetId = event.over?.id ? String(event.over.id) : null;
    if (targetId !== "logic-drop-target") return;

    handleDropChoice(dragged);
  };

  const handleBack = () => {
    navigate("/quest/logic", { replace: true });
  };

  const handleRestart = () => {
    // Play Again skips the instruction card and begins at 3, 2, 1.
    cancelIntro();
    setTime(30);
    setScore(0);
    setWrong(0);
    setGameOverOpen(false);
    setDropped(null);
    setLevel(0);
    setProceedPromptLevel(null);
    setShowCongratsPanel(false);
    setPopup("");
    setIsFinished(false);
    setIsStarted(true);
    setCountdown(null);
    warnedSecondsRef.current = new Set();
    setMessage("Drag the correct symbol into the box!");
    window.setTimeout(() => startCountdownOnly(), 120);
  };

  const handleProceed = () => {
    setLevel((l) => l + 1);
    setProceedPromptLevel(null);
    setShowCongratsPanel(false);
    setPopup("");
    setMessage("Drag the correct symbol into the box!");
  };

  const handleReplayLevel = () => {
    setPopup("");
    setDropped(null);
    setTime(30);
    startCountdownOnly();
    warnedSecondsRef.current = new Set();
    setMessage("Drag the correct symbol into the box!");
  };

  return (
    <div className="pattern logic-bg-image">
      {mapOpen && (
        <QuestLevelSelect
          title="Logic Quest"
          unlockedCount={unlockedCount}
          levelStars={levelStars}
          onSelectLevel={(index) => {
            setLevel(index);
            setMapOpen(false);
          }}
          onBack={handleBack}
        />
      )}
      <button className="lq-back-btn" onClick={() => setMapOpen(true)}>
        {"\u2190"} Map
      </button>

      <h2 className="lq-main-title">What comes next?</h2>

      <div className="lq-meta-row">
        <span className="lq-level-pill">Level {level + 1}</span>
        <LiveStarHud timeLeft={time} tried={score > 0 || wrong > 0} wrong={wrong} />
        <span className={`timer ${time <= 5 ? "timer-warning" : ""}`}>⏱ {time}s</span>
        <ChildMusicToggle />
        <button
          type="button"
          className="lq-sound-toggle lq-effects-toggle"
          onClick={() => {
            setSoundEnabled((prev) => {
              const next = !prev;
              if (!next && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
              }
              return next;
            });
          }}
          aria-label={soundEnabled ? "Mute sound" : "Unmute sound"}
          title={soundEnabled ? "Mute Sound" : "Unmute Sound"}
        >
          {soundEnabled ? "🔊" : "🔇"}
        </button>
        <GamePauseButton onClick={() => setPaused(true)} />
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="pattern-content">
          <img src={lion_think} className="lion-think" />

          <div className="pattern-right">
            <div className={`pattern-box ${currentLevel.sequence.length > 4 ? "pattern-box--dense" : ""}`}>
              <span className="pattern-seq">
                {currentLevel.sequence.map((symbol, idx) => (
                  <span key={`${currentLevel.id}-${idx}`} className="pattern-item">
                    {symbol}
                  </span>
                ))}
              </span>
              <DropTarget dropped={dropped} choices={currentLevel.choices} />
            </div>

            <div className="choices">
              {currentLevel.choices.map((c) => (
                <DraggableChoice
                  key={c.id}
                  id={c.id}
                  emoji={c.emoji}
                  disabled={
                    !isStarted ||
                    levelIntroActive ||
                    countdown !== null ||
                    time === 0 ||
                    isFinished
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </DndContext>

      {!isFinished && <div className={`lq-panel ${showCongratsPanel ? "lq-panel-congrats" : ""}`}>
        <p className="lq-message">{message}</p>
        <p className="lq-progress">
          Progress: {score}/{logicLevels.length} | Wrong Attempts: {wrong}
        </p>
      </div>}

      {isFinished && (
        <div className="lq-finish-overlay">
          <GameOverlay isOpen={isFinished}>
            <GamePopup
              title="🎉 Amazing!"
              subtitle="You completed all logic levels!"
              buttons={[
                { label: "Games", onClick: handleBack, variant: "yes" },
                { label: "Play Again", onClick: handleRestart, variant: "secondary" },
              ]}
            >
              Progress: {score}/{logicLevels.length} | Wrong Attempts: {wrong}
            </GamePopup>
          </GameOverlay>
        </div>
      )}

      {/* ⭐ LEVEL PROCEED POPUP */}
      {proceedPromptLevel !== null && (
        <GameOverlay isOpen={proceedPromptLevel !== null}>
          <GamePopup
            title="🎉 Awesome!"
            subtitle={`Level ${level + 1} complete! Proceed to Level ${level + 2}?`}
            buttons={[
              {
                label: "Yes",
                onClick: handleProceed,
                variant: "yes",
              },
              {
                label: "No",
                onClick: () => {
                  setProceedPromptLevel(null);
                  setShowNoPrompt(true);
                },
                variant: "no",
              },
            ]}
          />
        </GameOverlay>
      )}

      {showNoPrompt && (
        <GameOverlay isOpen={showNoPrompt}>
          <GamePopup
            title="Keep playing?"
            subtitle={`Progress: ${score}/${logicLevels.length} | Wrong Attempts: ${wrong}`}
            buttons={[
              {
                label: "Games",
                onClick: () => {
                  setShowNoPrompt(false);
                  handleBack();
                },
                variant: "secondary",
              },
              {
                label: "Replay Level",
                onClick: () => {
                  setShowNoPrompt(false);
                  handleReplayLevel();
                },
                variant: "yes",
              },
            ]}
          />
        </GameOverlay>
      )}

      <LevelIntroOverlay
        isOpen={levelIntroActive && introEnabled}
        content={LOGIC_GAME_INTRO}
      />

      <GamePausePopup
        open={paused}
        subtitle="Ready to finish the pattern?"
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />

      {countdown !== null && !popup && !isFinished && (
        <GameOverlay isOpen={countdown !== null}>
          <GamePopup
            title={<Countdown value={countdown} />}
            subtitle={COUNTDOWN_READY_SUBTITLE}
          />
        </GameOverlay>
      )}

      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/logic")}
        onReplay={() => {
          setGameOverOpen(false);
          setWrong(0);
          setDropped(null);
          setPopup("");
        }}
      />
{popup === "TIME_UP" && !gameOverOpen && (
  <GameOverlay isOpen={popup === "TIME_UP"}>
    <GamePopup
      title="⏰ Time's up!"
      subtitle={`You completed ${score}/${logicLevels.length} logic levels in Level ${level + 1}.`}
      buttons={
        level < logicLevels.length - 1
          ? canProceedAfterTimeUp
            ? [
                {
                  label: `Proceed to Level ${level + 2}`,
                  onClick: handleProceed,
                },
                {
                  label: "Replay Level",
                  onClick: handleReplayLevel,
                  variant: "secondary",
                },
              ]
            : [
                {
                  label: "Map",
                  onClick: () => {
                    setPopup("");
                    setMapOpen(true);
                  },
                },
                {
                  label: "Replay Level",
                  onClick: handleReplayLevel,
                  variant: "secondary",
                },
              ]
          : [
              {
                label: "Games",
                onClick: handleBack,
                variant: "secondary",
              },
              {
                label: "Replay Level",
                onClick: handleReplayLevel,
              },
            ]
      }
    />
  </GameOverlay>
)}

    </div>
  );
}


