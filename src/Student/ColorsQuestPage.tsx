import "./ColorsQuestPage.css";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragEndEvent,
} from "@dnd-kit/core";

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

  const [items] = useState<Item[]>(initialItems);
  const [placed, setPlaced] = useState<Record<string, "red" | "blue" | "yellow">>(
    {}
  );
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

  const saveProgress = (
    score: number,
    finished: boolean,
    attempts: number
  ) => {
    const existing = JSON.parse(localStorage.getItem("progress") || "{}");

    existing.colors = {
      score,
      completed: score >= 80,
      finished,
      attempts,
      lessonTitle: "Colors Lesson",
      activityTitle: "Sort the Colors",
    };

    localStorage.setItem("progress", JSON.stringify(existing));

    localStorage.setItem(
      "recentActivity",
      JSON.stringify({
        category: "Colors",
        activity: "Sort the Colors",
        score,
        attempts,
        finished,
      })
    );
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
      saveProgress(score, finished, wrongAttempts);

      if (finished) {
        setMessage("Amazing! You sorted all the colors correctly!");
      }
    } else {
      const nextAttempts = wrongAttempts + 1;
      setWrongAttempts(nextAttempts);
      setMessage(`Oops! Try again. ${draggedItem.name} does not belong there.`);

      const currentScore = Math.round((totalCorrect / totalItems) * 100);
      saveProgress(currentScore, false, nextAttempts);
    }
  };

  const handlePlayAgain = () => {
    setPlaced({});
    setWrongAttempts(0);
    setMessage("Drag each object into the correct color basket!");
    saveProgress(0, false, 0);
  };

  return (
    <div className="cq-page">
      <button className="cq-back-btn" onClick={() => navigate("/student")}>
        ← Back
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