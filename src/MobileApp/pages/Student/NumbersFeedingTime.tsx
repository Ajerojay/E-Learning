import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
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
import { NumbersMiniChrome, NUMBER_WORDS, NumbersGameFooter, numbersNextLevelButtons } from "./NumbersMiniChrome";
import { useColorsMiniClock } from "./useColorsMiniClock";
import type { LevelIntroContent } from "./levelIntro";
import bear from "./images/numbers/feed-bear.png";
import "./NumbersMiniGames.css";

type FoodKind = "apple" | "berry" | "honey" | "fish";
type BasketItem = { id: string; kind: FoodKind };

const FOOD_COPY: Record<FoodKind, { singular: string; plural: string; label: string }> = {
  apple: { singular: "apple", plural: "apples", label: "Apple" },
  berry: { singular: "berry", plural: "berries", label: "Berry" },
  honey: { singular: "honey pot", plural: "honey pots", label: "Honey" },
  fish: { singular: "fish", plural: "fish", label: "Fish" },
};

const LEVELS: Array<{ name: string; target: number; extras: number; time: number; foods: FoodKind[] }> = [
  { name: "Level 1", target: 3, extras: 2, time: 45, foods: ["apple"] },
  { name: "Level 2", target: 4, extras: 3, time: 50, foods: ["berry"] },
  { name: "Level 3", target: 6, extras: 3, time: 55, foods: ["apple", "berry", "honey", "fish"] },
];

function foodPhrase(foods: FoodKind[]) {
  if (foods.length === 1) return FOOD_COPY[foods[0]];
  return { singular: "snack", plural: "snacks", label: "Snack" };
}

function makeBasket(levelIndex: number) {
  const next = LEVELS[levelIndex];
  const total = next.target + next.extras;
  return Array.from({ length: total }, (_, i) => ({
    id: `food-${levelIndex}-${i}`,
    kind: next.foods[i % next.foods.length],
  }));
}

function FoodGraphic({ kind }: { kind: FoodKind }) {
  return (
    <span className={`nfeed-food nfeed-food--${kind}`} aria-hidden="true">
      {kind === "apple" && (
        <>
          <span className="nfeed-apple-leaf" />
          <span className="nfeed-apple-stem" />
          <span className="nfeed-apple-body" />
        </>
      )}
      {kind === "berry" && (
        <>
          <span className="nfeed-berry nfeed-berry--a" />
          <span className="nfeed-berry nfeed-berry--b" />
          <span className="nfeed-berry nfeed-berry--c" />
          <span className="nfeed-berry-leaf" />
        </>
      )}
      {kind === "honey" && (
        <>
          <span className="nfeed-honey-lid" />
          <span className="nfeed-honey-jar" />
          <span className="nfeed-honey-label">H</span>
        </>
      )}
      {kind === "fish" && (
        <>
          <span className="nfeed-fish-tail" />
          <span className="nfeed-fish-body" />
          <span className="nfeed-fish-eye" />
        </>
      )}
    </span>
  );
}

function DraggableFood({ item, disabled }: { item: BasketItem; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled,
    data: { kind: item.kind },
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 30 : 3,
    opacity: isDragging ? 0.92 : 1,
  };
  return (
    <button
      type="button"
      ref={setNodeRef}
      className="nfeed-food-btn"
      style={style}
      aria-label={FOOD_COPY[item.kind].label}
      {...listeners}
      {...attributes}
    >
      <FoodGraphic kind={item.kind} />
    </button>
  );
}

function PlateDrop({ items, target }: { items: FoodKind[]; target: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: "plate" });
  return (
    <div ref={setNodeRef} className={["nfeed-plate", isOver ? "is-over" : ""].filter(Boolean).join(" ")}>
      <div className="nfeed-plate-foods">
        {items.map((kind, index) => (
          <span
            key={`${kind}-${index}`}
            className="nfeed-plated"
            style={{
              left: `${8 + (index % 5) * 16}%`,
              bottom: `${6 + Math.floor(index / 5) * 18}%`,
            }}
          >
            <FoodGraphic kind={kind} />
          </span>
        ))}
      </div>
      <small className="nfeed-plate-count">
        {items.length}/{target}
      </small>
    </div>
  );
}

export default function NumbersFeedingTime() {
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 20, tolerance: 12 } })
  );
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("numbers-feed");
  const [levelIndex, setLevelIndex] = useState(0);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [plated, setPlated] = useState<FoodKind[]>([]);
  const [wrong, setWrong] = useState(0);
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [bubble, setBubble] = useState("Feed me!");
  const doneRef = useRef(false);
  const level = LEVELS[levelIndex];
  const phrase = foodPhrase(level.foods);
  const targetWord = NUMBER_WORDS[level.target] ?? String(level.target);

  const intro = useMemo<LevelIntroContent>(
    () => ({
      title: "Feeding Time!",
      subtitle: `Drag ${phrase.plural} from the basket onto Bear's plate, one by one.`,
      speech: `Give the bear the ${phrase.plural} he asks for. Drag them to the plate one by one and count with me!`,
      compact: true,
    }),
    [phrase.plural]
  );

  const clock = useColorsMiniClock({
    intro,
    mapOpen,
    isLandscape: true,
    paused,
    blocked: completeOpen || gameOverOpen,
    timeLimit: level.time,
    levelIndex,
    soundEnabled,
  });
  useStarTimeUp(clock.timeUpOpen, levelIndex, plated.length > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  const resetBoard = useCallback((index: number) => {
    const next = LEVELS[index];
    const nextPhrase = foodPhrase(next.foods);
    doneRef.current = false;
    setLevelIndex(index);
    setBasket(makeBasket(index));
    setPlated([]);
    setWrong(0);
    setPaused(false);
    setCompleteOpen(false); setGameOverOpen(false);
    setBubble(`Feed me ${next.target} ${nextPhrase.plural}!`);
  }, []);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  useEffect(() => {
    resetBoard(levelIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelIndex]);

  useEffect(() => {
    if (!clock.playing || !soundEnabled) return;
    speakKidPrompt(`Give the bear ${targetWord} ${phrase.plural}.`, { interrupt: false });
  }, [clock.playing, soundEnabled, targetWord, phrase.plural]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCompleteOpen(true);
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "numbers_feed", Math.max(40, 100 - wrong * 8), wrong, levelIndex >= 2);
    }
    if (soundEnabled) speakKidPrompt("Yum! The bear is full. Great counting!", { interrupt: true });
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const onDragEnd = (event: DragEndEvent) => {
    if (!clock.playing || doneRef.current) return;
    const foodId = String(event.active.id);
    const item = basket.find((entry) => entry.id === foodId);
    if (!item) return;
    if (String(event.over?.id) !== "plate") {
      setWrong((count) => count + 1);
      if (soundEnabled) speakKidPrompt(`Put the ${FOOD_COPY[item.kind].singular} on the plate!`, { interrupt: true });
      return;
    }
    if (plated.length >= level.target) return;
    const nextCount = plated.length + 1;
    setBasket((ids) => ids.filter((entry) => entry.id !== foodId));
    setPlated((current) => [...current, item.kind]);
    const word = NUMBER_WORDS[nextCount] ?? String(nextCount);
    const spoken = nextCount >= level.target ? `${word}!` : `${word}...`;
    setBubble(spoken);
    if (soundEnabled) speakKidPrompt(spoken, { interrupt: true });
    if (nextCount >= level.target) window.setTimeout(finish, 700);
  };

  const remaining = useMemo(() => basket, [basket]);

  return (
    <div className="ssm nfeed">
      <NumbersMiniChrome
        mapTitle="Feeding Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title={`Feed me ${level.target} ${phrase.plural}!`}
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={intro}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        tried={plated.length > 0 || wrong > 0}
        wrong={wrong}
        extraHeader={<GamePauseButton onClick={() => setPaused(true)} />}
      >
        <div className="nmini-play">
          <p className="ssm-hint">Drag {phrase.plural} from the basket onto Bear's plate.</p>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="nfeed-stage">
              <div className="nfeed-basket-wrap">
                <div className="nfeed-basket" aria-label={`${phrase.label} basket`}>
                  <div className="nfeed-basket-handle" />
                  <div className="nfeed-basket-bowl">
                    {remaining.map((item) => (
                      <DraggableFood key={item.id} item={item} disabled={!clock.playing} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="nfeed-bear-wrap">
                <div className="nfeed-bubble">{bubble}</div>
                <div className="nfeed-bear-scene">
                  <img className="nfeed-bear" src={bear} alt="Bear holding a plate" />
                  <PlateDrop items={plated} target={level.target} />
                </div>
              </div>
            </div>
          </DndContext>
        </div>
        <NumbersGameFooter
          hidden={completeOpen}
          message={plated.length === 0 ? `Drag ${phrase.plural} onto the plate!` : bubble}
          detail={`${phrase.label}: ${plated.length}/${level.target}`}
          progress={plated.length}
          total={level.target}
          wrong={wrong}
        />
      </NumbersMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="Bear can wait a moment."
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />
      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/numbers")}
        onReplay={() => { resetBoard(levelIndex); clock.replayLevel(); }}
      />
      <GameOverlay isOpen={clock.timeUpOpen && !gameOverOpen}>
        <GamePopup
          title="Time's up!"
          subtitle={`You fed Bear ${plated.length}/${level.target} ${phrase.plural}.`}
          buttons={[
            { label: "Replay Level", onClick: () => { resetBoard(levelIndex); clock.replayLevel(); } },
            { label: "Map", variant: "secondary", onClick: () => { clock.setTimeUpOpen(false); setMapOpen(true); } },
          ]}
        />
      </GameOverlay>
      <GameOverlay isOpen={completeOpen}>
        <GamePopup
          title="Yum!"
          subtitle={levelIndex >= 2 ? "You finished Feeding Time!" : `${level.name} complete! Proceed to the next level?`}
          buttons={numbersNextLevelButtons({
            levelIndex,
            lastIndex: 2,
            onYes: () => resetBoard(levelIndex + 1),
            onNo: () => { setCompleteOpen(false); setGameOverOpen(false); setMapOpen(true); },
            onGames: () => navigate("/quest/number"),
          })}
        />
      </GameOverlay>
    </div>
  );
}
