import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
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
import { ShapesMiniChrome, shapesNextLevelButtons } from "./ShapesMiniChrome";
import { useColorsMiniClock } from "./useColorsMiniClock";
import type { LevelIntroContent } from "./levelIntro";
import bear from "./images/bear-2.png";
import "./ShapesMiniGames.css";

export type ShadowKind = "star" | "square" | "circle" | "triangle" | "diamond" | "hexagon" | "pentagon" | "oval";

type Toy = { id: string; kind: ShadowKind };

const INTRO: LevelIntroContent = {
  title: "Match the Shadows!",
  subtitle: "Drag each colorful toy onto the dark shape that matches it.",
  speech: "Match the shadows! Drag each toy onto the shadow that looks the same.",
  compact: true,
};

const LEVELS: Array<{ name: string; kinds: ShadowKind[]; time: number }> = [
  { name: "Level 1", kinds: ["star", "square", "circle"], time: 45 },
  { name: "Level 2", kinds: ["star", "square", "circle", "triangle", "diamond"], time: 55 },
  { name: "Level 3", kinds: ["star", "square", "circle", "triangle", "diamond", "hexagon", "pentagon", "oval"], time: 70 },
];

const PATHS: Record<ShadowKind, string> = {
  star: "M50 6 L61 35 L92 38 L68 58 L75 88 L50 72 L25 88 L32 58 L8 38 L39 35 Z",
  square: "M14 14 H86 V86 H14 Z",
  circle: "M50 8 A42 42 0 1 1 49.9 8 Z",
  triangle: "M50 10 L92 88 H8 Z",
  diamond: "M50 8 L92 50 L50 92 L8 50 Z",
  hexagon: "M28 12 H72 L94 50 L72 88 H28 L6 50 Z",
  pentagon: "M50 6 L94 40 L77 90 H23 L6 40 Z",
  oval: "M50 10 A28 40 0 1 1 49.9 10 Z",
};

export function ShapeGlyph({
  kind,
  tone,
}: {
  kind: ShadowKind;
  tone: "toy" | "shadow" | "matched";
}) {
  return (
    <svg className={`ssm-glyph ssm-glyph--${tone} ssm-glyph--${kind}`} viewBox="0 0 100 100" aria-hidden="true">
      <path d={PATHS[kind]} />
    </svg>
  );
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function DraggableToy({ toy, disabled, hidden }: { toy: Toy; disabled: boolean; hidden: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: toy.id,
    disabled: disabled || hidden,
    data: { kind: toy.kind },
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`ssm-piece ${hidden || isDragging ? "is-ghost" : ""}`}
      aria-label={toy.kind}
      {...listeners}
      {...attributes}
    >
      <ShapeGlyph kind={toy.kind} tone="toy" />
    </button>
  );
}

function ShadowSlot({ kind, filled }: { kind: ShadowKind; filled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `shadow-${kind}`, data: { kind } });
  return (
    <div
      ref={setNodeRef}
      className={["ssm-slot", filled ? "is-filled" : "", isOver && !filled ? "is-over" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${kind} shadow`}
    >
      <ShapeGlyph kind={kind} tone={filled ? "matched" : "shadow"} />
    </div>
  );
}

export default function ShapesShadowMatch() {
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 20, tolerance: 12 } })
  );
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("shapes-shadow");
  const [levelIndex, setLevelIndex] = useState(0);
  const [toys, setToys] = useState<Toy[]>([]);
  const [shadowOrder, setShadowOrder] = useState<ShadowKind[]>([]);
  const [placed, setPlaced] = useState<Partial<Record<ShadowKind, boolean>>>({});
  const [activeKind, setActiveKind] = useState<ShadowKind | null>(null);
  const [wrong, setWrong] = useState(0);
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const doneRef = useRef(false);
  const level = LEVELS[levelIndex];

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
  useStarTimeUp(clock.timeUpOpen, levelIndex, Object.keys(placed).length > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  const resetBoard = useCallback((index: number) => {
    const next = LEVELS[index];
    doneRef.current = false;
    setLevelIndex(index);
    setToys(shuffle(next.kinds.map((kind) => ({ id: `toy-${kind}`, kind }))));
    setShadowOrder(shuffle(next.kinds));
    setPlaced({});
    setActiveKind(null);
    setWrong(0);
    setPaused(false);
    setCompleteOpen(false); setGameOverOpen(false);
  }, []);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  useEffect(() => {
    if (toys.length === 0) resetBoard(0);
  }, [resetBoard, toys.length]);

  const placedCount = useMemo(() => Object.keys(placed).length, [placed]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCompleteOpen(true);
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "shapes_shadow", Math.max(40, 100 - wrong * 8), wrong, levelIndex >= 2);
    }
    if (soundEnabled) speakKidPrompt("Awesome! You matched all the shadows!", { interrupt: true });
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const onDragStart = (event: DragStartEvent) => {
    if (!clock.playing) return;
    const kind = (event.active.data.current as { kind?: ShadowKind } | undefined)?.kind ?? null;
    setActiveKind(kind);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveKind(null);
    if (!clock.playing) return;
    const kind = (event.active.data.current as { kind?: ShadowKind } | undefined)?.kind;
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!kind || !overId.startsWith("shadow-")) return;
    const target = overId.replace("shadow-", "") as ShadowKind;
    if (placed[kind] || placed[target]) return;
    if (target === kind) {
      const next = { ...placed, [kind]: true };
      setPlaced(next);
      if (soundEnabled) speakKidPrompt("Great match!", { interrupt: true });
      if (Object.keys(next).length >= level.kinds.length) window.setTimeout(finish, 220);
      return;
    }
    setWrong((count) => count + 1);
    if (soundEnabled) speakKidPrompt("Try another shadow!", { interrupt: true });
  };

  return (
    <div className="ssm ssm--shadow">
      <ShapesMiniChrome
        mapTitle="Shadow Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title="Match the Shadows!"
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        extraHeader={<GamePauseButton onClick={() => setPaused(true)} />}
        footerMessage="Drag each toy onto the shadow that matches it!"
        progress={placedCount}
        total={level.kinds.length}
        wrongAttempts={wrong}
        hideFooter={completeOpen}
      >
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className={`ssm-board ssm-board--n${level.kinds.length}`}>
            <div className="ssm-toys" aria-label="Colorful toys">
              {toys.map((toy) => (
                <DraggableToy key={toy.id} toy={toy} disabled={!clock.playing} hidden={Boolean(placed[toy.kind])} />
              ))}
            </div>
            <div className="ssm-shadows" aria-label="Matching shadows">
              {shadowOrder.map((kind) => (
                <ShadowSlot key={kind} kind={kind} filled={Boolean(placed[kind])} />
              ))}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {activeKind ? (
              <div className="ssm-piece is-dragging">
                <ShapeGlyph kind={activeKind} tone="toy" />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <img className="ssm-bear" src={bear} alt="" />
      </ShapesMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="Ready to match more shadows?"
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />
      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/shapes")}
        onReplay={() => { resetBoard(levelIndex); clock.replayLevel(); }}
      />
      <GameOverlay isOpen={clock.timeUpOpen && !gameOverOpen}>
        <GamePopup
          title="Time's up!"
          subtitle={`Progress: ${placedCount}/${level.kinds.length} | Wrong Attempts: ${wrong}`}
          buttons={[
            { label: "Replay Level", onClick: () => { resetBoard(levelIndex); clock.replayLevel(); } },
            { label: "Map", variant: "secondary", onClick: () => { clock.setTimeUpOpen(false); setMapOpen(true); } },
          ]}
        />
      </GameOverlay>
      <GameOverlay isOpen={completeOpen}>
        <GamePopup
          title="Awesome!"
          subtitle={
            levelIndex >= 2
              ? `You finished Shadow Match! Progress: ${level.kinds.length}/${level.kinds.length} | Wrong Attempts: ${wrong}`
              : `Level ${levelIndex + 1} complete! Proceed to the next level? Progress: ${level.kinds.length}/${level.kinds.length} | Wrong Attempts: ${wrong}`
          }
          buttons={shapesNextLevelButtons({
            levelIndex,
            lastIndex: 2,
            onYes: () => resetBoard(levelIndex + 1),
            onNo: () => { setCompleteOpen(false); setGameOverOpen(false); setMapOpen(true); },
            onGames: () => navigate("/quest/shapes"),
          })}
        />
      </GameOverlay>
    </div>
  );
}
