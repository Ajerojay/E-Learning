import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { recordGameProgressRpc } from "../../../lib/gameProgressDb";
import { speakKidPrompt } from "../../nativeTts";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { NumbersMiniChrome, NUMBER_WORDS, NumbersGameFooter, numbersNextLevelButtons } from "./NumbersMiniChrome";
import { useColorsMiniClock } from "./useColorsMiniClock";
import ColorConfetti from "./ColorConfetti";
import type { LevelIntroContent } from "./levelIntro";
import foxImg from "./images/numbers/dots-fox-cut.png";
import bunnyImg from "./images/numbers/dots-bunny-cut.png";
import pandaImg from "./images/numbers/dots-panda-cut.png";
import deerImg from "./images/numbers/dots-deer-cut.png";
import "./NumbersMiniGames.css";

type Dot = { n: number; x: number; y: number };
type AnimalKind = "fox" | "bunny" | "panda" | "deer";

const ANIMAL_ART: Record<AnimalKind, string> = {
  fox: foxImg,
  bunny: bunnyImg,
  panda: pandaImg,
  deer: deerImg,
};

const INTRO: LevelIntroContent = {
  title: "Connect the Dots!",
  subtitle: "Drag a line from 1 to 2, then 3, and so on to find the hidden animal.",
  speech: "Start at number one. Drag a line to two, then three, and keep going to find the hidden animal!",
  compact: true,
};

const LEVELS: Array<{ name: string; max: number; time: number; animal: AnimalKind; dots: Dot[] }> = [
  {
    name: "Level 1",
    max: 3,
    time: 40,
    animal: "fox",
    dots: [
      { n: 1, x: 28, y: 62 },
      { n: 2, x: 50, y: 22 },
      { n: 3, x: 74, y: 64 },
    ],
  },
  {
    name: "Level 2",
    max: 5,
    time: 50,
    animal: "bunny",
    dots: [
      { n: 1, x: 24, y: 48 },
      { n: 2, x: 50, y: 18 },
      { n: 3, x: 76, y: 40 },
      { n: 4, x: 32, y: 78 },
      { n: 5, x: 70, y: 78 },
    ],
  },
  {
    name: "Level 3",
    max: 8,
    time: 60,
    animal: "panda",
    dots: [
      { n: 1, x: 22, y: 42 },
      { n: 2, x: 38, y: 18 },
      { n: 3, x: 62, y: 18 },
      { n: 4, x: 78, y: 42 },
      { n: 5, x: 72, y: 68 },
      { n: 6, x: 50, y: 82 },
      { n: 7, x: 28, y: 68 },
      { n: 8, x: 50, y: 50 },
    ],
  },
];

function HiddenAnimal({ kind, complete }: { kind: AnimalKind; complete: boolean }) {
  return (
    <image
      className="ndots-animal"
      href={ANIMAL_ART[kind]}
      x="6"
      y="4"
      width="88"
      height="88"
      opacity={complete ? 1 : 0.16}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

function toBoardPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const mapped = point.matrixTransform(matrix.inverse());
  return { x: mapped.x, y: mapped.y };
}

export default function NumbersConnectDots() {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const doneRef = useRef(false);
  const connectedRef = useRef(1);
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("numbers-dots");
  const [levelIndex, setLevelIndex] = useState(0);
  const [connected, setConnected] = useState(1);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [wrong, setWrong] = useState(0);
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const celebrateTimerRef = useRef<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const level = LEVELS[levelIndex];

  const clock = useColorsMiniClock({
    intro: INTRO,
    mapOpen,
    isLandscape: true,
    paused,
    blocked: completeOpen || gameOverOpen || celebrating,
    timeLimit: level.time,
    levelIndex,
    soundEnabled,
  });
  useStarTimeUp(clock.timeUpOpen, levelIndex, connected > 1 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  const resetBoard = useCallback((index: number) => {
    doneRef.current = false;
    draggingRef.current = false;
    connectedRef.current = 1;
    setLevelIndex(index);
    setConnected(1);
    setCursor(null);
    setWrong(0);
    setPaused(false);
    setCelebrating(false);
    setCompleteOpen(false); setGameOverOpen(false);
    if (celebrateTimerRef.current) {
      window.clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  useEffect(() => {
    return () => {
      if (celebrateTimerRef.current) window.clearTimeout(celebrateTimerRef.current);
    };
  }, []);

  useEffect(() => {
    resetBoard(levelIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelIndex]);

  useEffect(() => {
    if (!clock.playing || !soundEnabled) return;
    speakKidPrompt(`Connect 1 to ${level.max}!`, { interrupt: false });
  }, [clock.playing, level.max, soundEnabled]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    draggingRef.current = false;
    setCursor(null);
    setCelebrating(true);
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "numbers_dots", Math.max(40, 100 - wrong * 8), wrong, levelIndex >= 2);
    }
    if (soundEnabled) speakKidPrompt("You found the hidden animal! Look how cute!", { interrupt: true });
    if (celebrateTimerRef.current) window.clearTimeout(celebrateTimerRef.current);
    celebrateTimerRef.current = window.setTimeout(() => {
      setCompleteOpen(true);
      celebrateTimerRef.current = null;
    }, 2600);
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const lastDot = level.dots.find((dot) => dot.n === connected) ?? level.dots[0];
  const nextDot = level.dots.find((dot) => dot.n === connected + 1);
  const foundAnimal = celebrating || completeOpen || connected >= level.max;
  const pathD = level.dots
    .filter((dot) => dot.n <= connected)
    .map((dot, index) => `${index === 0 ? "M" : "L"} ${dot.x} ${dot.y}`)
    .join(" ");

  const tryAdvance = (point: { x: number; y: number }) => {
    if (doneRef.current) return;
    const current = connectedRef.current;
    const upcoming = level.dots.find((dot) => dot.n === current + 1);
    if (!upcoming) return;
    const distance = Math.hypot(point.x - upcoming.x, point.y - upcoming.y);
    if (distance > 10) return;
    const next = current + 1;
    connectedRef.current = next;
    setConnected(next);
    const word = NUMBER_WORDS[next] ?? String(next);
    if (soundEnabled) speakKidPrompt(next >= level.max ? `${word}!` : word, { interrupt: true });
    if (next >= level.max) window.setTimeout(finish, 280);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!clock.playing || doneRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = toBoardPoint(svg, event.clientX, event.clientY);
    const start = Math.hypot(point.x - lastDot.x, point.y - lastDot.y);
    if (start > 10) {
      setWrong((count) => count + 1);
      if (soundEnabled) speakKidPrompt(`Start at ${connected}!`, { interrupt: true });
      return;
    }
    draggingRef.current = true;
    setCursor(point);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = toBoardPoint(svg, event.clientX, event.clientY);
    setCursor(point);
    tryAdvance(point);
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setCursor(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="ssm ndots">
      <NumbersMiniChrome
        mapTitle="Dots Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title={`Connect 1 to ${level.max}!`}
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        tried={connected > 1 || wrong > 0}
        wrong={wrong}
        extraHeader={<GamePauseButton onClick={() => setPaused(true)} />}
      >
        <div className="nmini-play">
          <p className="ssm-hint">Drag from one number to the next.</p>
          <div className="ndots-board">
            <svg
              ref={svgRef}
              className="ndots-svg"
              viewBox="0 0 100 100"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
            <HiddenAnimal kind={level.animal} complete={foundAnimal} />
            <path d={pathD} className="ndots-line" />
            {cursor && nextDot && (
              <line className="ndots-drag" x1={lastDot.x} y1={lastDot.y} x2={cursor.x} y2={cursor.y} />
            )}
            {level.dots.map((dot) => {
              const done = dot.n <= connected;
              const current = dot.n === connected && connected < level.max;
              return (
                <g key={dot.n} transform={`translate(${dot.x} ${dot.y})`}>
                  {current && <circle className="ndots-glow" r="10.5" />}
                  <circle className={done ? "ndots-node is-on" : "ndots-node"} r="8" />
                  <text className="ndots-num" textAnchor="middle" dy="2.4">
                    {dot.n}
                  </text>
                  {current && (
                    <text className="ndots-star" textAnchor="middle" dy="-11.5">
                      ★
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        </div>
        <NumbersGameFooter
          hidden={completeOpen || celebrating}
          message="Drag from one number to the next."
          detail={`Connected: ${connected}/${level.max}`}
          progress={connected}
          total={level.max}
          wrong={wrong}
        />
      </NumbersMiniChrome>

      <ColorConfetti active={celebrating && !completeOpen} />

      <GamePausePopup
        open={paused}
        subtitle="Keep your place. The dots will wait."
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
          subtitle={`You connected up to ${connected} of ${level.max}.`}
          buttons={[
            { label: "Replay Level", onClick: () => { resetBoard(levelIndex); clock.replayLevel(); } },
            { label: "Map", variant: "secondary", onClick: () => { clock.setTimeUpOpen(false); setMapOpen(true); } },
          ]}
        />
      </GameOverlay>
      <GameOverlay isOpen={completeOpen}>
        <GamePopup
          title="You found it!"
          subtitle={levelIndex >= 2 ? "You finished Connect the Dots!" : `${level.name} complete! Proceed to the next level?`}
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
