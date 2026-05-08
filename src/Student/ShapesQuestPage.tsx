import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import "./ShapesQuestPage.css";

import gameBg from "./images/shapes-bg.jpg";
import bearImg from "./images/bear-3.png";

type ShapeKind =
  | "square"
  | "rectangle"
  | "triangle"
  | "circle"
  | "diamond"
  | "hexagon";

type ShapeItem = {
  id: string;
  kind: ShapeKind;
  label: string;
};

type Slot = {
  id: string;
  accepts: Exclude<ShapeKind, "circle" | "diamond" | "hexagon">;
  label: string;
};

const slots: Slot[] = [
  { id: "slot-roof", accepts: "triangle", label: "Roof" },
  { id: "slot-window", accepts: "square", label: "Window" },
  { id: "slot-door", accepts: "rectangle", label: "Door" },
];

type Level = {
  name: "Easy" | "Medium" | "Hard";
  shapes: ShapeItem[];
  showHintsOnStart: boolean;
};

const levels: Level[] = [
  {
    name: "Easy",
    shapes: [
      { id: "easy-square", kind: "square", label: "Square" },
      { id: "easy-rectangle", kind: "rectangle", label: "Rectangle" },
      { id: "easy-triangle", kind: "triangle", label: "Triangle" },
    ],
    showHintsOnStart: true,
  },
  {
    name: "Medium",
    shapes: [
      { id: "med-square", kind: "square", label: "Square" },
      { id: "med-rectangle", kind: "rectangle", label: "Rectangle" },
      { id: "med-triangle", kind: "triangle", label: "Triangle" },
      { id: "med-circle", kind: "circle", label: "Circle" },
      { id: "med-diamond", kind: "diamond", label: "Diamond" },
    ],
    showHintsOnStart: true,
  },
  {
    name: "Hard",
    shapes: [
      { id: "hard-square", kind: "square", label: "Square" },
      { id: "hard-rectangle", kind: "rectangle", label: "Rectangle" },
      { id: "hard-triangle", kind: "triangle", label: "Triangle" },
      { id: "hard-circle", kind: "circle", label: "Circle" },
      { id: "hard-diamond", kind: "diamond", label: "Diamond" },
      { id: "hard-hexagon", kind: "hexagon", label: "Hexagon" },
    ],
    showHintsOnStart: false,
  },
];

function DraggableShape({
  shape,
  disabled,
}: {
  shape: ShapeItem;
  disabled: boolean;
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
      aria-label={shape.label}
    />
  );
}

function DropSlot({
  slot,
  filledBy,
  showHint,
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
      {filledBy ? (
        <div className={`sq-slot-shape sq-slot-shape--${filledBy.kind}`} />
      ) : (
        showHint && <div className="sq-slot-hint">{slot.accepts}</div>
      )}
    </div>
  );
}

export default function ShapesQuestPage() {
  const navigate = useNavigate();
  const audioRef = useRef<{
    ctx: AudioContext;
    gain: GainNode;
    oscA?: OscillatorNode;
    oscB?: OscillatorNode;
    intervalId?: number;
  } | null>(null);
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const lastSpokenRef = useRef<{ text: string; at: number } | null>(null);

  const [levelIndex, setLevelIndex] = useState(0);
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [message, setMessage] = useState(
    "Drag the shapes into the correct spots to build the house!"
  );
  const [hasPlayed, setHasPlayed] = useState(false);
  const [finalCongratsOpen, setFinalCongratsOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [proceedPromptLevel, setProceedPromptLevel] = useState<number | null>(
    null
  );
  const [levelSummaryOpen, setLevelSummaryOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [voicesReady, setVoicesReady] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const level = levels[levelIndex] ?? levels[0];
  const activeShapes = level.shapes;

  const placedShapeIds = useMemo(() => new Set(Object.values(placed)), [placed]);
  const availableShapes = useMemo(
    () => activeShapes.filter((s) => !placedShapeIds.has(s.id)),
    [activeShapes, placedShapeIds]
  );

  const progress = Object.keys(placed).length;
  const total = slots.length;
  const levelComplete = progress === total;
  const isFinished = finalCongratsOpen;

  const slotToShape = useMemo(() => {
    const byId = new Map(activeShapes.map((s) => [s.id, s]));
    const result: Record<string, ShapeItem | null> = {};
    for (const slot of slots) {
      const shapeId = placed[slot.id];
      result[slot.id] = shapeId ? byId.get(shapeId) ?? null : null;
    }
    return result;
  }, [activeShapes, placed]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (countdown !== null) return;
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;

    if (!overId) return;
    const slot = slots.find((s) => s.id === overId);
    const shape = activeShapes.find((s) => s.id === activeId);
    if (!slot || !shape) return;

    setHasPlayed(true);
    setTimerRunning(true);

    const activeKind = (event.active.data.current as { kind?: ShapeKind } | null)
      ?.kind;
    if (!activeKind) return;

    const alreadyFilled = Boolean(placed[slot.id]);
    const alreadyPlacedShape = placedShapeIds.has(activeId);
    if (alreadyFilled || alreadyPlacedShape) return;

    if (activeKind === slot.accepts) {
      const updated = { ...placed, [slot.id]: activeId };
      setPlaced(updated);

      const nextProgress = Object.keys(updated).length;
      if (nextProgress === total) {
        if (levelIndex >= 2) {
          setFinalCongratsOpen(true);
          setMessage("Amazing! You finished all levels!");
        } else {
          setProceedPromptLevel(levelIndex);
          setTimerRunning(false);
          setMessage(`Great job! Level ${levelIndex + 1} complete!`);
        }
      } else {
        setMessage(`Great job! That's the correct ${activeKind}.`);
      }
    } else {
      setWrongAttempts((p) => p + 1);
      setMessage("Oops! Try again.");
    }
  };

  const resetCommon = () => {
    setPlaced({});
    setWrongAttempts(0);
    setHasPlayed(false);
    setMessage("Drag the shapes into the correct spots to build the house!");
    setTimeLeft(30);
    setTimerRunning(false);
    setProceedPromptLevel(null);
    setLevelSummaryOpen(false);
    setCountdown(3);
    setTimeUpOpen(false);
    warnedSecondsRef.current = new Set();
  };

  const resetCurrentLevel = () => {
    resetCommon();
    setFinalCongratsOpen(false);
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
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/student");
  };

  useEffect(() => {
    // Reset timer whenever level changes
    setTimeLeft(30);
    setTimerRunning(false);
    setHasPlayed(false);
    setPlaced({});
    setMessage("Drag the shapes into the correct spots to build the house!");
    // keep wrongAttempts across levels? requirement says fast, but keep per level:
    setWrongAttempts(0);
    setFinalCongratsOpen(false);
    setProceedPromptLevel(null);
    setLevelSummaryOpen(false);
    setCountdown(3);
    setTimeUpOpen(false);
    warnedSecondsRef.current = new Set();
  }, [levelIndex]);

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
    if (!soundEnabled) return;
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
    if (!soundEnabled) return;
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
    if (countdown === null) return;
    setTimerRunning(false);

    if (countdown <= 0) {
      setCountdown(null);
      setTimerRunning(true);
      playKidBeep(0);
      sayKid("Go!");
      startBgSong();
      return;
    }

    if (countdown === 3) {
      playOpeningSong();
    }
    playKidBeep(countdown);
    sayKid(String(countdown));
    const t = window.setTimeout(() => {
      setCountdown((p) => (p === null ? null : p - 1));
    }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  useEffect(() => {
    // Pause background music during popups / finished / countdown
    const popupOpen = proceedPromptLevel !== null || levelSummaryOpen;
    if (isFinished || countdown !== null || popupOpen) {
      stopBgSong();
      return;
    }
    if (timerRunning) startBgSong();
    else stopBgSong();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning, proceedPromptLevel, levelSummaryOpen, isFinished, countdown]);

  useEffect(() => {
    if (!timerRunning || levelComplete || isFinished) return;

    if (timeLeft <= 0) {
      setTimerRunning(false);
      setProceedPromptLevel(null);
      setLevelSummaryOpen(false);
      warnedSecondsRef.current = new Set();

      setMessage("Time's up!");
      setTimeUpOpen(true);
      return;
    }

    const t = window.setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => window.clearTimeout(t);
  }, [timerRunning, timeLeft, levelComplete, isFinished]);

  useEffect(() => {
    // Last 5 seconds warning + spoken countdown
    if (!timerRunning) return;
    if (countdown !== null) return;
    if (proceedPromptLevel !== null || levelSummaryOpen) return;
    if (levelComplete || isFinished) return;
    if (timeLeft > 5 || timeLeft <= 0) return;

    if (warnedSecondsRef.current.has(timeLeft)) return;
    warnedSecondsRef.current.add(timeLeft);

    if (timeLeft === 5) {
      sayKid("Hurry! Five seconds left!");
    } else {
      sayKid(String(timeLeft));
    }
    playKidBeep(timeLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, timerRunning, countdown, proceedPromptLevel, levelSummaryOpen, levelComplete, isFinished]);

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

  // NOTE: proceed is handled via popup (like LetterQuestPage)

  return (
    <div className="sq-page-bg" style={{ backgroundImage: `url(${gameBg})` }}>
      <div className="sq-top-bar">
        <button
          type="button"
          className="sq-back-btn"
          onClick={handleBack}
        >
          ← Back
        </button>
        <button
          type="button"
          className="sq-lesson-btn"
          onClick={() => navigate("/lesson/shapes")}
        >
          ← Lesson
        </button>
      </div>
<div className="sq-title-wrapper">

  <h2 className="sq-title">
    Build the House!
  </h2>

  <p className="sq-subtitle">
    Drag the shapes onto the matching outlines
    to complete the house!
  </p>

</div>

      <div className="sq-game-card">
        <div className="sq-game-container">
          <div className="sq-tag">Shapes</div>
          <div className="sq-meta-row">
            <div className="sq-level-badge">
              Level {levelIndex + 1}: {level.name}
            </div>
            <div className="sq-timer" aria-label="Time remaining">
              ⏱ {timeLeft}s
            </div>
            <button
              type="button"
              className="sq-sound-toggle"
              onClick={() => {
                setSoundEnabled((prev) => {
                  const next = !prev;
                  if (!next && "speechSynthesis" in window) {
                    window.speechSynthesis.cancel();
                  }
                  return next;
                });
              }}
              aria-label={soundEnabled ? "Turn sound off" : "Turn sound on"}
            >
              {soundEnabled ? "🔊 On" : "🔇 Off"}
            </button>
          </div>

          <DndContext
            onDragStart={(event) => {
              if (countdown !== null) return;
              if (timeUpOpen) return;
              const kind = (
                event.active.data.current as { kind?: ShapeKind } | null
              )?.kind;
              if (!kind) return;
              const spoken = kind.charAt(0).toUpperCase() + kind.slice(1);
              sayKid(spoken);
            }}
            onDragEnd={handleDragEnd}
          >
            <div className="sq-scene">
              <div className="sq-house">
                <div className="sq-house-face">
                  <span className="sq-eye left" />
                  <span className="sq-eye right" />
                  <span className="sq-mouth" />
                  <span className="sq-blush left" />
                  <span className="sq-blush right" />
                </div>

                <div className="sq-house-slots">
                  <div className="sq-slot-pos sq-slot-pos--roof">
                    <DropSlot
                      slot={slots[0]}
                      filledBy={slotToShape[slots[0].id]}
                      showHint={level.showHintsOnStart && !hasPlayed}
                    />
                  </div>
                  <div className="sq-slot-pos sq-slot-pos--window">
                    <DropSlot
                      slot={slots[1]}
                      filledBy={slotToShape[slots[1].id]}
                      showHint={level.showHintsOnStart && !hasPlayed}
                    />
                  </div>
                  <div className="sq-slot-pos sq-slot-pos--door">
                    <DropSlot
                      slot={slots[2]}
                      filledBy={slotToShape[slots[2].id]}
                      showHint={level.showHintsOnStart && !hasPlayed}
                    />
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
                    disabled={countdown !== null}
                  />
                ))}
              </div>
            </div>

            {countdown !== null && (
              <div className="sq-countdown" aria-hidden="true">
                <div className="sq-countdown-bubble">{countdown}</div>
              </div>
            )}

            {timeUpOpen && (
              <div
                className="sq-level-popup sq-level-popup--summary"
                role="dialog"
                aria-modal="true"
              >
                ⏰ Time&apos;s up!
                <br />
                <span className="sq-level-popup__meta">
                  Level {levelIndex + 1} | Progress: {progress}/{total} | Wrong
                  Attempts: {wrongAttempts}
                </span>
                <br />
                <br />
                {levelIndex < 2 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setTimeUpOpen(false);
                        handleProceed();
                      }}
                    >
                      Proceed to Level {levelIndex + 2}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTimeUpOpen(false);
                        resetCurrentLevel();
                      }}
                    >
                      Replay this Level
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setTimeUpOpen(false);
                        resetCurrentLevel();
                      }}
                    >
                      Replay this Level
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTimeUpOpen(false);
                        handlePlayAgain();
                      }}
                    >
                      Play Again
                    </button>
                  </>
                )}
              </div>
            )}

            {proceedPromptLevel !== null && levelIndex < 2 && (
              <div className="sq-level-popup" role="dialog" aria-modal="true">
                🎉 Level {levelIndex + 1} Complete!
                <br />
                Proceed to Level {levelIndex + 2}?
                <br />
                <br />
                <button type="button" onClick={handleProceed}>
                  Yes, let's go!
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProceedPromptLevel(null);
                    setLevelSummaryOpen(true);
                  }}
                >
                  Not now
                </button>
              </div>
            )}

            {levelSummaryOpen && levelIndex < 2 && (
              <div
                className="sq-level-popup sq-level-popup--summary"
                role="dialog"
                aria-modal="true"
              >
                {message ? message : "Great job!"}
                <br />
                <span className="sq-level-popup__meta">
                  Progress: {progress}/{total} | Wrong Attempts: {wrongAttempts}
                </span>
                <br />
                <br />
                <button type="button" onClick={handleProceed}>
                  Proceed to Level {levelIndex + 2}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLevelSummaryOpen(false);
                    resetCurrentLevel();
                  }}
                >
                  Replay this Level
                </button>
              </div>
            )}
          </DndContext>
        </div>
      </div>

      <div className="sq-panel">
        <div className="sq-message">
          {!hasPlayed
            ? "Drag the shapes to match the outlines!"
            : isFinished
              ? "Congrats! You finished all levels!"
              : message}
        </div>
        <div className="sq-score">
          Progress: {progress}/{total} | Wrong Attempts: {wrongAttempts}
        </div>

        {isFinished && (
          <div className="sq-actions">
            <button type="button" className="sq-action-btn" onClick={handlePlayAgain}>
              Play Again
            </button>
            <button
              type="button"
              className="sq-action-btn sq-action-btn--alt"
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

