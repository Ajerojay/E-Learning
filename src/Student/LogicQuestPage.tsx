import { useState, useEffect, useRef } from "react";
import "./LogicQuestPage.css";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragEndEvent,
} from "@dnd-kit/core";
import lion_think from "../img/lion_think.png";
import { supabase } from "../lib/supabase";
import { getOrCreateActiveChildId } from "../lib/childProgress";
import { GameOverlay, GamePopup, Countdown } from "./GamePopup";
import bgMusic from "./bg-music-loop.mp3";

const COUNTDOWN_INTRO_DELAY_MS = 1200;

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

  const [popup, setPopup] = useState("");
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [dropped, setDropped] = useState<string | null>(null);
  const [time, setTime] = useState(30);
  const [level, setLevel] = useState(0);
  const [proceedPromptLevel, setProceedPromptLevel] = useState<number | null>(null);
  const [showCongratsPanel, setShowCongratsPanel] = useState(false);
  const [showNoPrompt, setShowNoPrompt] = useState(false);
  const [isStarted, setIsStarted] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [message, setMessage] = useState("Drag the correct symbol into the box!");
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

  const currentLevel = logicLevels[level];
  const canProceedAfterTimeUp = false;

  // ⏱ TIMER
  const [isFinished, setIsFinished] = useState(false);
  const sayKid = (text: string) => {
    try {
      if (!soundEnabled || !("speechSynthesis" in window)) return;
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
      if (!soundEnabled || !("speechSynthesis" in window)) return;
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
    if (!bgMusicRef.current) {
      const audio = new Audio(bgMusic);
      audio.loop = true;
      audio.volume = 0.25;
      bgMusicRef.current = audio;
      if (musicEnabled) audio.play().catch(() => {});
    }

    return () => {
      bgMusicRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const audio = bgMusicRef.current;
    if (!audio) return;
    if (musicEnabled) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [musicEnabled]);

  useEffect(() => {
    if (!isStarted) return;
    if (countdown === null) return;
    if (popup || isFinished || proceedPromptLevel !== null || showNoPrompt) return;

    if (countdown <= 0) {
      setCountdown(null);
      sayKid("Go!");
      playKidBeep(0);
      return;
    }

    const introDelay = countdown === 3 ? COUNTDOWN_INTRO_DELAY_MS : 0;
    const voiceTimer = window.setTimeout(() => {
      sayKid(String(countdown));
      playKidBeep(countdown);
    }, introDelay);
    const nextTimer = window.setTimeout(
      () => setCountdown((p) => (p === null ? null : p - 1)),
      introDelay + 850
    );

    return () => {
      window.clearTimeout(voiceTimer);
      window.clearTimeout(nextTimer);
    };
  }, [
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
    if (countdown !== null) return;
    if (popup) return;
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
  }, [time, isFinished, isStarted, countdown, proceedPromptLevel, popup, score, wrong]);

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

      const { data: logicCategory, error: categoryError } = await supabase
        .from("learning_categories")
        .select("id")
        .eq("code", "logic")
        .maybeSingle();

      if (categoryError || !logicCategory?.id) {
        console.error("Unable to load logic category id.");
        return;
      }

      const { data: games, error: gamesError } = await supabase
        .from("learning_games")
        .select("game_code")
        .eq("category_id", logicCategory.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (gamesError) {
        console.error("Unable to load logic game code.");
        return;
      }

      const firstGame = Array.isArray(games) ? games[0] : null;
      if (firstGame?.game_code) {
        setGameCode(firstGame.game_code);
      }
    };

    void loadProgressContext();
  }, []);

  const saveProgress = async (nextScore: number, finished: boolean, attempts: number) => {
    if (!childId || !gameCode) return;

    const { error } = await supabase.rpc("record_game_attempt", {
      p_child_id: childId,
      p_game_code: gameCode,
      p_score: nextScore,
      p_wrong_attempts: attempts,
      p_finished: finished,
    });

    if (error) {
      console.error("Failed to save logic progress:", error.message);
    }
  };

  const handleDropChoice = (value: string) => {
    if (!isStarted || countdown !== null || popup === "TIME_UP" || time === 0) return;

    setDropped(value);

    if (value === currentLevel.correctId) {
      const nextScore = score + 1;
      const percent = Math.round((nextScore / logicLevels.length) * 100);
      const finished = level === logicLevels.length - 1;

      setScore(nextScore);
      speakFeedback("Great job!");
      void saveProgress(percent, finished, wrong);

      if (finished) {
        setIsFinished(true);
        setShowCongratsPanel(true);
        setMessage("Amazing! You completed all logic levels!");
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
    if (!isStarted || countdown !== null || popup === "TIME_UP" || time === 0) return;

    const dragged = String(event.active.id);
    const targetId = event.over?.id ? String(event.over.id) : null;
    if (targetId !== "logic-drop-target") return;

    handleDropChoice(dragged);
  };

  const handleBack = () => {
    navigate("/lesson/logic");
  };

  const handleRestart = () => {
    setTime(30);
    setScore(0);
    setWrong(0);
    setDropped(null);
    setLevel(0);
    setProceedPromptLevel(null);
    setShowCongratsPanel(false);
    setPopup("");
    setIsFinished(false);
    setIsStarted(true);
    setCountdown(3);
    warnedSecondsRef.current = new Set();
    setMessage("Drag the correct symbol into the box!");
  };

  const handleProceed = () => {
    setLevel((l) => l + 1);
    setProceedPromptLevel(null);
    setShowCongratsPanel(false);
    setPopup("");
    setDropped(null);
    setTime(30);
    setCountdown(3);
    warnedSecondsRef.current = new Set();
    setMessage("Drag the correct symbol into the box!");
  };

  const handleReplayLevel = () => {
    setPopup("");
    setDropped(null);
    setTime(30);
    setCountdown(3);
    warnedSecondsRef.current = new Set();
    setMessage("Drag the correct symbol into the box!");
  };

  return (
    <div className="pattern logic-bg-image">
      <button className="lq-back-btn" onClick={handleBack}>
        ← Back
      </button>

      <h2 className="lq-main-title">What comes next?</h2>

      <div className="lq-meta-row">
        <span className="lq-level-pill">Level {level + 1}</span>
        <span className={`timer ${time <= 5 ? "timer-warning" : ""}`}>⏱ {time}s</span>
        <button
          type="button"
          className="lq-sound-toggle"
          onClick={() => setMusicEnabled((prev) => !prev)}
          aria-label={musicEnabled ? "Mute music" : "Unmute music"}
          title={musicEnabled ? "Mute Music" : "Unmute Music"}
        >
          {musicEnabled ? "🎵" : "🔇"}
        </button>
        <button
          type="button"
          className="lq-sound-toggle"
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
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="pattern-content">
          <img src={lion_think} className="lion-think" />

          <div className="pattern-right">
            <div className="pattern-box">
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
                  disabled={!isStarted || countdown !== null || time === 0 || isFinished}
                />
              ))}
            </div>
          </div>
        </div>
      </DndContext>

      <div className={`lq-panel ${showCongratsPanel ? "lq-panel-congrats" : ""}`}>
        <p className="lq-message">{message}</p>
        <p className="lq-progress">
          Progress: {score}/{logicLevels.length} | Wrong Attempts: {wrong}
        </p>
        {isFinished && (
          <div className="lq-actions">
            <button className="lq-action-btn" onClick={handleRestart}>
              Play Again
            </button>
            <button
              className="lq-action-btn success"
              onClick={() => navigate("/parent-progress")}
            >
              View Progress
            </button>
          </div>
        )}
      </div>

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
                label: "Back to Lesson",
                onClick: () => {
                  setShowNoPrompt(false);
                  navigate("/lesson/logic");
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

      {countdown !== null && !popup && !isFinished && (
        <GameOverlay isOpen={countdown !== null}>
          <GamePopup
            title={<Countdown value={countdown} />}
            subtitle="Get ready!"
          />
        </GameOverlay>
      )}

{popup === "TIME_UP" && (
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
                  label: "Back to Lesson",
                  onClick: handleBack,
                },
                {
                  label: "Replay Level",
                  onClick: handleReplayLevel,
                  variant: "secondary",
                },
              ]
          : [
              {
                label: "Back to Lesson",
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

