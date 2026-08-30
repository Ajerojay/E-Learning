import "./ColorsQuestPage.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragEndEvent,
  DragMoveEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { supabase } from "../../../lib/supabase";
import { GameOverlay, GamePopup, Countdown } from "./GamePopup";
import {
  useLevelIntro,
  LevelIntroOverlay,
  COUNTDOWN_READY_SUBTITLE,
  type LevelIntroContent,
} from "./levelIntro";
import bgMusic from "./bg-music-loop.mp3";
import { speakNative } from "../../nativeTts";

const COLORS_LEVEL_INTRO: LevelIntroContent = {
  title: "Sort the colors!",
  subtitle: "Drag each picture into the basket that matches its color.",
  speech:
    "Hi friend! Drag each picture into the color basket it belongs in. You can do it!",
};

import basketRed from "./images/colors/baskets/red.png";
import basketBlue from "./images/colors/baskets/blue.png";
import basketYellow from "./images/colors/baskets/yellow.png";
import basketGreen from "./images/colors/baskets/green.png";
import basketOrange from "./images/colors/baskets/orange.png";
import basketPurple from "./images/colors/baskets/purple.png";
import basketPink from "./images/colors/baskets/pink.png";
import basketBrown from "./images/colors/baskets/brown.png";
import basketBlack from "./images/colors/baskets/black.png";
import basketWhite from "./images/colors/baskets/white.png";
import basketGray from "./images/colors/baskets/gray.png";

type Item = {
  id: string;
  name: string;
  color: ColorKey;
  emoji: string;
};

type ColorKey =
  | "red"
  | "blue"
  | "yellow"
  | "green"
  | "orange"
  | "purple"
  | "pink"
  | "brown"
  | "black"
  | "white"
  | "gray";

const COLOR_LABELS: Record<ColorKey, string> = {
  red: "Red",
  blue: "Blue",
  yellow: "Yellow",
  green: "Green",
  orange: "Orange",
  purple: "Purple",
  pink: "Pink",
  brown: "Brown",
  black: "Black",
  white: "White",
  gray: "Gray",
};

const LEVELS: { name: string; colors: ColorKey[]; items: Item[]; time: number }[] = [
  // Level 1: few items, only primary colors
  {
    name: "Level 1",
    colors: ["red", "blue", "yellow"],
    time: 25,
    items: [
      { id: "l1-red", name: "Apple", color: "red", emoji: "ðŸŽ" },
      { id: "l1-blue", name: "Blue Dot", color: "blue", emoji: "ðŸ”µ" },
      { id: "l1-yellow", name: "Star", color: "yellow", emoji: "â­" },
      { id: "l1-red-2", name: "Cherry", color: "red", emoji: "ðŸ’" },
      { id: "l1-blue-2", name: "Gem", color: "blue", emoji: "ðŸ’Ž" },
      { id: "l1-yellow-2", name: "Banana", color: "yellow", emoji: "ðŸŒ" },
    ],
  },
  // Level 2: introduce more â€œbasicâ€ colors
  {
    name: "Level 2",
    colors: ["red", "blue", "yellow", "green", "orange", "purple"],
    time: 35,
    items: [
      { id: "l2-red", name: "Red Dot", color: "red", emoji: "ðŸ”´" },
      { id: "l2-blue", name: "Blue Dot", color: "blue", emoji: "ðŸ”µ" },
      { id: "l2-yellow", name: "Yellow Dot", color: "yellow", emoji: "ðŸŸ¡" },
      { id: "l2-green", name: "Green Dot", color: "green", emoji: "ðŸŸ¢" },
      { id: "l2-orange", name: "Orange Dot", color: "orange", emoji: "ðŸŸ " },
      { id: "l2-purple", name: "Purple Dot", color: "purple", emoji: "ðŸŸ£" },
      { id: "l2-red-2", name: "Strawberry", color: "red", emoji: "ðŸ“" },
      { id: "l2-blue-2", name: "Blueberry", color: "blue", emoji: "ðŸ«" },
      { id: "l2-yellow-2", name: "Sun", color: "yellow", emoji: "â˜€ï¸" },
      { id: "l2-green-2", name: "Leaf", color: "green", emoji: "ðŸƒ" },
      { id: "l2-orange-2", name: "Carrot", color: "orange", emoji: "ðŸ¥•" },
      { id: "l2-purple-2", name: "Grapes", color: "purple", emoji: "ðŸ‡" },
    ],
  },
  // Level 3: full â€œbasic colorsâ€ row like the reference
  {
    name: "Level 3",
    colors: ["red", "blue", "yellow", "green", "orange", "pink", "brown", "black", "white", "gray"],
    time: 60,
    items: [
      { id: "l3-red", name: "Red Dot", color: "red", emoji: "ðŸ”´" },
      { id: "l3-blue", name: "Blue Dot", color: "blue", emoji: "ðŸ”µ" },
      { id: "l3-yellow", name: "Yellow Dot", color: "yellow", emoji: "ðŸŸ¡" },
      { id: "l3-green", name: "Green Dot", color: "green", emoji: "ðŸŸ¢" },
      { id: "l3-orange", name: "Orange Dot", color: "orange", emoji: "ðŸŸ " },
      { id: "l3-pink", name: "Pink Dot", color: "pink", emoji: "ðŸ©·" },
      { id: "l3-brown", name: "Brown Dot", color: "brown", emoji: "ðŸŸ¤" },
      { id: "l3-black", name: "Black Dot", color: "black", emoji: "âš«" },
      { id: "l3-white", name: "White Dot", color: "white", emoji: "âšª" },
      { id: "l3-gray", name: "Gray Dot", color: "gray", emoji: "â—»ï¸" },
      { id: "l3-orange-2", name: "Carrot", color: "orange", emoji: "ðŸ¥•" },
      { id: "l3-green-2", name: "Leaf", color: "green", emoji: "ðŸƒ" },
      { id: "l3-pink-2", name: "Flower", color: "pink", emoji: "ðŸŒ¸" },
      { id: "l3-brown-2", name: "Chestnut", color: "brown", emoji: "ðŸŒ°" },
    ],
  },
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
      <span className="cq-item-emoji-only" aria-hidden="true">
        {item.emoji}
      </span>
      <span className="cq-item-label">
        <span
          className={`cq-item-color-dot cq-item-color-dot--${item.color}`}
          aria-hidden="true"
        />
        {item.name}
      </span>
    </button>
  );
}

function Basket({
  id,
  label,
  basketColor,
  children,
}: {
  id: ColorKey;
  label: string;
  basketColor: ColorKey;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  const basketSrcByColor: Record<ColorKey, string> = {
    red: basketRed,
    blue: basketBlue,
    yellow: basketYellow,
    green: basketGreen,
    orange: basketOrange,
    purple: basketPurple,
    pink: basketPink,
    brown: basketBrown,
    black: basketBlack,
    white: basketWhite,
    gray: basketGray,
  };

  return (
    <div
      ref={setNodeRef}
      className={`cq-basket cq-basket-${basketColor} ${
        isOver ? "cq-basket-over" : ""
      }`}
    >
      <img className="cq-basket-art" src={basketSrcByColor[basketColor]} alt="" />
      <div className="cq-basket-dropzone" aria-hidden="true" />
      <div className="cq-basket-title">{label}</div>
      <div className="cq-basket-inner">{children}</div>
    </div>
  );
}

type ColorsQuestPageProps = {
  mobileApp?: boolean;
};

const COLOR_PRAISE = [
  "Great job!",
  "Good job!",
  "Nice work!",
  "Awesome!",
  "Well done!",
  "You got it!",
];

export default function ColorsQuestPage({ mobileApp = false }: ColorsQuestPageProps) {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement | null>(null);
  // Explicit sensors make drag-and-drop work in Android WebView and desktop web.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    // Keep a tiny delay to distinguish a tap from a drag, but remain responsive
    // when a child immediately grabs the next object after a correct drop.
    useSensor(TouchSensor, { activationConstraint: { delay: 25, tolerance: 12 } })
  );
  const [isLandscape, setIsLandscape] = useState(
    () => !mobileApp || window.matchMedia("(orientation: landscape)").matches
  );

  const lastSpokenRef = useRef<{ text: string; at: number } | null>(null);
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const isVoiceSpeakingRef = useRef(false);
  const lastPraiseIndexRef = useRef(-1);

  const [levelIndex, setLevelIndex] = useState(0);
  const playSession = 0;
  const [items, setItems] = useState<Item[]>(LEVELS[0].items);
  const [activeColors, setActiveColors] = useState<ColorKey[]>(LEVELS[0].colors);
  const [placed, setPlaced] = useState<Record<string, ColorKey>>({});
  const [childId, setChildId] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Drag each object into the correct color basket!"
  );
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(LEVELS[0].time);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);
  const [levelCompleteOpen, setLevelCompleteOpen] = useState(false);
  const [levelSummaryOpen, setLevelSummaryOpen] = useState(false);
  const [finalCompleteOpen, setFinalCompleteOpen] = useState(false);
  const [completedItemsBase, setCompletedItemsBase] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);

  // APP ORIENTATION: pause Colors Quest until the Android device is landscape.
  useEffect(() => {
    if (!mobileApp) return;
    const orientation = window.matchMedia("(orientation: landscape)");
    const updateOrientation = () => setIsLandscape(orientation.matches);
    updateOrientation();
    orientation.addEventListener("change", updateOrientation);
    window.addEventListener("orientationchange", updateOrientation);
    return () => {
      orientation.removeEventListener("change", updateOrientation);
      window.removeEventListener("orientationchange", updateOrientation);
    };
  }, [mobileApp]);

  const groupedPlaced = useMemo(() => {
    const result: Record<string, Item[]> = Object.fromEntries(
      activeColors.map((c) => [c, []])
    );
    for (const it of items) {
      const bucket = placed[it.id];
      if (bucket && result[bucket]) result[bucket].push(it);
    }
    return result as Record<ColorKey, Item[]>;
  }, [items, placed, activeColors]);

  const totalCorrect = Object.keys(placed).length;
  const totalItems = items.length;
  // Disable proceed-on-timeout because the level is not actually finished.
  const canProceedAfterTimeUp = false;

  const totalAllItems = useMemo(
    () => LEVELS.reduce((sum, l) => sum + l.items.length, 0),
    []
  );

  const startCountdown = useCallback(() => setCountdown(3), []);

  // On Android, do not mount/speak the intro until the physical viewport is
  // actually landscape. This also pauses a level if the phone rotates back.
  const introEnabled =
    isLandscape &&
    !timeUpOpen && !finalCompleteOpen && !levelCompleteOpen && !levelSummaryOpen;

  const { levelIntroActive, onLevelStart, startCountdownOnly, cancelIntro } = useLevelIntro({
    content: COLORS_LEVEL_INTRO,
    soundEnabled,
    enabled: introEnabled,
    sessionKey: playSession,
    onStartCountdown: startCountdown,
  });

  const getHappyVoice = () => {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const preferred = voices.find(
      (v) =>
        /en(-|_)us|english/i.test(v.lang) &&
        /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(v.name)
    );
    return preferred ?? voices[0] ?? null;
  };

  const sayKid = (text: string, options?: { interrupt?: boolean; skipDedupe?: boolean }) => {
    try {
      if (!soundEnabled) return;
      if (speakNative(text, { interrupt: options?.interrupt, rate: 1.05, pitch: 1.35 })) return;
      if (!("speechSynthesis" in window)) return;
      if (options?.interrupt) window.speechSynthesis.cancel();
      const now = Date.now();
      const last = lastSpokenRef.current;
      if (!options?.skipDedupe && last && last.text === text && now - last.at < 450) return;
      lastSpokenRef.current = { text, at: now };
      const u = new SpeechSynthesisUtterance(text);
      const voice = getHappyVoice();
      if (!voice) return;
      u.voice = voice;
      u.rate = 1.12;
      u.pitch = 1.55;
      u.volume = 1;

      // Pause music when voice starts speaking
      isVoiceSpeakingRef.current = true;
      if (bgMusicRef.current && musicEnabled) {
        bgMusicRef.current.pause();
      }

      // Resume music when voice ends
      u.onend = () => {
        isVoiceSpeakingRef.current = false;
        if (bgMusicRef.current && musicEnabled) {
          bgMusicRef.current.play().catch(() => {
            // ignore play errors
          });
        }
      };

      window.speechSynthesis.speak(u);
    } catch {
      // ignore
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
      // ignore
    }
  };

  useEffect(() => {
    const loadChild = async () => {
      const id = await getOrCreateActiveChildId();
      setChildId(id);
    };

    void loadChild();
  }, []);

  useEffect(() => {
    // Initialize background music
    if (!bgMusicRef.current) {
      const audio = new Audio(bgMusic);
      audio.loop = true;
      audio.volume = 0.3; // Set to 30% volume so it doesn't overpower voice
      bgMusicRef.current = audio;

      if (musicEnabled) {
        audio.play().catch(() => {
          // Browser may require user interaction to autoplay
        });
      }
    }

    return () => {
      // Cleanup on unmount
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    // Handle music enabled/disabled toggle
    if (bgMusicRef.current) {
      if (musicEnabled && !isVoiceSpeakingRef.current) {
        bgMusicRef.current.play().catch(() => {
          // ignore play errors
        });
      } else {
        bgMusicRef.current.pause();
      }
    }
  }, [musicEnabled]);

  useEffect(() => {
    // reset level state when level changes
    const level = LEVELS[levelIndex] ?? LEVELS[0];
    setItems(level.items);
    setActiveColors(level.colors);
    setPlaced({});
    setTimeLeft(level.time);
    setTimerRunning(false);
    setCountdown(null);
    setTimeUpOpen(false);
    setLevelCompleteOpen(false);
    setFinalCompleteOpen(false);
    warnedSecondsRef.current = new Set();
    setMessage("Drag each object into the correct color basket!");
    onLevelStart();
  }, [levelIndex, onLevelStart]);

  useEffect(() => {
    if (levelIntroActive) setTimerRunning(false);
  }, [levelIntroActive]);

  useEffect(() => {
    // countdown before start: 3..2..1..Go!
    if (!isLandscape || finalCompleteOpen || timeUpOpen || levelIntroActive) return;
    if (countdown === null) return;

    setTimerRunning(false);
    if (countdown <= 0) {
      setCountdown(null);
      setTimerRunning(true);
      sayKid("Go!", { interrupt: true, skipDedupe: true });
      playKidBeep(0);
      return;
    }

    sayKid(String(countdown), { interrupt: true, skipDedupe: true });
    playKidBeep(countdown);
    const t = window.setTimeout(() => setCountdown((p) => (p === null ? null : p - 1)), 850);
    return () => window.clearTimeout(t);
  }, [countdown, finalCompleteOpen, timeUpOpen, levelIntroActive, isLandscape]);

  useEffect(() => {
    if (!timerRunning || !isLandscape) return;
    if (countdown !== null) return;
    if (timeUpOpen || finalCompleteOpen || levelCompleteOpen) return;
    if (timeLeft <= 0) {
      setTimerRunning(false);
      setTimeUpOpen(true);
      setMessage("Time's up!");
      sayKid("Time's up!", { interrupt: true, skipDedupe: true });
      playKidBeep(0);
      const percent = Math.round(((completedItemsBase + totalCorrect) / totalAllItems) * 100);
      void saveProgress(percent, false, wrongAttempts);
      return;
    }
    const t = window.setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => window.clearTimeout(t);
  }, [
    timerRunning,
    countdown,
    timeLeft,
    timeUpOpen,
    finalCompleteOpen,
    levelCompleteOpen,
    completedItemsBase,
    totalCorrect,
    totalAllItems,
    wrongAttempts,
    isLandscape,
  ]);

  useEffect(() => {
    // 5-second warning voice + beep
    if (!timerRunning) return;
    if (countdown !== null) return;
    if (timeUpOpen || finalCompleteOpen || levelCompleteOpen) return;
    if (timeLeft > 5 || timeLeft <= 0) return;
    if (warnedSecondsRef.current.has(timeLeft)) return;
    warnedSecondsRef.current.add(timeLeft);
    sayKid(String(timeLeft), { interrupt: true, skipDedupe: true });
    playKidBeep(timeLeft);
  }, [timerRunning, countdown, timeLeft, timeUpOpen, finalCompleteOpen, levelCompleteOpen]);

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
    if (levelIntroActive || countdown !== null) return;
    if (timeUpOpen || finalCompleteOpen || levelCompleteOpen) return;
    const itemId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;

    if (!overId) return;
    if (!activeColors.includes(overId as ColorKey)) return;

    const draggedItem = items.find((item) => item.id === itemId);
    if (!draggedItem) return;

    if (draggedItem.color === overId) {
      const updatedPlaced = {
        ...placed,
        [itemId]: overId as ColorKey,
      };

      setPlaced(updatedPlaced);

      // Baskets can be below the fold on Levels 2â€“3. Reset only when the page
      // actually scrolled. Avoid delayed/smooth scrolling because it can steal
      // the next fast touch gesture in Android WebView.
      const gamePage = pageRef.current;
      if (gamePage && gamePage.scrollTop > 8) {
        gamePage.scrollTo({ top: 0, behavior: "auto" });
      }

      const newCorrect = Object.keys(updatedPlaced).length;
      const finishedLevel = newCorrect === totalItems;
      const overallCorrect = completedItemsBase + newCorrect;
      const score = Math.round((overallCorrect / totalAllItems) * 100);
      const finishedAll = overallCorrect === totalAllItems;

      let praiseIndex = Math.floor(Math.random() * COLOR_PRAISE.length);
      if (praiseIndex === lastPraiseIndexRef.current) {
        praiseIndex = (praiseIndex + 1) % COLOR_PRAISE.length;
      }
      lastPraiseIndexRef.current = praiseIndex;
      const praise = COLOR_PRAISE[praiseIndex];
      const remainingInLevel = totalItems - newCorrect;

      setMessage(`${praise} ${draggedItem.name} belongs to ${overId}!`);
      if (!finishedLevel) {
        sayKid(
          remainingInLevel <= 2
            ? `${praise} You're almost done!`
            : praise,
          { interrupt: true }
        );
      }
      void saveProgress(score, finishedAll, wrongAttempts);

      if (finishedLevel) {
        setTimerRunning(false);
        if (finishedAll) {
          setFinalCompleteOpen(true);
          setMessage("Amazing! You finished all color levels!");
          sayKid("Amazing! You finished all the levels!", { interrupt: true, skipDedupe: true });
        } else {
          setLevelCompleteOpen(true);
          setMessage(`Awesome! ${LEVELS[levelIndex]?.name ?? "Level"} complete!`);
          sayKid("Awesome! Level complete!", { interrupt: true, skipDedupe: true });
        }
      }
    } else {
      const nextAttempts = wrongAttempts + 1;
      setWrongAttempts(nextAttempts);
      setMessage(`Oops! Try again. ${draggedItem.name} does not belong there.`);
      sayKid("Wrong.", { interrupt: true });

      const overallCorrect = completedItemsBase + totalCorrect;
      const currentScore = Math.round((overallCorrect / totalAllItems) * 100);
      void saveProgress(currentScore, false, nextAttempts);
    }
  };

  // Android WebView: keep the held item moving with the scrollable game page.
  // Scrolling starts only near the top/bottom edge, so normal dragging stays steady.
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (!mobileApp || !isLandscape) return;
    const page = pageRef.current;
    const draggedRect = event.active.rect.current.translated;
    if (!page || !draggedRect) return;

    const edge = Math.max(54, Math.min(90, window.innerHeight * 0.18));
    const maxStep = Math.max(8, Math.min(22, window.innerHeight * 0.045));
    let step = 0;
    if (draggedRect.bottom > window.innerHeight - edge) {
      const strength = Math.min(1, (draggedRect.bottom - (window.innerHeight - edge)) / edge);
      step = Math.max(5, maxStep * strength);
    } else if (draggedRect.top < edge) {
      const strength = Math.min(1, (edge - draggedRect.top) / edge);
      step = -Math.max(5, maxStep * strength);
    }
    if (step !== 0) page.scrollBy({ top: step, behavior: "auto" });
  }, [mobileApp, isLandscape]);

  const handlePlayAgain = () => {
    // Replay skips the long instruction card and begins at 3, 2, 1.
    cancelIntro();
    setPlaced({});
    setWrongAttempts(0);
    setCompletedItemsBase(0);
    setLevelIndex(0);
    setCountdown(null);
    setTimeLeft(LEVELS[0].time);
    setTimerRunning(false);
    setTimeUpOpen(false);
    setLevelCompleteOpen(false);
    setFinalCompleteOpen(false);
    warnedSecondsRef.current = new Set();
    setMessage("Drag each object into the correct color basket!");
    window.setTimeout(() => startCountdownOnly(), 120);
  };

  const proceedNextLevel = () => {
    const currentTotal = LEVELS[levelIndex]?.items.length ?? totalItems;
    setCompletedItemsBase((p) => p + currentTotal);
    setLevelIndex((p) => Math.min(p + 1, LEVELS.length - 1));
  };

  return (
    <div className="colors-page" ref={pageRef}>
      {mobileApp && !isLandscape && (
        <div className="cq-rotate-notice" role="status" aria-live="polite">
          <span className="cq-phone-icon" aria-hidden="true">ðŸ“±</span>
          <strong>Turn your device sideways!</strong>
          <p>Colors Quest needs landscape mode before you can play.</p>
          <span className="cq-turn-arrow" aria-hidden="true">â†»</span>
        </div>
      )}
      <button className="cq-back-btn" onClick={() => navigate("/lesson/colors", { replace: true })}>
        â† Back
      </button>

      <h1 className="cq-title">Sort the Colors!</h1>
      <div className="cq-level-meta-row">
        <div className="cq-level-meta">
          <strong className="cq-level-pill">Level {levelIndex + 1}</strong>
          <span className="cq-timer-pill">â± {timeLeft}s</span>
        </div>
        <div className="cq-sound-buttons">
          <button
            type="button"
            className="cq-sound-toggle cq-music-toggle"
            onClick={() => {
              setMusicEnabled((prev) => {
                const next = !prev;
                if (bgMusicRef.current) {
                  if (next && !isVoiceSpeakingRef.current) {
                    bgMusicRef.current.play().catch(() => {});
                  } else {
                    bgMusicRef.current.pause();
                  }
                }
                return next;
              });
            }}
            aria-label={musicEnabled ? "Mute music" : "Unmute music"}
            title={musicEnabled ? "Mute Music" : "Unmute Music"}
          >
            {musicEnabled ? "ðŸŽµ" : "ðŸ”‡"}
          </button>
          <button
            type="button"
            className="cq-sound-toggle cq-effects-toggle"
            onClick={() => {
              setSoundEnabled((prev) => {
                const next = !prev;
                if (!next && "speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }
                return next;
              });
            }}
            aria-label={soundEnabled ? "Mute voice" : "Unmute voice"}
            title={soundEnabled ? "Mute Voice" : "Unmute Voice"}
          >
            {soundEnabled ? "ðŸ”Š" : "ðŸ”‡"}
          </button>
        </div>
      </div>

      <div className="cq-bear" aria-hidden="true">ðŸ§¸</div>

      <DndContext sensors={sensors} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
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
          {activeColors.map((c) => (
            <Basket
              key={c}
              id={c}
              label={`${COLOR_LABELS[c]} Basket`}
              basketColor={c}
            >
              {groupedPlaced[c].map((item) => (
                <div key={item.id} className="cq-basket-item">
                  <span className="cq-basket-emoji" aria-hidden="true">
                    {item.emoji}
                  </span>
                </div>
              ))}
            </Basket>
          ))}
        </div>
      </DndContext>

      {!finalCompleteOpen && <div className="cq-panel">
        <p className="cq-message">{message}</p>
        <p className="cq-score">
          Progress: {completedItemsBase + totalCorrect}/{totalAllItems} | Wrong Attempts: {wrongAttempts}
        </p>
      </div>}

      <LevelIntroOverlay
        isOpen={levelIntroActive && introEnabled}
        content={COLORS_LEVEL_INTRO}
      />

      {countdown !== null && (
        <GameOverlay isOpen={countdown !== null}>
          <GamePopup
            title={<Countdown value={countdown} />}
            subtitle={COUNTDOWN_READY_SUBTITLE}
          />
        </GameOverlay>
      )}

      {timeUpOpen && (
        <GameOverlay isOpen={timeUpOpen}>
          <GamePopup
            title="â° Time's up!"
            subtitle={`You sorted ${totalCorrect}/${totalItems} in ${LEVELS[levelIndex]?.name ?? "this level"}.`}
            buttons={
              levelIndex < LEVELS.length - 1
                ? canProceedAfterTimeUp
                  ? [
                      {
                        label: `Proceed to Level ${levelIndex + 2}`,
                        onClick: () => {
                          setTimeUpOpen(false);
                          setPlaced({});
                          setWrongAttempts(0);
                          setCountdown(null);
                          setTimeLeft(LEVELS[levelIndex]?.time ?? 30);
                          setTimerRunning(false);
                          warnedSecondsRef.current = new Set();
                          setLevelIndex((p) => Math.min(p + 1, LEVELS.length - 1));
                        },
                      },
                      {
                        label: "Replay Level",
                        onClick: () => {
                          setTimeUpOpen(false);
                          setPlaced({});
                          setWrongAttempts(0);
                          startCountdownOnly();
                          setTimeLeft(LEVELS[levelIndex]?.time ?? 30);
                          setTimerRunning(false);
                          warnedSecondsRef.current = new Set();
                        },
                        variant: "secondary",
                      },
                    ]
                  : [
                      {
                        label: "Back to Lesson",
                        onClick: () => navigate("/lesson/colors"),
                      },
                      {
                        label: "Replay Level",
                        onClick: () => {
                          setTimeUpOpen(false);
                          setPlaced({});
                          setWrongAttempts(0);
                          startCountdownOnly();
                          setTimeLeft(LEVELS[levelIndex]?.time ?? 30);
                          setTimerRunning(false);
                          warnedSecondsRef.current = new Set();
                        },
                        variant: "secondary",
                      },
                    ]
                : [
                    {
                      label: "Replay Level",
                      onClick: () => {
                        setTimeUpOpen(false);
                        setPlaced({});
                        setWrongAttempts(0);
                        startCountdownOnly();
                        setTimeLeft(LEVELS[levelIndex]?.time ?? 30);
                        setTimerRunning(false);
                        warnedSecondsRef.current = new Set();
                      },
                    },
                    {
                      label: "Back to Lesson",
                      onClick: () => navigate("/lesson/colors"),
                      variant: "secondary",
                    },
                  ]
            }
          />
        </GameOverlay>
      )}

      {levelCompleteOpen && (
        <GameOverlay isOpen={levelCompleteOpen}>
          <GamePopup
            title="ðŸŽ‰ Awesome!"
            subtitle={`${LEVELS[levelIndex]?.name ?? "Level"} complete! Proceed to the next level?`}
            buttons={[
              {
                label: "Yes",
                onClick: () => {
                  setLevelCompleteOpen(false);
                  proceedNextLevel();
                },
                variant: "yes",
              },
              {
                label: "No",
                onClick: () => {
                  setLevelCompleteOpen(false);
                  setLevelSummaryOpen(true);
                },
                variant: "no",
              },
            ]}
          />
        </GameOverlay>
      )}

      {levelSummaryOpen && (
        <GameOverlay isOpen={levelSummaryOpen}>
          <GamePopup
            title="Keep playing?"
            subtitle={`Progress: ${completedItemsBase + totalCorrect}/${totalAllItems} | Wrong Attempts: ${wrongAttempts}`}
            buttons={[
              {
                label: "Back to Lesson",
                onClick: () => {
                  setLevelSummaryOpen(false);
                  navigate("/lesson/colors");
                },
                variant: "secondary",
              },
              {
                label: "Replay Level",
                onClick: () => {
                  setLevelSummaryOpen(false);
                  setPlaced({});
                  setWrongAttempts(0);
                  startCountdownOnly();
                  setTimeLeft(LEVELS[levelIndex]?.time ?? 30);
                  setTimerRunning(false);
                  warnedSecondsRef.current = new Set();
                },
                variant: "yes",
              },
            ]}
          />
        </GameOverlay>
      )}

      {finalCompleteOpen && (
        <div className="cq-finish-overlay">
          <GameOverlay isOpen={finalCompleteOpen}>
            <GamePopup
              title="ðŸŽ‰ Amazing!"
              subtitle="You finished all color levels!"
              buttons={[
                {
                  label: "Play Again",
                  onClick: handlePlayAgain,
                  variant: "yes",
                },
                {
                  label: "View Progress",
                  onClick: () => navigate("/parent-progress"),
                  variant: "secondary",
                },
              ]}
            >
              Progress: {totalAllItems}/{totalAllItems} | Wrong Attempts: {wrongAttempts}
            </GamePopup>
          </GameOverlay>
        </div>
      )}
    </div>
  );
}

