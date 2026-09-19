import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
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

type TraceKind = "circle" | "triangle" | "oval" | "square" | "pentagon" | "star" | "hexagon" | "diamond";

const SHAPE_LABEL: Record<TraceKind, string> = {
  circle: "Circle",
  triangle: "Triangle",
  oval: "Oval",
  square: "Square",
  pentagon: "Pentagon",
  star: "Star",
  hexagon: "Hexagon",
  diamond: "Diamond",
};

const INTRO: LevelIntroContent = {
  title: "Trace the Shape!",
  subtitle: "Drag your finger along the outline. A little over the line is okay.",
  speech: "Trace the shape with your finger. Follow the outline. It is okay if you go a little over the line.",
  compact: true,
};

const LEVELS: Array<{ name: string; kinds: TraceKind[]; time: number; accept: number; miss: number }> = [
  { name: "Level 1", kinds: ["circle", "triangle"], time: 55, accept: 72, miss: 118 },
  { name: "Level 2", kinds: ["oval", "square", "pentagon"], time: 75, accept: 64, miss: 108 },
  { name: "Level 3", kinds: ["star", "hexagon", "diamond"], time: 90, accept: 58, miss: 100 },
];

function polygonPath(count: number, cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    pts.push(`${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

function shapePath(kind: TraceKind): string {
  if (kind === "circle") return "M 200 62 A 138 138 0 1 1 199.9 62 Z";
  if (kind === "oval") return "M 200 48 A 96 152 0 1 1 199.9 48 Z";
  if (kind === "triangle") return "M 200 46 L 352 330 L 48 330 Z";
  if (kind === "square") return "M 78 78 L 322 78 L 322 322 L 78 322 Z";
  if (kind === "pentagon") return polygonPath(5, 200, 205, 132);
  if (kind === "hexagon") return polygonPath(6, 200, 205, 128);
  if (kind === "diamond") return "M 200 46 L 352 200 L 200 354 L 48 200 Z";
  const cx = 200;
  const cy = 208;
  const outer = 132;
  const inner = 54;
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`);
  }
  return `M ${points.join(" L ")} Z`;
}

function closestInWindow(path: SVGPathElement, x: number, y: number, fromT: number, back: number, ahead: number) {
  const length = path.getTotalLength();
  const start = Math.max(0, fromT - back);
  const end = Math.min(1, fromT + ahead);
  const steps = 40;
  let bestT = fromT;
  let bestD = Infinity;
  let bestPt = path.getPointAtLength(fromT * length);
  for (let i = 0; i <= steps; i += 1) {
    const t = start + ((end - start) * i) / steps;
    const pt = path.getPointAtLength(t * length);
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d < bestD) {
      bestD = d;
      bestT = t;
      bestPt = pt;
    }
  }
  return { t: bestT, d: bestD, pt: bestPt };
}

export default function ShapesStarTrace() {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const coveredRef = useRef(0);
  const doneRef = useRef(false);
  const strokingRef = useRef(false);
  const countedMissRef = useRef(false);
  const regrabRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const shapeIndexRef = useRef(0);
  const switchingRef = useRef(false);
  const pointerDownRef = useRef(false);
  const switchTimerRef = useRef<number | null>(null);
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("shapes-trace");
  const [levelIndex, setLevelIndex] = useState(0);
  const [shapeIndex, setShapeIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [star, setStar] = useState({ x: 200, y: 46 });
  const [onLine, setOnLine] = useState(false);
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const level = LEVELS[levelIndex];
  const currentKind = level.kinds[Math.min(shapeIndex, level.kinds.length - 1)];

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
  useStarTimeUp(clock.timeUpOpen, levelIndex, shapeIndex > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  const placeStar = useCallback((t: number) => {
    const path = pathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    const pt = path.getPointAtLength(Math.min(length, Math.max(0, t) * length));
    setStar({ x: pt.x, y: pt.y });
  }, []);

  const resetBoard = useCallback((index: number) => {
    doneRef.current = false;
    coveredRef.current = 0;
    shapeIndexRef.current = 0;
    strokingRef.current = false;
    countedMissRef.current = false;
    regrabRef.current = false;
    lastPointRef.current = null;
    switchingRef.current = false;
    pointerDownRef.current = false;
    if (switchTimerRef.current != null) {
      window.clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
    setLevelIndex(index);
    setShapeIndex(0);
    setProgress(0);
    setOnLine(false);
    setPaused(false);
    setCompleteOpen(false); setGameOverOpen(false);
    setWrong(0);
    window.setTimeout(() => placeStar(0), 30);
  }, [placeStar]);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
    return () => {
      if (switchTimerRef.current != null) window.clearTimeout(switchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!clock.playing) return;
    placeStar(coveredRef.current);
  }, [clock.playing, currentKind, placeStar]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    const nextShape = shapeIndexRef.current + 1;
    if (nextShape < LEVELS[levelIndex].kinds.length) {
      switchingRef.current = true;
      strokingRef.current = false;
      shapeIndexRef.current = nextShape;
      coveredRef.current = 0;
      regrabRef.current = true;
      countedMissRef.current = true;
      setOnLine(false);
      setShapeIndex(nextShape);
      setProgress(0);
      if (switchTimerRef.current != null) window.clearTimeout(switchTimerRef.current);
      switchTimerRef.current = window.setTimeout(() => {
        placeStar(0);
        const unlock = () => {
          if (pointerDownRef.current) {
            switchTimerRef.current = window.setTimeout(unlock, 50);
            return;
          }
          switchTimerRef.current = null;
          switchingRef.current = false;
        };
        unlock();
      }, 750);
      const nextKind = LEVELS[levelIndex].kinds[nextShape];
      if (soundEnabled) speakKidPrompt(`Great! Now trace the ${SHAPE_LABEL[nextKind].toLowerCase()}!`, { interrupt: true });
      return;
    }
    doneRef.current = true;
    strokingRef.current = false;
    setOnLine(false);
    setProgress(1);
    setCompleteOpen(true);
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "shapes_trace", Math.max(50, 100 - wrong * 10), wrong, levelIndex >= 2);
    }
    if (soundEnabled) speakKidPrompt("Beautiful tracing!", { interrupt: true });
  }, [childId, completeLevel, levelIndex, placeStar, soundEnabled, wrong]);

  const markWrong = useCallback(() => {
    if (countedMissRef.current || doneRef.current) return;
    countedMissRef.current = true;
    setWrong((count) => count + 1);
    if (soundEnabled) speakKidPrompt("Stay on the line!", { interrupt: true });
  }, [soundEnabled]);

  const toLocal = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 400,
      y: ((clientY - rect.top) / rect.height) * 400,
    };
  };

  const traceAt = (x: number, y: number) => {
    const path = pathRef.current;
    if (!path || doneRef.current || switchingRef.current || !clock.playing) return;
    const covered = coveredRef.current;
    const length = path.getTotalLength();
    const starPt = path.getPointAtLength(Math.min(length, Math.max(0, covered) * length));
    const distToStar = Math.hypot(x - starPt.x, y - starPt.y);
    lastPointRef.current = { x, y };

    const near = closestInWindow(path, x, y, covered, 0.08, 0.12);

    if (near.d > level.miss) {
      setOnLine(false);
      const catchingStar = regrabRef.current && distToStar < 150;
      if (!catchingStar && strokingRef.current) markWrong();
      return;
    }

    regrabRef.current = false;
    countedMissRef.current = false;
    setOnLine(true);
    if (near.d > level.accept) return;
    if (near.t + 0.08 < covered) return;

    const next = Math.max(covered, near.t);
    coveredRef.current = next;
    setProgress(next);
    placeStar(Math.min(0.999, next));
    if (next >= 0.92) finish();
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointerDownRef.current = true;
    if (!clock.playing || switchingRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    strokingRef.current = true;
    regrabRef.current = true;
    lastPointRef.current = null;
    const point = toLocal(event.clientX, event.clientY);
    if (point) traceAt(point.x, point.y);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!clock.playing) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = toLocal(event.clientX, event.clientY);
    if (point) traceAt(point.x, point.y);
  };

  const onPointerUp = () => {
    pointerDownRef.current = false;
    strokingRef.current = false;
    regrabRef.current = true;
    setOnLine(false);
  };

  return (
    <div className="ssm ssm--trace">
      <ShapesMiniChrome
        mapTitle="Trace Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title={`Trace the ${SHAPE_LABEL[currentKind]}!`}
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        tried={shapeIndex > 0 || wrong > 0 || progress > 0.02}
        extraHeader={<GamePauseButton onClick={() => setPaused(true)} />}
        footerMessage={
          onLine
            ? "Great! Keep following the outline."
            : `Trace the ${SHAPE_LABEL[currentKind].toLowerCase()} (${shapeIndex + 1} of ${level.kinds.length}). A little over is okay.`
        }
        progress={shapeIndex}
        total={level.kinds.length}
        wrongAttempts={wrong}
        hideFooter={completeOpen}
      >
        <div className="sst-stage">
          <svg
            ref={svgRef}
            className="sst-svg"
            viewBox="0 0 400 400"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <path d={shapePath(currentKind)} className="sst-hit" />
            <path d={shapePath(currentKind)} className="sst-ghost" />
            <path d={shapePath(currentKind)} className="sst-line" />
            <path
              ref={pathRef}
              d={shapePath(currentKind)}
              className="sst-drawn"
              pathLength={100}
              strokeDasharray={`${Math.max(0.1, progress * 100)} 100`}
            />
            <g transform={`translate(${star.x} ${star.y})`} className={onLine ? "is-hot" : ""}>
              <polygon
                className="sst-star"
                points="0,-18 5,-6 18,-6 8,2 11,15 0,8 -11,15 -8,2 -18,-6 -5,-6"
              />
            </g>
          </svg>
          <img className="ssm-bear sst-bear" src={bear} alt="" />
        </div>
      </ShapesMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="Trace the outline when you are ready."
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
          subtitle={`Stay on the line as you go around. Progress: ${shapeIndex}/${level.kinds.length} | Wrong Attempts: ${wrong}`}
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
          subtitle={
            levelIndex >= 2
              ? `You finished Tracing the Stars! Progress: ${level.kinds.length}/${level.kinds.length} | Wrong Attempts: ${wrong}`
              : `${level.name} complete! Proceed to the next level? Progress: ${level.kinds.length}/${level.kinds.length} | Wrong Attempts: ${wrong}`
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
