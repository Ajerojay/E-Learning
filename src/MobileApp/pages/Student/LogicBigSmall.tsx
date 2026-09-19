import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { recordGameProgressRpc } from "../../../lib/gameProgressDb";
import { speakKidPrompt } from "../../nativeTts";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { LogicGameFooter, LogicMiniChrome, logicNextLevelButtons } from "./LogicMiniChrome";
import { useColorsMiniClock } from "./useColorsMiniClock";
import type { LevelIntroContent } from "./levelIntro";
import openBox from "./images/logic/open-box.png";
import "./LogicMiniGames.css";

type SizeKind = "big" | "small";

type SizeItem = {
  id: string;
  name: string;
  emoji: string;
  size: SizeKind;
};

const PAIRS: Array<[SizeItem, SizeItem]> = [
  [
    { id: "elephant", name: "elephant", emoji: "🐘", size: "big" },
    { id: "mouse", name: "mouse", emoji: "🐭", size: "small" },
  ],
  [
    { id: "whale", name: "whale", emoji: "🐋", size: "big" },
    { id: "fish", name: "fish", emoji: "🐟", size: "small" },
  ],
  [
    { id: "tree", name: "tree", emoji: "🌳", size: "big" },
    { id: "flower", name: "flower", emoji: "🌸", size: "small" },
  ],
  [
    { id: "bus", name: "bus", emoji: "🚌", size: "big" },
    { id: "toy", name: "toy car", emoji: "🚗", size: "small" },
  ],
  [
    { id: "dino", name: "dinosaur", emoji: "🦕", size: "big" },
    { id: "bug", name: "bug", emoji: "🐞", size: "small" },
  ],
  [
    { id: "house", name: "house", emoji: "🏠", size: "big" },
    { id: "tent", name: "tent", emoji: "⛺", size: "small" },
  ],
  [
    { id: "giraffe", name: "giraffe", emoji: "🦒", size: "big" },
    { id: "cat", name: "kitten", emoji: "🐱", size: "small" },
  ],
  [
    { id: "ship", name: "ship", emoji: "🚢", size: "big" },
    { id: "boat", name: "boat", emoji: "⛵", size: "small" },
  ],
];

const LEVELS = [
  { name: "Level 1", pairCount: 2, time: 50 },
  { name: "Level 2", pairCount: 3, time: 60 },
  { name: "Level 3", pairCount: 4, time: 70 },
];

const PRAISE = [
  "Good job!",
  "Yes! That's right!",
  "Nice work!",
  "You did it!",
  "Great sorting!",
];

const INTRO: LevelIntroContent = {
  title: "Sort by Size!",
  subtitle: "Put big things in the big box and tiny things in the small box.",
  speech: "Sort by size! Drag the giant things into the big box, and the tiny things into the small box.",
  compact: true,
};

function shuffle<T>(list: T[]): T[] {
  return [...list].sort(() => Math.random() - 0.5);
}

function sizeItemColumns(count: number) {
  if (count <= 4) return Math.max(1, count);
  if (count <= 6) return 3;
  return 4;
}

function makeBoard(index: number) {
  const level = LEVELS[index] ?? LEVELS[0];
  return shuffle(shuffle(PAIRS).slice(0, level.pairCount).flat());
}

function DraggableItem({
  item,
  placed,
  picked,
  disabled,
  onPick,
}: {
  item: SizeItem;
  placed: boolean;
  picked: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: disabled || placed,
    data: { size: item.size },
  });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.86 : 1,
    zIndex: isDragging ? 20 : 2,
  };

  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`lsize-item is-${item.size}${placed ? " is-placed" : ""}${picked ? " is-picked" : ""}`}
      style={style}
      onClick={onPick}
      aria-label={`${item.size} ${item.name}`}
      {...listeners}
      {...attributes}
    >
      <span className="lsize-emoji">{item.emoji}</span>
      <small>{item.name}</small>
    </button>
  );
}

function SizeBox({
  kind,
  placed,
  isTarget,
  onDropTap,
}: {
  kind: SizeKind;
  placed: SizeItem[];
  isTarget: boolean;
  onDropTap: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `${kind}-box` });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`lsize-box lsize-box--${kind}${isOver || isTarget ? " is-over" : ""}`}
      onClick={onDropTap}
      aria-label={`${kind} box`}
    >
      <span className="lsize-box-frame">
        <img className="lsize-box-art" src={openBox} alt="" />
        <div className="lsize-box-slot">
          {placed.map((item) => (
            <span key={item.id}>{item.emoji}</span>
          ))}
        </div>
      </span>
      <small>{kind === "big" ? "BIG BOX" : "tiny box"}</small>
    </button>
  );
}

export default function LogicBigSmall({ mobileApp = false }: { mobileApp?: boolean }) {
  void mobileApp;
  const navigate = useNavigate();
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("logic-size");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );
  const [levelIndex, setLevelIndex] = useState(0);
  const [items, setItems] = useState(() => makeBoard(0));
  const [placedIds, setPlacedIds] = useState<string[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [message, setMessage] = useState("Put big things in the big box!");
  const doneRef = useRef(false);
  const level = LEVELS[levelIndex];
  const remaining = items.filter((item) => !placedIds.includes(item.id));

  const clock = useColorsMiniClock({
    intro: INTRO,
    mapOpen,
    isLandscape: true,
    paused,
    blocked: completeOpen || gameOverOpen,
    timeLimit: level.time,
    levelIndex,
    soundEnabled,
  });
  useStarTimeUp(clock.timeUpOpen, levelIndex, placedIds.length > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  const resetBoard = useCallback((index: number) => {
    doneRef.current = false;
    setLevelIndex(index);
    setItems(makeBoard(index));
    setPlacedIds([]);
    setPickedId(null);
    setWrong(0);
    setPaused(false);
    setCompleteOpen(false); setGameOverOpen(false);
    setMessage("Put big things in the big box!");
  }, []);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  useEffect(() => {
    if (!clock.playing || !soundEnabled) return;
    speakKidPrompt("Sort the big things and the small things into the right boxes.", { interrupt: true, rate: 0.9 });
  }, [clock.playing, soundEnabled, levelIndex]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCompleteOpen(true);
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "logic_size", Math.max(40, 100 - wrong * 8), wrong, levelIndex >= 2);
    }
    if (soundEnabled) speakKidPrompt("Great sorting! Level complete!", { interrupt: true });
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const picked = items.find((item) => item.id === pickedId) ?? null;
  const canPlay =
    !mapOpen &&
    !paused &&
    !completeOpen &&
    !clock.timeUpOpen &&
    !clock.levelIntroActive &&
    clock.countdown === null;

  const tryPlace = (item: SizeItem, box: SizeKind) => {
    if (!canPlay || doneRef.current || placedIds.includes(item.id)) return;
    if (item.size !== box) {
      setWrong((count) => count + 1);
      setMessage(item.size === "big" ? "That one is too big for the small box!" : "That one is too small for the big box!");
      if (soundEnabled) {
        speakKidPrompt(item.size === "big" ? "Oops! That one is too big." : "Oops! That one is too small.", { interrupt: true });
      }
      setPickedId(null);
      return;
    }
    const nextPlaced = [...placedIds, item.id];
    setPlacedIds(nextPlaced);
    setPickedId(null);
    const praise = PRAISE[(nextPlaced.length - 1) % PRAISE.length];
    const done = nextPlaced.length >= items.length;
    setMessage(done ? "Awesome! You sorted them all!" : praise);
    if (soundEnabled) {
      speakKidPrompt(done ? "Awesome! You sorted them all! Good job!" : praise, { interrupt: true });
    }
    if (done) {
      window.setTimeout(finish, 700);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const item = items.find((entry) => entry.id === String(event.active.id));
    const over = event.over?.id ? String(event.over.id) : "";
    if (!item || (over !== "big-box" && over !== "small-box")) return;
    tryPlace(item, over === "big-box" ? "big" : "small");
  };

  return (
    <div className="ssm pmini lmini lmini--size">
      <LogicMiniChrome
        mapTitle="Size Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title="Sort by Size!"
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        tried={placedIds.length > 0 || wrong > 0}
        wrong={wrong}
        extraHeader={<GamePauseButton onClick={() => setPaused(true)} />}
        footer={
          !completeOpen ? (
            <LogicGameFooter
              message={message}
              progress={placedIds.length}
              total={items.length}
              wrong={wrong}
            />
          ) : null
        }
      >
        <DndContext sensors={sensors} autoScroll={false} onDragEnd={onDragEnd}>
          <div className="lsize-stage">
            <div className={`lsize-items lsize-items--cols-${sizeItemColumns(items.length)}`}>
              {remaining.map((item) => (
                <DraggableItem
                  key={item.id}
                  item={item}
                  placed={false}
                  picked={pickedId === item.id}
                  disabled={!canPlay}
                  onPick={() => {
                    if (!canPlay) return;
                    setPickedId(item.id);
                  }}
                />
              ))}
            </div>
            <div className="lsize-boxes">
              <SizeBox
                kind="big"
                placed={items.filter((item) => item.size === "big" && placedIds.includes(item.id))}
                isTarget={picked?.size === "big"}
                onDropTap={() => picked && tryPlace(picked, "big")}
              />
              <SizeBox
                kind="small"
                placed={items.filter((item) => item.size === "small" && placedIds.includes(item.id))}
                isTarget={picked?.size === "small"}
                onDropTap={() => picked && tryPlace(picked, "small")}
              />
            </div>
          </div>
        </DndContext>
      </LogicMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="Ready to sort some more?"
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />
      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/logic")}
        onReplay={() => { resetBoard(levelIndex); clock.replayLevel(); }}
      />
      <GameOverlay isOpen={clock.timeUpOpen && !gameOverOpen}>
        <GamePopup
          title="Time's up!"
          subtitle={`Progress: ${placedIds.length}/${items.length} | Wrong Attempts: ${wrong}`}
          buttons={[
            { label: "Replay Level", onClick: () => { resetBoard(levelIndex); clock.replayLevel(); } },
            { label: "Map", variant: "secondary", onClick: () => { clock.setTimeUpOpen(false); setMapOpen(true); } },
          ]}
        />
      </GameOverlay>
      <GameOverlay isOpen={completeOpen}>
        <GamePopup
          title="Awesome!"
          timeLeft={clock.timeLeft}
          wrong={wrong}
          subtitle={`Progress: ${items.length}/${items.length} | Wrong Attempts: ${wrong}`}
          buttons={logicNextLevelButtons({
            levelIndex,
            lastIndex: 2,
            onYes: () => resetBoard(levelIndex + 1),
            onNo: () => { setCompleteOpen(false); setGameOverOpen(false); setMapOpen(true); },
            onGames: () => navigate("/quest/logic"),
          })}
        />
      </GameOverlay>
    </div>
  );
}
