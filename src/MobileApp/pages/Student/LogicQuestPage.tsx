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
import { supabase } from "../../../lib/supabase";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { GameOverlay, GamePopup, Countdown } from "./GamePopup";
import {
  useLevelIntro,
  LevelIntroOverlay,
  COUNTDOWN_READY_SUBTITLE,
  type LevelIntroContent,
} from "./levelIntro";
import bgMusic from "./bg-music-loop.mp3";
import { speakNative } from "../../nativeTts";

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
    sequence: ["â˜€ï¸", "â˜ï¸", "â˜€ï¸"],
    correctId: "cloud",
    choices: [
      { id: "sun", emoji: "â˜€ï¸" },
      { id: "cloud", emoji: "â˜ï¸" },
    ],
  },
  {
    id: "shape_pattern",
    // Level 2: ABB repeating pattern (harder than ABA)
    // ðŸŸ¦ ðŸŸ¥ ðŸŸ¥  ðŸŸ¦ ðŸŸ¥ ðŸŸ¥  â“
    sequence: ["ðŸŸ¦", "ðŸŸ¥", "ðŸŸ¥", "ðŸŸ¦", "ðŸŸ¥", "ðŸŸ¥"],
    correctId: "blue",
    choices: [
      { id: "blue", emoji: "ðŸŸ¦" },
      { id: "red", emoji: "ðŸŸ¥" },
    ],
  },
  {
    // harder: repeating 3-symbol pattern (A B C)
    id: "abc_repeat",
    sequence: ["ðŸ”º", "ðŸ”µ", "ðŸŸ¥", "ðŸ”º", "ðŸ”µ", "ðŸŸ¥"],
    correctId: "triangle",
    choices: [
      { id: "triangle", emoji: "ðŸ”º" },
      { id: "circle", emoji: "ðŸ”µ" },
      { id: "square", emoji: "ðŸŸ¥" },
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
      {droppedEmoji ?? "â“"}
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
  const [score, setScore] = useState(0);
  const [dropped, setDropped] = useState<string | null>(null);
  const [time, setTime] = useState(30);
  const [level, setLevel] = useState(0);
  const [proceedPromptLevel, setProceedPromptLevel] = useState<number | null>(null);
  const [showCongratsPanel, setShowCongratsPanel] = useState(false);
  const [showNoPrompt, setShowNoPrompt] = useState(false);
  const [isStarted, setIsStarted] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [message, setMessage] = useState("Drag the correct symbol into the box!");
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);
  const playSession = 0;
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  const currentLevel = logicLevels[level];
  const canProceedAfterTimeUp = false;

  const startCountdown = useCallback(() => setCountdown(3), []);

  const introEnabled =
    isStarted &&
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
    onLevelStart();
  }, [level, onLevelStart]);

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
    if (proceedPromptLevel !== null) return; // âœ… pause timer kapag level complete popup lumabas
  
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
    if (!isStarted || levelIntroActive || countdown !== null || popup === "TIME_UP" || time === 0)
      return;

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
    if (!isStarted || levelIntroActive || countdown !== null || popup === "TIME_UP" || time === 0)
      return;

    const dragged = String(event.active.id);
    const targetId = event.over?.id ? String(event.over.id) : null;
    if (targetId !== "logic-drop-target") return;

    handleDropChoice(dragged);
  };

  const handleBack = () => {
    navigate("/lesson/logic", { replace: true });
  };

  const handleRestart = () => {
    // Play Again skips the instruction card and begins at 3, 2, 1.
    cancelIntro();
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
      <button className="lq-back-btn" onClick={handleBack}>
        â† Back
      </button>

      <h2 className="lq-main-title">What comes next?</h2>

      <div className="lq-meta-row">
        <span className="lq-level-pill">Level {level + 1}</span>
        <span className={`timer ${time <= 5 ? "timer-warning" : ""}`}>â± {time}s</span>
        <button
          type="button"
          className="lq-sound-toggle lq-music-toggle"
          onClick={() => setMusicEnabled((prev) => !prev)}
          aria-label={musicEnabled ? "Mute music" : "Unmute music"}
          title={musicEnabled ? "Mute Music" : "Unmute Music"}
        >
          {musicEnabled ? "ðŸŽµ" : "ðŸ”‡"}
        </button>
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
          {soundEnabled ? "ðŸ”Š" : "ðŸ”‡"}
        </button>
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
              title="ðŸŽ‰ Amazing!"
              subtitle="You completed all logic levels!"
              buttons={[
                { label: "Play Again", onClick: handleRestart, variant: "yes" },
                {
                  label: "View Progress",
                  onClick: () => navigate("/parent-progress"),
                  variant: "secondary",
                },
              ]}
            >
              Progress: {score}/{logicLevels.length} | Wrong Attempts: {wrong}
            </GamePopup>
          </GameOverlay>
        </div>
      )}

      {/* â­ LEVEL PROCEED POPUP */}
      {proceedPromptLevel !== null && (
        <GameOverlay isOpen={proceedPromptLevel !== null}>
          <GamePopup
            title="ðŸŽ‰ Awesome!"
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

      <LevelIntroOverlay
        isOpen={levelIntroActive && introEnabled}
        content={LOGIC_GAME_INTRO}
      />

      {countdown !== null && !popup && !isFinished && (
        <GameOverlay isOpen={countdown !== null}>
          <GamePopup
            title={<Countdown value={countdown} />}
            subtitle={COUNTDOWN_READY_SUBTITLE}
          />
        </GameOverlay>
      )}

{popup === "TIME_UP" && (
  <GameOverlay isOpen={popup === "TIME_UP"}>
    <GamePopup
      title="â° Time's up!"
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


