import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  useDraggable,
  useDroppable,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import "./ShapesQuestPage.css";
import "../../WebView/AppShapesQuestPage.css";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import {
  loadPrimaryGameCodeForCategory,
  recordGameProgressRpc,
} from "../../../lib/gameProgressDb";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import ChildMusicToggle from "./ChildMusicToggle";
import {
  type LevelIntroContent,
} from "./levelIntro";

import gameBg from "./images/shapes-bg.jpg";
import bearImg from "./images/bear-3.png";
import { speakKidPrompt, speakNative } from "../../nativeTts";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { ShapesMiniChrome, shapesNextLevelButtons } from "./ShapesMiniChrome";
import { useColorsMiniClock } from "./useColorsMiniClock";
import "./ShapesMiniGames.css";

type ShapeKind =
  | "square"
  | "rectangle"
  | "triangle"
  | "circle"
  | "diamond"
  | "hexagon"
  | "oval"
  | "pentagon"
  | "star";

type ShapeItem = {
  id: string;
  kind: ShapeKind;
  label: string;
};

type SlotPos = "roof" | "window" | "door" | "round" | "gem" | "chimney";

type HouseShape = Exclude<ShapeKind, "oval" | "pentagon" | "star">;

type Slot = {
  id: string;
  accepts: HouseShape;
  label: string;
  pos: SlotPos;
};

const SLOT_ROOF: Slot = { id: "slot-roof", accepts: "triangle", label: "Triangle", pos: "roof" };
const SLOT_WINDOW: Slot = { id: "slot-window", accepts: "square", label: "Square", pos: "window" };
const SLOT_DOOR: Slot = { id: "slot-door", accepts: "rectangle", label: "Rectangle", pos: "door" };
const SLOT_ROUND: Slot = { id: "slot-round", accepts: "circle", label: "Circle", pos: "round" };
const SLOT_GEM: Slot = { id: "slot-gem", accepts: "diamond", label: "Diamond", pos: "gem" };
const SLOT_CHIMNEY: Slot = { id: "slot-chimney", accepts: "hexagon", label: "Hexagon", pos: "chimney" };

type Level = {
  name: "Easy" | "Medium" | "Hard";
  shapes: ShapeItem[];
  slots: Slot[];
  showHintsOnStart: boolean;
};

const levels: Level[] = [
  {
    name: "Easy",
    slots: [SLOT_ROOF, SLOT_WINDOW, SLOT_DOOR],
    shapes: [
      { id: "easy-square", kind: "square", label: "Square" },
      { id: "easy-rectangle", kind: "rectangle", label: "Rectangle" },
      { id: "easy-triangle", kind: "triangle", label: "Triangle" },
    ],
    showHintsOnStart: true,
  },
  {
    name: "Medium",
    slots: [SLOT_ROOF, SLOT_WINDOW, SLOT_DOOR, SLOT_ROUND],
    shapes: [
      { id: "med-square", kind: "square", label: "Square" },
      { id: "med-star", kind: "star", label: "Star" },
      { id: "med-rectangle", kind: "rectangle", label: "Rectangle" },
      { id: "med-triangle", kind: "triangle", label: "Triangle" },
      { id: "med-circle", kind: "circle", label: "Circle" },
    ],
    showHintsOnStart: true,
  },
  {
    name: "Hard",
    slots: [SLOT_ROOF, SLOT_WINDOW, SLOT_DOOR, SLOT_ROUND, SLOT_GEM, SLOT_CHIMNEY],
    shapes: [
      { id: "hard-star", kind: "star", label: "Star" },
      { id: "hard-square", kind: "square", label: "Square" },
      { id: "hard-oval", kind: "oval", label: "Oval" },
      { id: "hard-rectangle", kind: "rectangle", label: "Rectangle" },
      { id: "hard-triangle", kind: "triangle", label: "Triangle" },
      { id: "hard-pentagon", kind: "pentagon", label: "Pentagon" },
      { id: "hard-circle", kind: "circle", label: "Circle" },
      { id: "hard-diamond", kind: "diamond", label: "Diamond" },
      { id: "hard-hexagon", kind: "hexagon", label: "Hexagon" },
    ],
    showHintsOnStart: true,
  },
];

const SHAPE_PRAISE = [
  "Great job!",
  "Good job!",
  "Nice work!",
  "Awesome!",
  "Well done!",
  "You got it!",
];

function DraggableShape({
  shape,
  disabled,
  onSpeak,
}: {
  shape: ShapeItem;
  disabled: boolean;
  onSpeak: (label: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: shape.id,
      disabled,
      data: { kind: shape.kind } as { kind: ShapeKind },
    });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: disabled ? 0.35 : isDragging ? 0.75 : 1,
    cursor: disabled ? "default" : "grab",
  };

  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`sq-shape sq-shape--${shape.kind}`}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onSpeak(shape.label)}
      aria-label={shape.label}
    />
  );
}

const SLOT_PATHS: Record<HouseShape, string> = {
  square: "M14 14 H86 V86 H14 Z",
  rectangle: "M4 4 H36 V96 H4 Z",
  triangle: "M50 8 L94 90 H6 Z",
  circle: "M50 10 A40 40 0 1 1 49.9 10 Z",
  diamond: "M50 6 L94 50 L50 94 L6 50 Z",
  hexagon: "M28 12 H72 L94 50 L72 88 H28 L6 50 Z",
};

const SLOT_VIEWBOX: Record<HouseShape, string> = {
  square: "0 0 100 100",
  rectangle: "0 0 40 100",
  triangle: "0 0 100 100",
  circle: "0 0 100 100",
  diamond: "0 0 100 100",
  hexagon: "0 0 100 100",
};

const SLOT_FILL: Record<HouseShape, string> = {
  square: "#a7d6ff",
  rectangle: "#ffe08a",
  triangle: "#f7a6b7",
  circle: "#b7f7d1",
  diamond: "#d6c7ff",
  hexagon: "#ffb7d0",
};

function DropSlot({
  slot,
  filledBy,
}: {
  slot: Slot;
  filledBy: ShapeItem | null;
  showHint: boolean;
}) {
  const { isOver, setNodeRef, active } = useDroppable({
    id: slot.id,
    data: { accepts: slot.accepts } as { accepts: ShapeKind },
  });

  const activeKind = (active?.data?.current as { kind?: ShapeKind } | undefined)
    ?.kind;
  const isValidOver = isOver && activeKind === slot.accepts;
  const kind = (filledBy?.kind ?? slot.accepts) as HouseShape;

  return (
    <div
      ref={setNodeRef}
      className={[
        "sq-slot",
        `sq-slot--${slot.accepts}`,
        filledBy ? "sq-slot--filled" : "",
        isOver ? "sq-slot--over" : "",
        isValidOver ? "sq-slot--valid" : isOver ? "sq-slot--invalid" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={slot.label}
    >
      <svg className="sq-slot-svg" viewBox={SLOT_VIEWBOX[kind]} aria-hidden="true">
        <path
          d={SLOT_PATHS[kind]}
          className={filledBy ? "sq-slot-svg-fill" : "sq-slot-svg-outline"}
          style={filledBy ? { fill: SLOT_FILL[kind] } : undefined}
        />
      </svg>
    </div>
  );
}

export default function ShapesQuestPage() {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement | null>(null);
  // Android + tablet touch drag sensors; mouse remains supported on the web.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    // Fast consecutive shape selection for children using Android touch screens.
    useSensor(TouchSensor, { activationConstraint: { delay: 25, tolerance: 12 } })
  );
  const audioRef = useRef<{
    ctx: AudioContext;
    gain: GainNode;
    oscA?: OscillatorNode;
    oscB?: OscillatorNode;
    intervalId?: number;
  } | null>(null);
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const lastSpokenRef = useRef<{ text: string; at: number } | null>(null);
  const lastPraiseIndexRef = useRef(-1);

  const [levelIndex, setLevelIndex] = useState(0);
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("shapes");
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [message, setMessage] = useState(
    "Drag the shapes into the correct spots to build the house!"
  );
  const [hasPlayed, setHasPlayed] = useState(false);
  const [finalCongratsOpen, setFinalCongratsOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);

  const level = levels[levelIndex] ?? levels[0];
  const slots = level.slots;
  const activeShapes = level.shapes;

  const SHAPES_GAME_INTRO: LevelIntroContent = {
    title: "Build the House!",
    subtitle: "Drag each shape to the roof, window, or door.",
    speech: "Build the house! Drag each shape to the roof, window, or door.",
    compact: true,
  };

  const clock = useColorsMiniClock({
    intro: SHAPES_GAME_INTRO,
    mapOpen,
    isLandscape: true,
    paused,
    blocked: finalCongratsOpen || completeOpen || gameOverOpen,
    timeLimit: 35 + levelIndex * 15,
    levelIndex,
    soundEnabled,
  });
  useStarTimeUp(clock.timeUpOpen, levelIndex, Object.keys(placed).length > 0 || wrongAttempts > 0, recordLevelResult, wrongAttempts);
  const onTooManyWrong = useCallback(() => {
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts });
  }, [levelIndex, recordLevelResult, wrongAttempts]);
  useWrongAttemptGameOver(wrongAttempts, onTooManyWrong);

  const placedShapeIds = useMemo(() => new Set(Object.values(placed)), [placed]);
  const availableShapes = useMemo(
    () => activeShapes.filter((s) => !placedShapeIds.has(s.id)),
    [activeShapes, placedShapeIds]
  );

  const progress = Object.keys(placed).length;
  const total = slots.length;
  const isFinished = finalCongratsOpen;

  const slotToShape = useMemo(() => {
    const byId = new Map(activeShapes.map((s) => [s.id, s]));
    const result: Record<string, ShapeItem | null> = {};
    for (const slot of slots) {
      const shapeId = placed[slot.id];
      result[slot.id] = shapeId ? byId.get(shapeId) ?? null : null;
    }
    return result;
  }, [activeShapes, placed, slots]);

  useEffect(() => {
    const load = async () => {
      const id = await getOrCreateActiveChildId();
      setChildId(id);
      const code = await loadPrimaryGameCodeForCategory("shapes");
      setGameCode(code);
    };
    void load();
  }, []);

  const persistShapesProgress = (
    pct: number,
    finished: boolean,
    attempts: number
  ) => {
    if (!childId || !gameCode) return;
    void recordGameProgressRpc(childId, gameCode, pct, attempts, finished);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!clock.playing || gameOverOpen) return;
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;

    if (!overId) return;
    const slot = slots.find((s) => s.id === overId);
    const shape = activeShapes.find((s) => s.id === activeId);
    if (!slot || !shape) return;

    setHasPlayed(true);

    const activeKind = (event.active.data.current as { kind?: ShapeKind } | null)
      ?.kind;
    if (!activeKind) return;

    const alreadyFilled = Boolean(placed[slot.id]);
    const alreadyPlacedShape = placedShapeIds.has(activeId);
    if (alreadyFilled || alreadyPlacedShape) return;

   if (activeKind === slot.accepts) {
  const updated = { ...placed, [slot.id]: activeId };
  setPlaced(updated);

  const happyMessages = [
    `Amazing! That's the correct ${activeKind}! 🎉`,
    `Awesome job! You found the ${activeKind}! ⭐`,
    `Great work little learner! 😊`,
    `You got it right! 🌈`,
    `Fantastic job builder! 🏠`,
  ];

  const randomHappy =
  happyMessages[
    Math.floor(Math.random() * happyMessages.length)
  ];

setMessage(randomHappy);

  let praiseIndex = Math.floor(Math.random() * SHAPE_PRAISE.length);
  if (praiseIndex === lastPraiseIndexRef.current) {
    praiseIndex = (praiseIndex + 1) % SHAPE_PRAISE.length;
  }
  lastPraiseIndexRef.current = praiseIndex;
  speakFeedback(SHAPE_PRAISE[praiseIndex]);

  const nextProgress = Object.keys(updated).length;

  const pctForLevel = Math.round(
    ((levelIndex + nextProgress / total) / levels.length) * 100
  );

  if (nextProgress === total) {
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts });
    if (soundEnabled) speakKidPrompt("Awesome! Level complete!", { interrupt: true });
    if (levelIndex >= 2) {
      setFinalCongratsOpen(true);
      persistShapesProgress(100, true, wrongAttempts);
    } else {
      setCompleteOpen(true);
      persistShapesProgress(
        Math.min(99, pctForLevel),
        false,
        wrongAttempts
      );
    }
  } else {
    persistShapesProgress(
      Math.min(99, pctForLevel),
      false,
      wrongAttempts
    );
  }
} else {
  const nextWrong = wrongAttempts + 1;
  setWrongAttempts(nextWrong);

  const encourageMessages = [
    "Great job trying! 😊",
    "Almost there! Keep going 🌟",
    "You can do it! 🎉",
    "Nice try little builder! 🏠",
    "Keep practicing superstar ⭐",
    "That was a good try! 🌈",
  ];

 const randomEncourage =
  encourageMessages[
    Math.floor(Math.random() * encourageMessages.length)
  ];

setMessage(randomEncourage);

speakFeedback("Try again!");

  const pctForLevel = Math.round(
    ((levelIndex + progress / total) / levels.length) * 100
  );

  persistShapesProgress(
    Math.min(99, pctForLevel),
    false,
    nextWrong
  );
}
};

  // Android WebView: scroll the game automatically while a held shape is
  // dragged near the top or bottom edge of a landscape screen.
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const page = pageRef.current;
    const draggedRect = event.active.rect.current.translated;
    if (!page || !draggedRect || !window.matchMedia("(orientation: landscape)").matches) return;

    const edge = Math.max(48, Math.min(86, window.innerHeight * 0.18));
    const maxStep = Math.max(7, Math.min(20, window.innerHeight * 0.045));
    let step = 0;
    if (draggedRect.bottom > window.innerHeight - edge) {
      const strength = Math.min(1, (draggedRect.bottom - (window.innerHeight - edge)) / edge);
      step = Math.max(5, maxStep * strength);
    } else if (draggedRect.top < edge) {
      const strength = Math.min(1, (edge - draggedRect.top) / edge);
      step = -Math.max(5, maxStep * strength);
    }
    if (step !== 0) page.scrollBy({ top: step, behavior: "auto" });
  }, []);

  const resetCommon = () => {
    setPlaced({});
    setWrongAttempts(0);
    setHasPlayed(false);
    setMessage("Drag the shapes into the correct spots to build the house!");
    setCompleteOpen(false);
    setGameOverOpen(false);
    setPaused(false);
    warnedSecondsRef.current = new Set();
  };

  const resetCurrentLevel = () => {
    resetCommon();
    setFinalCongratsOpen(false);
    clock.replayLevel();
  };

  const handleProceed = () => {
    resetCommon();
    setFinalCongratsOpen(false);
    setLevelIndex((prev) => Math.min(prev + 1, 2));
  };

  const handlePlayAgain = () => {
    resetCommon();
    setFinalCongratsOpen(false);
    setLevelIndex(0);
    window.setTimeout(() => clock.replayLevel(), 120);
  };

  useEffect(() => {
    setHasPlayed(false);
    setPlaced({});
    setMessage("Drag the shapes into the correct spots to build the house!");
    setWrongAttempts(0);
    setFinalCongratsOpen(false);
    setCompleteOpen(false);
    setPaused(false);
    warnedSecondsRef.current = new Set();
  }, [levelIndex, mapOpen]);

  const getOrCreateAudio = () => {
    const existing = audioRef.current;
    if (existing) return existing;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0.03;
    gain.connect(ctx.destination);
    const created = { ctx, gain } as {
      ctx: AudioContext;
      gain: GainNode;
      oscA?: OscillatorNode;
      oscB?: OscillatorNode;
      intervalId?: number;
    };
    audioRef.current = created;
    return created;
  };

  const stopBgSong = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.intervalId) window.clearInterval(a.intervalId);
    a.intervalId = undefined;
    try {
      a.oscA?.stop();
    } catch {
      // ignore
    }
    try {
      a.oscB?.stop();
    } catch {
      // ignore
    }
    a.oscA = undefined;
    a.oscB = undefined;
  };

  const startBgSong = () => {
    if (!musicEnabled) return;
    const a = getOrCreateAudio();
    try {
      void a.ctx.resume();
    } catch {
      // ignore
    }

    if (a.oscA || a.oscB) return;

    const oscA = a.ctx.createOscillator();
    const oscB = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    g.gain.value = 0.018;
    oscA.type = "triangle";
    oscB.type = "sine";
    oscA.connect(g);
    oscB.connect(g);
    g.connect(a.gain);
    oscA.start();
    oscB.start();
    a.oscA = oscA;
    a.oscB = oscB;

    const notes = [262, 294, 330, 392, 330, 294]; // C D E G E D
    let i = 0;
    a.intervalId = window.setInterval(() => {
      const f = notes[i % notes.length];
      oscA.frequency.setTargetAtTime(f, a.ctx.currentTime, 0.02);
      oscB.frequency.setTargetAtTime(f * 2, a.ctx.currentTime, 0.02);
      i += 1;
    }, 420);
  };

  const playOpeningSong = () => {
    if (!musicEnabled) return;
    const a = getOrCreateAudio();
    try {
      void a.ctx.resume();
    } catch {
      // ignore
    }

    stopBgSong();

    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    osc.type = "sine";
    g.gain.value = 0.06;
    osc.connect(g);
    g.connect(a.gain);

    const now = a.ctx.currentTime;
    const melody = [392, 440, 494, 523, 659]; // G A B C E
    melody.forEach((f, idx) => {
      osc.frequency.setValueAtTime(f, now + idx * 0.14);
    });

    osc.start(now);
    osc.stop(now + 0.14 * melody.length + 0.05);
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
      osc.frequency.value = n === 0 ? 880 : 520 + (3 - n) * 90;
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
      window.setTimeout(() => ctx.close(), 250);
    } catch {
      // ignore if blocked
    }
  };

  const getHappyVoice = () => {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    // Female-only preference to avoid male voice fallback.
    const preferred = voices.find((v) =>
      /en(-|_)us|english/i.test(v.lang) &&
      /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(v.name)
    );
    if (preferred) return preferred;

    const femaleAnyLang = voices.find((v) =>
      /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(v.name)
    );
    return femaleAnyLang ?? null;
  };

  const sayKid = (text: string) => {
    try {
      if (!soundEnabled) return;
      if (speakNative(text, { interrupt: true, pitch: 1.35 })) return;
      if (!("speechSynthesis" in window)) return;
      if (!voicesReady) {
        // Prime voices list on first interaction.
        void window.speechSynthesis.getVoices();
        setVoicesReady(true);
      }
      const u = new SpeechSynthesisUtterance(text);
      const voice = getHappyVoice();
      if (!voice) return;
      const now = Date.now();
      const last = lastSpokenRef.current;
      if (last && last.text === text && now - last.at < 450) return;
      lastSpokenRef.current = { text, at: now };
      u.voice = voice;
      // "Happy" kid-like cadence
      u.rate = 1.12;
      u.pitch = 1.55;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  };

  
  const speakFeedback = (text: string) => {
  try {
    if (!soundEnabled) return;
    if (speakNative(text, { pitch: 1.35 })) return;
    if (!("speechSynthesis" in window)) return;

    const u = new SpeechSynthesisUtterance(text);

    const voices = window.speechSynthesis.getVoices();

    const voice =
      voices.find((v) =>
        /(female|girl|kid|child|zira|samantha|jenny)/i.test(v.name)
      ) || voices[0];

    if (voice) {
      u.voice = voice;
    }

    u.rate = 1;
    u.pitch = 1.4;
    u.volume = 1;

    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
};

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const onVoicesChanged = () => setVoicesReady(true);
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    // trigger load
    void window.speechSynthesis.getVoices();
    return () => {
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        onVoicesChanged
      );
    };
  }, []);

  useEffect(() => {
    stopBgSong();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.playing, clock.countdown, completeOpen, paused, isFinished, musicEnabled]);

  useEffect(() => {
    return () => {
      stopBgSong();
      const a = audioRef.current;
      if (a) {
        try {
          void a.ctx.close();
        } catch {
          // ignore
        }
      }
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sq-page-bg ssm ssm--house" ref={pageRef} style={{ backgroundImage: `url(${gameBg})` }}>
      <ShapesMiniChrome
        mapTitle="Shape Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={(index) => {
          setLevelIndex(index);
        }}
        title="Build the House!"
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={SHAPES_GAME_INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        extraHeader={
          <>
            <ChildMusicToggle />
            <GamePauseButton onClick={() => setPaused(true)} />
          </>
        }
        footerMessage={message}
        progress={progress}
        total={total}
        wrongAttempts={wrongAttempts}
        hideFooter={completeOpen || finalCongratsOpen}
      >
        <div className="sq-game-card">
          <div className="sq-game-container">
            <DndContext
              sensors={sensors}
              onDragMove={handleDragMove}
              onDragStart={(event) => {
                if (!clock.playing) return;
                const kind = (event.active.data.current as { kind?: ShapeKind } | null)?.kind;
                if (!kind) return;
                sayKid(kind.charAt(0).toUpperCase() + kind.slice(1));
              }}
              onDragEnd={handleDragEnd}
            >
              <div className="sq-scene">
                <div className="sq-house-fit">
                <div className="sq-house">
                  <div className="sq-house-face">
                    <span className="sq-eye left" />
                    <span className="sq-eye right" />
                    <span className="sq-mouth" />
                    <span className="sq-blush left" />
                    <span className="sq-blush right" />
                  </div>
                  <div className="sq-house-slots">
                    {slots.map((slot) => (
                      <div key={slot.id} className={`sq-slot-pos sq-slot-pos--${slot.pos}`}>
                        <DropSlot slot={slot} filledBy={slotToShape[slot.id]} showHint={level.showHintsOnStart && !hasPlayed} />
                      </div>
                    ))}
                  </div>
                </div>
                </div>
                <img className="sq-bear" src={bearImg} alt="" aria-hidden="true" />
              </div>
              <div className="sq-tray">
                <div className="sq-tray-inner">
                  {availableShapes.map((shape) => (
                    <DraggableShape
                      key={shape.id}
                      shape={shape}
                      disabled={!clock.playing}
                      onSpeak={(label) => sayKid(label)}
                    />
                  ))}
                </div>
              </div>
            </DndContext>
          </div>
        </div>
      </ShapesMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="Ready to keep building?"
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />
      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/shapes")}
        onReplay={() => { setGameOverOpen(false); resetCurrentLevel(); }}
      />
      <GameOverlay isOpen={clock.timeUpOpen && !gameOverOpen}>
        <GamePopup
          title="Time's up!"
          subtitle={`Progress: ${progress}/${total} | Wrong Attempts: ${wrongAttempts}`}
          buttons={[
            { label: "Replay Level", onClick: () => { clock.setTimeUpOpen(false); resetCurrentLevel(); } },
            { label: "Map", variant: "secondary", onClick: () => { clock.setTimeUpOpen(false); setMapOpen(true); } },
          ]}
        />
      </GameOverlay>
      <GameOverlay isOpen={completeOpen}>
        <GamePopup
          title="Awesome!"
          timeLeft={clock.timeLeft}
          wrong={wrongAttempts}
          subtitle={`Level ${levelIndex + 1} complete! Proceed to the next level? Progress: ${progress}/${total} | Wrong Attempts: ${wrongAttempts}`}
          buttons={shapesNextLevelButtons({
            levelIndex,
            lastIndex: 2,
            onYes: handleProceed,
            onNo: () => { setCompleteOpen(false); setMapOpen(true); },
            onGames: () => navigate("/quest/shapes"),
          })}
        />
      </GameOverlay>
      <GameOverlay isOpen={finalCongratsOpen}>
        <GamePopup
          title="Congratulations!"
          timeLeft={clock.timeLeft}
          wrong={wrongAttempts}
          subtitle={`You finished all Build the House levels! Progress: ${total}/${total} | Wrong Attempts: ${wrongAttempts}`}
          buttons={[
            { label: "Play Again", onClick: handlePlayAgain, variant: "yes" },
            { label: "Games", variant: "no", onClick: () => navigate("/quest/shapes") },
          ]}
        />
      </GameOverlay>
    </div>
  );
}
