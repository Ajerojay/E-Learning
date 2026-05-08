import { useState, useEffect } from "react";
import "./LogicQuestPage.css";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragEndEvent,
} from "@dnd-kit/core";
import lion_think from "../img/lion_think.png";
import { supabase } from "../lib/supabase";
import { getOrCreateActiveChildId } from "../lib/childProgress";

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
  const location = useLocation();
  const openedFromLesson = Boolean(
    (location.state as { showStartPopup?: boolean } | null)?.showStartPopup
  );

  const [popup, setPopup] = useState("");
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [dropped, setDropped] = useState<string | null>(null);
  const [time, setTime] = useState(30);
  const [level, setLevel] = useState(0);
  const [proceedPromptLevel, setProceedPromptLevel] = useState<number | null>(null);
  const [showCongratsPanel, setShowCongratsPanel] = useState(false);
  const [showStartPopup, setShowStartPopup] = useState(openedFromLesson);
  const [isStarted, setIsStarted] = useState(!openedFromLesson);
  const [message, setMessage] = useState("Drag the correct symbol into the box!");
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);

  const currentLevel = logicLevels[level];

  // ⏱ TIMER
  const [isFinished, setIsFinished] = useState(false);
  useEffect(() => {
    if (!isStarted) return;
    if (isFinished) return;
    if (proceedPromptLevel !== null) return; // ✅ pause timer kapag level complete popup lumabas
  
    if (time === 0) {
      setPopup("TIME_UP");
      return;
    }
  
    const timer = setInterval(() => {
      setTime((t) => t - 1);
    }, 1000);
  
    return () => clearInterval(timer);
  }, [time, isFinished, isStarted, proceedPromptLevel]);

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
    if (!isStarted || time === 0) return;

    setDropped(value);

    if (value === currentLevel.correctId) {
      const nextScore = score + 1;
      const percent = Math.round((nextScore / logicLevels.length) * 100);
      const finished = level === logicLevels.length - 1;

      setScore(nextScore);
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
      void saveProgress(0, false, nextWrong);
      setDropped(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!isStarted || time === 0) return;

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
    setShowStartPopup(false);
    setMessage("Drag the correct symbol into the box!");
  };

  const handleProceed = () => {
    setLevel((l) => l + 1);
    setProceedPromptLevel(null);
    setShowCongratsPanel(false);
    setPopup("");
    setDropped(null);
    setTime(30);
    setMessage("Drag the correct symbol into the box!");
  };

  const handleReplayLevel = () => {
    setPopup("");
    setDropped(null);
    setTime(30);
    setMessage("Drag the correct symbol into the box!");
  };

  return (
    <div className="pattern logic-bg-image">
      <button className="lq-back-btn" onClick={handleBack}>
        ← Back
      </button>

      <h2 className="lq-main-title">What comes next?</h2>

      <div className="timer">⏱ {time}s</div>

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
                  disabled={!isStarted || time === 0 || isFinished}
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
        <div className="level-popup">
          <h2>🎉 Level {level + 1} Complete!</h2>

          <p>Proceed to Level {level + 2}?</p>

          <div className="level-popup-buttons">
            <button onClick={handleProceed}>Yes, let's go!</button>

            <button
              onClick={() => {
                setProceedPromptLevel(null);
                setShowCongratsPanel(true);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* 🔥 FIXED POPUP */}
      {showStartPopup && (
        <div className="lq-popup-overlay">
          <div className="lq-popup-content">
            <h2>⏱ You have 30s to answer!</h2>
            <div className="lq-popup-buttons">
              <button
                onClick={() => {
                  setShowStartPopup(false);
                  setIsStarted(true);
                }}
              >
                Go
              </button>
              <button onClick={handleBack}>← Back</button>
            </div>
          </div>
        </div>
      )}

{popup === "TIME_UP" && (
  <div className="lq-popup-overlay">
    <div className="lq-popup-content">
      <h2>⏰ Time's up!</h2>
      <p className="lq-popup-stats">
        Level {level + 1} | Progress: {score}/{logicLevels.length} | Wrong Attempts: {wrong}
      </p>

      <div
        className={`lq-popup-buttons ${
          level === logicLevels.length - 1
            ? "lq-popup-buttons-final"
            : "lq-popup-buttons-stacked"
        }`}
      >
        {level < logicLevels.length - 1 ? (
          <button onClick={handleProceed}>Proceed to Level {level + 2}</button>
        ) : null}
        <button onClick={handleReplayLevel}>Replay this Level</button>
        {level === logicLevels.length - 1 && (
          <button onClick={handleRestart}>Play Again</button>
        )}
      </div>
    </div>
  </div>
)}

    </div>
  );
}

