import "./ColorsQuestPage.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import colorsBg from "./images/colors-bg.png";
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragEndEvent,
} from "@dnd-kit/core";
import { supabase } from "../lib/supabase";
import { getOrCreateActiveChildId } from "../lib/childProgress";

type Item = {
  id: string;
  name: string;
  color: "red" | "blue" | "yellow";
  emoji: string;
};

const initialItems: Item[] = [
  { id: "apple", name: "Apple", color: "red", emoji: "🍎" },
  { id: "ball", name: "Ball", color: "blue", emoji: "🔵" },
  { id: "duck", name: "Duck", color: "yellow", emoji: "🦆" },
  { id: "crayon", name: "Crayon", color: "red", emoji: "🖍️" },
  { id: "sock", name: "Sock", color: "blue", emoji: "🧦" },
];

function DraggableItem({
  item,
  isPlaced,
}: {
  item: Item;
  isPlaced: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: item.id,
      disabled: isPlaced,
    });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isPlaced ? 0.35 : isDragging ? 0.7 : 1,
    cursor: isPlaced ? "default" : "grab",
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`cq-item cq-item-${item.color}`}
      {...listeners}
      {...attributes}
      type="button"
    >
      <span className="cq-item-emoji">{item.emoji}</span>
      <span className="cq-item-label">{item.name}</span>
    </button>
  );
}

function Basket({
  id,
  label,
  basketColor,
  children,
}: {
  id: string;
  label: string;
  basketColor: "red" | "blue" | "yellow";
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`cq-basket cq-basket-${basketColor} ${
        isOver ? "cq-basket-over" : ""
      }`}
    >
      <div className="cq-basket-title">{label}</div>
      <div className="cq-basket-inner">{children}</div>
    </div>
  );
}

export default function ColorsQuestPage() {
  const navigate = useNavigate();

  const [lessonLoading, setLessonLoading] = useState(true);
  const [lessonVideoUrl, setLessonVideoUrl] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [gameStarted, setGameStarted] = useState(false);

  const [items] = useState<Item[]>(initialItems);
  const [placed, setPlaced] = useState<Record<string, "red" | "blue" | "yellow">>(
    {}
  );
  const [childId, setChildId] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Drag each object into the correct color basket!"
  );
  const [wrongAttempts, setWrongAttempts] = useState(0);

  const groupedPlaced = useMemo(() => {
    return {
      red: items.filter((item) => placed[item.id] === "red"),
      blue: items.filter((item) => placed[item.id] === "blue"),
      yellow: items.filter((item) => placed[item.id] === "yellow"),
    };
  }, [items, placed]);

  const totalCorrect = Object.keys(placed).length;
  const totalItems = items.length;
  const isFinished = totalCorrect === totalItems;

  useEffect(() => {
    const loadChild = async () => {
      const id = await getOrCreateActiveChildId();
      setChildId(id);
    };

    void loadChild();
  }, []);

  useEffect(() => {
    const fetchColorsLessonVideo = async () => {
      setLessonLoading(true);

      const user = JSON.parse(localStorage.getItem("user") || "null");
      const userGradeLevel = user?.grade_level || user?.gradeLevel || null;

      let query = supabase
        .from("video_lessons")
        .select("*")
        .eq("category", "Colors")
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (userGradeLevel) {
        query = query.eq("grade_level", userGradeLevel);
      }

      const { data, error } = await query.limit(1).maybeSingle();

      if (error) {
        console.error("Colors quest lesson fetch:", error.message);
        setLessonVideoUrl("");
        setLessonTitle("");
        setLessonLoading(false);
        return;
      }

      if (!data) {
        setLessonVideoUrl("");
        setLessonTitle("");
        setLessonLoading(false);
        return;
      }

      setLessonTitle(data.title);

      const { data: publicData } = supabase.storage
        .from("lesson-videos")
        .getPublicUrl(data.video_path);

      setLessonVideoUrl(publicData.publicUrl);
      setLessonLoading(false);
    };

    void fetchColorsLessonVideo();
  }, []);

  const saveProgress = async (score: number, finished: boolean, attempts: number) => {
    if (!childId) return;

    const { error } = await supabase.rpc("record_game_attempt", {
      p_child_id: childId,
      p_game_code: "colors_sort",
      p_score: score,
      p_wrong_attempts: attempts,
      p_finished: finished,
    });

    if (error) {
      console.error("Failed to save colors progress:", error.message);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const itemId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;

    if (!overId) return;

    const draggedItem = items.find((item) => item.id === itemId);
    if (!draggedItem) return;

    if (draggedItem.color === overId) {
      const updatedPlaced = {
        ...placed,
        [itemId]: overId as "red" | "blue" | "yellow",
      };

      setPlaced(updatedPlaced);

      const newCorrect = Object.keys(updatedPlaced).length;
      const score = Math.round((newCorrect / totalItems) * 100);
      const finished = newCorrect === totalItems;

      setMessage(`Great job! ${draggedItem.name} belongs to ${overId}!`);
      void saveProgress(score, finished, wrongAttempts);

      if (finished) {
        setMessage("Amazing! You sorted all the colors correctly!");
      }
    } else {
      const nextAttempts = wrongAttempts + 1;
      setWrongAttempts(nextAttempts);
      setMessage(`Oops! Try again. ${draggedItem.name} does not belong there.`);

      const currentScore = Math.round((totalCorrect / totalItems) * 100);
      void saveProgress(currentScore, false, nextAttempts);
    }
  };

  const handlePlayAgain = () => {
    setPlaced({});
    setWrongAttempts(0);
    setMessage("Drag each object into the correct color basket!");
  };

  if (!gameStarted) {
    return (
      <div
        className="cq-gate"
        style={{ backgroundImage: `url(${colorsBg})` }}
      >
        <button
          className="cq-gate-back"
          type="button"
          onClick={() => navigate("/student")}
        >
          ← Back
        </button>

        <div className="cq-gate-tag">Colors</div>

        <h2 className="cq-gate-title">Color Quest</h2>

        <p className="cq-gate-instruction">
          {lessonLoading
            ? "Loading lesson..."
            : lessonVideoUrl
              ? "Watch the Colors lesson below, then tap Play Game."
              : "Your teacher has not uploaded a Colors lesson video yet. Once they add one in admin, you can play the sorting game!"}
        </p>

        <div className="cq-gate-tv">
          {lessonLoading ? (
            <p className="cq-gate-no-video">Loading...</p>
          ) : lessonVideoUrl ? (
            <video className="cq-gate-video" controls playsInline>
              <source src={lessonVideoUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          ) : (
            <p className="cq-gate-no-video">No video yet</p>
          )}
        </div>

        {lessonTitle && lessonVideoUrl && (
          <p className="cq-gate-video-title">{lessonTitle}</p>
        )}

        {lessonVideoUrl && !lessonLoading && (
          <button
            type="button"
            className="cq-play-game-btn"
            onClick={() => setGameStarted(true)}
          >
            Play Game
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="cq-page">
      <button className="cq-back-btn" onClick={() => navigate("/student")}>
        ← Back
      </button>

      <button
        type="button"
        className="cq-back-lesson-btn"
        onClick={() => setGameStarted(false)}
      >
        ← Lesson
      </button>

      <h1 className="cq-title">Sort the Colors!</h1>

      <div className="cq-bear">🧸</div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="cq-items-area">
          {items.map((item) => (
            <DraggableItem
              key={item.id}
              item={item}
              isPlaced={Boolean(placed[item.id])}
            />
          ))}
        </div>

        <div className="cq-baskets-row">
          <Basket id="red" label="Red Basket" basketColor="red">
            {groupedPlaced.red.map((item) => (
              <div key={item.id} className="cq-basket-item">
                {item.emoji}
              </div>
            ))}
          </Basket>

          <Basket id="blue" label="Blue Basket" basketColor="blue">
            {groupedPlaced.blue.map((item) => (
              <div key={item.id} className="cq-basket-item">
                {item.emoji}
              </div>
            ))}
          </Basket>

          <Basket id="yellow" label="Yellow Basket" basketColor="yellow">
            {groupedPlaced.yellow.map((item) => (
              <div key={item.id} className="cq-basket-item">
                {item.emoji}
              </div>
            ))}
          </Basket>
        </div>
      </DndContext>

      <div className="cq-panel">
        <p className="cq-message">{message}</p>
        <p className="cq-score">
          Progress: {totalCorrect}/{totalItems} | Wrong Attempts: {wrongAttempts}
        </p>

        {isFinished && (
          <div className="cq-actions">
            <button className="cq-action-btn" onClick={handlePlayAgain}>
              Play Again
            </button>
            <button
              className="cq-action-btn success"
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