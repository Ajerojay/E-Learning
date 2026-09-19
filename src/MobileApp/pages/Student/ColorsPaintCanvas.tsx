import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { recordGameProgressRpc } from "../../../lib/gameProgressDb";
import { speakKidPrompt } from "../../nativeTts";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { ColorsMiniChrome, colorsNextLevelButtons, speakNextLevelPrompt } from "./ColorsMiniChrome";
import { useColorsMiniClock, useLandscapeLock } from "./useColorsMiniClock";
import type { LevelIntroContent } from "./levelIntro";
import ColorConfetti from "./ColorConfetti";
import { fillZone, floodFillAt, hexToRgb, punchWhiteBackground, zoneMatchesColor } from "./paintOutline";
import bear from "./images/bear-2.png";
import carOutline from "./images/colors/paint/car.png";
import iceCreamOutline from "./images/colors/paint/icecream.png";
import teddyOutline from "./images/colors/paint/teddy.png";
import "./ColorsMiniGames.css";

type PaintColor = "red" | "blue" | "yellow" | "green" | "orange" | "pink" | "brown" | "purple";
type Zone = {
  id: string;
  color: PaintColor;
  x: number;
  y: number;
  w: number;
  h: number;
  fx?: number;
  fy?: number;
  seeds?: Array<{ x: number; y: number }>;
};
type SvgPart = { id: string; color: PaintColor; d: string };
type Drawing =
  | { id: string; kind: "svg"; viewBox: string; parts: SvgPart[] }
  | { id: string; kind: "image"; src: string; zones: Zone[]; flood?: boolean };

const PAINT: Record<PaintColor, string> = {
  red: "#ef5b6a",
  blue: "#4d9fff",
  yellow: "#ffe066",
  green: "#62d26f",
  orange: "#ff9f43",
  pink: "#ff8fb8",
  brown: "#c47a3a",
  purple: "#b07cff",
};

const INTRO: LevelIntroContent = {
  title: "Fill the canvas!",
  subtitle: "Tap a paint bucket, then tap the drawing to fill it.",
  speech: "Hi friend! Pick a paint color first. Then tap the picture to fill it.",
  compact: true,
};

const HOUSE_PARTS: SvgPart[] = [
  { id: "roof", color: "red", d: "M28 88 L120 28 L212 88 Z" },
  { id: "wall", color: "yellow", d: "M48 88 H192 V160 H48 Z" },
];

const ICE_CREAM_ZONES: Zone[] = [
  { id: "scoop", color: "pink", x: 0.22, y: 0.02, w: 0.56, h: 0.46 },
  { id: "cone", color: "orange", x: 0.28, y: 0.44, w: 0.44, h: 0.52 },
];

const FLOWER_PARTS: SvgPart[] = [
  {
    id: "petals",
    color: "pink",
    d: [
      "M52 38 a28 28 0 1 0 56 0 a28 28 0 1 0 -56 0",
      "M94 48 a28 28 0 1 0 56 0 a28 28 0 1 0 -56 0",
      "M82 88 a28 28 0 1 0 56 0 a28 28 0 1 0 -56 0",
      "M22 88 a28 28 0 1 0 56 0 a28 28 0 1 0 -56 0",
      "M10 48 a28 28 0 1 0 56 0 a28 28 0 1 0 -56 0",
    ].join(" "),
  },
  { id: "center", color: "yellow", d: "M56 62 a24 24 0 1 0 48 0 a24 24 0 1 0 -48 0" },
  { id: "stem", color: "green", d: "M74 84 H86 V168 H74 Z M86 118 Q138 96 90 142 Q86 132 86 124 Z" },
];

const BOAT_PARTS: SvgPart[] = [
  { id: "hull", color: "blue", d: "M18 108 L202 108 L174 150 L46 150 Z" },
  { id: "cabin", color: "yellow", d: "M42 78 H96 V108 H42 Z" },
  { id: "sail", color: "red", d: "M110 18 L110 108 L182 108 Z" },
];

const LEVELS: Array<{
  name: string;
  prompt: string;
  time: number;
  buckets: PaintColor[];
  drawings: Drawing[];
}> = [
  {
    name: "Level 1",
    prompt: "Paint the car yellow!",
    time: 40,
    buckets: ["red", "blue", "yellow"],
    drawings: [
      { id: "car", kind: "image", src: carOutline, zones: [{ id: "car", color: "yellow", x: 0.08, y: 0.22, w: 0.84, h: 0.62 }] },
    ],
  },
  {
    name: "Level 2",
    prompt: "Paint the house and the ice cream!",
    time: 55,
    buckets: ["red", "yellow", "pink", "orange", "blue"],
    drawings: [
      { id: "house", kind: "svg", viewBox: "0 0 240 180", parts: HOUSE_PARTS },
      { id: "ice-cream", kind: "image", src: iceCreamOutline, zones: ICE_CREAM_ZONES },
    ],
  },
  {
    name: "Level 3",
    prompt: "Paint the bear, flower, and boat!",
    time: 75,
    buckets: ["red", "orange", "yellow", "brown", "pink", "green", "blue", "purple"],
    drawings: [
      {
        id: "teddy",
        kind: "image",
        src: teddyOutline,
        flood: true,
        zones: [
          { id: "left ear", color: "brown", x: 0.16, y: 0.02, w: 0.22, h: 0.2, fx: 0.28, fy: 0.14 },
          { id: "right ear", color: "brown", x: 0.62, y: 0.02, w: 0.22, h: 0.2, fx: 0.72, fy: 0.14 },
          { id: "head", color: "brown", x: 0.26, y: 0.08, w: 0.48, h: 0.28, fx: 0.5, fy: 0.2 },
          { id: "left arm", color: "brown", x: 0.02, y: 0.4, w: 0.26, h: 0.28, fx: 0.22, fy: 0.52 },
          { id: "right arm", color: "brown", x: 0.72, y: 0.4, w: 0.26, h: 0.28, fx: 0.78, fy: 0.52 },
          { id: "body", color: "brown", x: 0.3, y: 0.42, w: 0.4, h: 0.28, fx: 0.5, fy: 0.56 },
          { id: "left foot", color: "orange", x: 0.16, y: 0.7, w: 0.3, h: 0.26, fx: 0.32, fy: 0.82 },
          { id: "right foot", color: "orange", x: 0.54, y: 0.7, w: 0.3, h: 0.26, fx: 0.68, fy: 0.82 },
          {
            id: "nose",
            color: "yellow",
            x: 0.38,
            y: 0.26,
            w: 0.24,
            h: 0.18,
            fx: 0.44,
            fy: 0.32,
            seeds: [
              { x: 0.44, y: 0.32 },
              { x: 0.56, y: 0.32 },
              { x: 0.5, y: 0.3 },
            ],
          },
        ],
      },
      { id: "flower", kind: "svg", viewBox: "0 0 160 180", parts: FLOWER_PARTS },
      { id: "boat", kind: "svg", viewBox: "0 0 220 170", parts: BOAT_PARTS },
    ],
  },
];

function drawingPartCount(drawing: Drawing) {
  return drawing.kind === "svg" ? drawing.parts.length : drawing.zones.length;
}

function levelPartCount(drawings: Drawing[]) {
  return drawings.reduce((sum, drawing) => sum + drawingPartCount(drawing), 0);
}

function zoneAt(zones: Zone[], nx: number, ny: number) {
  const hits = zones.filter((zone) => nx >= zone.x && nx <= zone.x + zone.w && ny >= zone.y && ny <= zone.y + zone.h);
  if (!hits.length) return null;
  return hits.reduce((smallest, zone) => (zone.w * zone.h < smallest.w * smallest.h ? zone : smallest));
}

function floodSeeds(zone: Zone, width: number, height: number) {
  const points = zone.seeds?.length ? zone.seeds : [{ x: zone.fx ?? zone.x + zone.w / 2, y: zone.fy ?? zone.y + zone.h / 2 }];
  return points.map((point) => ({ x: point.x * width, y: point.y * height }));
}

function PreviewArt({ drawing, previewMax }: { drawing: Drawing; previewMax: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (drawing.kind !== "image") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const image = new Image();
    image.src = drawing.src;
    void image.decode().then(() => {
      if (cancelled) return;
      const work = document.createElement("canvas");
      work.width = image.width;
      work.height = image.height;
      const workCtx = work.getContext("2d");
      const viewCtx = canvas.getContext("2d");
      if (!workCtx || !viewCtx) return;
      workCtx.drawImage(image, 0, 0);
      const pixels = workCtx.getImageData(0, 0, work.width, work.height);
      const paintZones = () => {
        for (const zone of drawing.zones) {
          const rgb = hexToRgb(PAINT[zone.color]);
          if (drawing.flood) {
            for (const seed of floodSeeds(zone, pixels.width, pixels.height)) {
              floodFillAt(pixels, seed.x, seed.y, rgb);
            }
          } else {
            fillZone(pixels, zone, rgb);
          }
        }
      };
      if (drawing.flood) {
        paintZones();
        punchWhiteBackground(pixels);
      } else {
        punchWhiteBackground(pixels);
        paintZones();
      }
      workCtx.putImageData(pixels, 0, 0);
      const scale = Math.min(previewMax / work.width, previewMax / work.height);
      canvas.width = Math.max(1, Math.round(work.width * scale));
      canvas.height = Math.max(1, Math.round(work.height * scale));
      viewCtx.clearRect(0, 0, canvas.width, canvas.height);
      viewCtx.drawImage(work, 0, 0, canvas.width, canvas.height);
    });
    return () => {
      cancelled = true;
    };
  }, [drawing, previewMax]);

  if (drawing.kind === "svg") {
    return (
      <svg className="cmini-goal-art" viewBox={drawing.viewBox} aria-hidden="true">
        {drawing.parts.map((part) => (
          <path
            key={part.id}
            d={part.d}
            fill={PAINT[part.color]}
            stroke="#24324a"
            strokeWidth="5"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    );
  }

  return <canvas ref={canvasRef} className="cmini-goal-art" />;
}

function PaintGoalPreview({ drawings, label }: { drawings: Drawing[]; label: string }) {
  const count = drawings.length;
  const previewMax = count === 1 ? 110 : count === 2 ? 80 : 56;
  return (
    <div
      className={`cmini-goal${count === 1 ? " cmini-goal--solo" : " cmini-goal--row"}${count === 2 ? " cmini-goal--pair" : ""}`}
      aria-label={`Finished picture: ${label}`}
    >
      {drawings.map((drawing) => (
        <PreviewArt key={drawing.id} drawing={drawing} previewMax={previewMax} />
      ))}
    </div>
  );
}

export default function ColorsPaintCanvas({ mobileApp = false }: { mobileApp?: boolean }) {
  const navigate = useNavigate();
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("colors-paint");
  const isLandscape = useLandscapeLock(mobileApp);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [levelIndex, setLevelIndex] = useState(0);
  const [brush, setBrush] = useState<PaintColor | null>(null);
  const [wrong, setWrong] = useState(0);
  const [fills, setFills] = useState<Record<string, string>>({});
  const [filledCount, setFilledCount] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [message, setMessage] = useState("Pick a paint color, then tap the picture!");
  const doneRef = useRef(false);
  const fillsRef = useRef<Record<string, string>>({});
  const level = LEVELS[levelIndex];
  const partCount = levelPartCount(level.drawings);

  const clock = useColorsMiniClock({
    intro: INTRO,
    mapOpen,
    isLandscape,
    paused,
    blocked: completeOpen || gameOverOpen || celebrate,
    timeLimit: level.time,
    levelIndex,
    soundEnabled,
  });
  useStarTimeUp(clock.timeUpOpen, levelIndex, filledCount > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  const countDone = useCallback((nextFills: Record<string, string>) => {
    let done = 0;
    for (const drawing of level.drawings) {
      if (drawing.kind === "svg") {
        done += drawing.parts.filter((part) => nextFills[part.id]).length;
        continue;
      }
      const canvas = canvasRefs.current[drawing.id];
      if (!canvas) continue;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      done += drawing.zones.filter((zone) => zoneMatchesColor(pixels, zone, hexToRgb(PAINT[zone.color]))).length;
    }
    return done;
  }, [level.drawings]);

  const drawOutline = useCallback(async (id: string, src: string, count: number) => {
    const canvas = canvasRefs.current[id];
    if (!canvas) return;
    const image = new Image();
    image.src = src;
    await image.decode();
    const crowded = count > 2;
    const many = count > 1;
    const maxW = Math.min(crowded ? 200 : many ? 280 : 720, Math.floor(window.innerWidth * (crowded ? 0.2 : many ? 0.28 : 0.64)));
    const maxH = Math.min(crowded ? 200 : many ? 240 : 400, Math.floor(window.innerHeight * (crowded ? 0.42 : many ? 0.5 : 0.72)));
    const scale = Math.min(maxW / image.width, maxH / image.height);
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    punchWhiteBackground(pixels);
    ctx.putImageData(pixels, 0, 0);
  }, []);

  const resetBoard = useCallback((index: number) => {
    doneRef.current = false;
    fillsRef.current = {};
    setLevelIndex(index);
    setBrush(null);
    setFills({});
    setWrong(0);
    setFilledCount(0);
    setCelebrate(false);
    setCompleteOpen(false); setGameOverOpen(false);
    setPaused(false);
    setMessage("Pick a paint color, then tap the picture!");
  }, []);

  useEffect(() => {
    const count = level.drawings.length;
    for (const drawing of level.drawings) {
      if (drawing.kind === "image") void drawOutline(drawing.id, drawing.src, count);
    }
  }, [drawOutline, level.drawings, levelIndex, mapOpen]);

  const finishLevel = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCelebrate(true);
    setMessage("Beautiful painting!");
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "colors_paint", Math.max(50, 100 - wrong * 10), wrong, levelIndex >= 2);
    }
    if (soundEnabled) speakKidPrompt("Beautiful painting!", { interrupt: true });
    window.setTimeout(() => {
      setCelebrate(false);
      setCompleteOpen(true);
      if (soundEnabled) speakNextLevelPrompt(true, levelIndex >= 2);
    }, 2600);
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const markProgress = (nextFills: Record<string, string>, partName: string) => {
    const done = countDone(nextFills);
    setFilledCount(done);
    setMessage(done === partCount ? "You colored every picture!" : `Nice! The ${partName} looks great.`);
    if (done === partCount) finishLevel();
  };

  const onCanvasTap = (drawing: Extract<Drawing, { kind: "image" }>, event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (!clock.playing || doneRef.current) return;
    const canvas = canvasRefs.current[drawing.id];
    if (!canvas) return;
    if (!brush) {
      setMessage("Pick a paint color first!");
      if (soundEnabled) speakKidPrompt("Pick a paint color first.", { interrupt: true });
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const zone = zoneAt(drawing.zones, x / canvas.width, y / canvas.height);
    if (!zone) return;
    if (brush !== zone.color) {
      setWrong((count) => count + 1);
      setMessage(`Oops! Try a different color for the ${zone.id}.`);
      if (soundEnabled) speakKidPrompt("Try a different color.", { interrupt: true });
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const painted = drawing.flood
      ? floodFillAt(pixels, x, y, hexToRgb(PAINT[brush]))
      : fillZone(pixels, zone, hexToRgb(PAINT[brush]));
    if (!painted) return;
    ctx.putImageData(pixels, 0, 0);
    markProgress(fillsRef.current, zone.id);
  };

  const paintSvgPart = (part: SvgPart) => {
    if (!clock.playing || doneRef.current) return;
    if (!brush) {
      setMessage("Pick a paint color first!");
      if (soundEnabled) speakKidPrompt("Pick a paint color first.", { interrupt: true });
      return;
    }
    if (brush !== part.color) {
      setWrong((count) => count + 1);
      setMessage(`Oops! Try a different color for the ${part.id}.`);
      if (soundEnabled) speakKidPrompt("Try a different color.", { interrupt: true });
      return;
    }
    const nextFills = { ...fillsRef.current, [part.id]: PAINT[brush] };
    fillsRef.current = nextFills;
    setFills(nextFills);
    markProgress(nextFills, part.id);
  };

  return (
    <div className="colors-page cmini cmini--canvas">
      <ColorsMiniChrome
        mapTitle="Paint Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title={level.prompt}
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        rotateLabel="Fill the Canvas"
        mobileApp={mobileApp}
        isLandscape={isLandscape}
        tried={filledCount > 0 || wrong > 0}
        wrong={wrong}
        extraHeader={<GamePauseButton onClick={() => setPaused(true)} />}
      >
        <PaintGoalPreview drawings={level.drawings} label={level.prompt} />
        <div className="cmini-stage">
          <div className={`cmini-drawings${level.drawings.length > 1 ? " cmini-drawings--many" : ""}${level.drawings.length > 2 ? " cmini-drawings--triple" : ""}`}>
            {level.drawings.map((drawing) =>
              drawing.kind === "svg" ? (
                <svg
                  key={drawing.id}
                  className="cmini-drawing cmini-drawing--svg"
                  viewBox={drawing.viewBox}
                  aria-label={drawing.id}
                >
                  {drawing.parts.map((part) => (
                    <path
                      key={part.id}
                      d={part.d}
                      fill={fills[part.id] || "#fff"}
                      stroke="#24324a"
                      strokeWidth="5"
                      strokeLinejoin="round"
                      onPointerUp={() => paintSvgPart(part)}
                    />
                  ))}
                </svg>
              ) : (
                <canvas
                  key={drawing.id}
                  ref={(node) => {
                    canvasRefs.current[drawing.id] = node;
                  }}
                  className="cmini-drawing"
                  aria-label={drawing.id}
                  onPointerUp={(event) => onCanvasTap(drawing, event)}
                />
              )
            )}
          </div>
          <div className={`cmini-buckets${level.buckets.length > 5 ? " cmini-buckets--grid" : ""}`}>
            {level.buckets.map((color) => (
              <button
                key={color}
                type="button"
                className={`cmini-bucket${brush === color ? " is-on" : ""}`}
                style={{ background: PAINT[color] }}
                onClick={() => {
                  if (!clock.playing) return;
                  setBrush(color);
                  setMessage(`You picked ${color}! Tap the picture.`);
                  if (soundEnabled) speakKidPrompt(color, { interrupt: true });
                }}
                aria-label={`${color} paint`}
              />
            ))}
          </div>
        </div>
        <img className="cmini-bear" src={bear} alt="" />
        {!completeOpen && (
          <div className="cq-panel">
            <p className="cq-message">{message}</p>
            <p className="cq-score">
              Progress: {filledCount}/{partCount} | Wrong Attempts: {wrong}
            </p>
          </div>
        )}
      </ColorsMiniChrome>

      <ColorConfetti active={celebrate} />

      <GamePausePopup
        open={paused}
        subtitle="Your painting will wait."
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />

      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/colors")}
        onReplay={() => { resetBoard(levelIndex); clock.replayLevel(); }}
      />
      <GameOverlay isOpen={clock.timeUpOpen && !gameOverOpen}>
        <GamePopup
          title="Time's up!"
          subtitle="Let's try this picture again."
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
          subtitle={levelIndex >= 2 ? "You finished Fill the Canvas!" : `${level.name} complete! Proceed to the next level?`}
          buttons={colorsNextLevelButtons({
            levelIndex,
            lastIndex: 2,
            onYes: () => resetBoard(levelIndex + 1),
            onNo: () => { setCompleteOpen(false); setGameOverOpen(false); setMapOpen(true); },
            onGames: () => navigate("/quest/colors"),
          })}
        />
      </GameOverlay>
    </div>
  );
}
