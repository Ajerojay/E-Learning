import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateActiveChildId } from "../../../../../../backend/childProgress";
import { recordGameProgressRpc } from "../../../../../../backend/gameProgressDb";
import { speakKidPrompt } from "../../../../nativeTts";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "../shared/GamePopup";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "../shared/questLevelMap";
import { playBalloonPopSound } from "./colorsMiniAudio";
import { ColorsMiniChrome, colorsNextLevelButtons, speakNextLevelPrompt } from "./ColorsMiniChrome";
import { useColorsMiniClock, useLandscapeLock } from "../shared/useColorsMiniClock";
import type { LevelIntroContent } from "../shared/levelIntro";
import bear from "../../images/bear-2.png";
import "./ColorsMiniGames.css";

type BalloonColor = "red" | "blue" | "yellow" | "green" | "orange";

type Balloon = {
  id: string;
  color: BalloonColor;
  left: number;
  duration: number;
  delay: number;
  popping?: boolean;
};

const INTRO: LevelIntroContent = {
  title: "Pop the balloons!",
  subtitle: "Tap only the color Bear asks for. Leave the other balloons alone.",
  speech: "Hi friend! Pop all the balloons that match the color I say. Do not tap the other colors. You can do it!",
  compact: true,
};

const LEVELS: Array<{
  name: string;
  goal: number;
  time: number;
  palette: BalloonColor[];
}> = [
  { name: "Level 1", goal: 5, time: 75, palette: ["red", "blue", "yellow"] },
  { name: "Level 2", goal: 7, time: 85, palette: ["red", "blue", "yellow", "green", "orange"] },
  { name: "Level 3", goal: 8, time: 95, palette: ["red", "blue", "yellow", "green", "orange"] },
];

const FILL: Record<BalloonColor, string> = {
  red: "#ff6b81",
  blue: "#4d9fff",
  yellow: "#ffd93d",
  green: "#62d26f",
  orange: "#ff9f43",
};

const BALLOON_LANES = Array.from({ length: 9 }, (_, index) => 4 + index * 10);

function shuffleLanes() {
  const lanes = [...BALLOON_LANES];
  for (let index = lanes.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [lanes[index], lanes[swap]] = [lanes[swap], lanes[index]];
  }
  return lanes;
}

function pickTargetColor(palette: BalloonColor[], previous?: BalloonColor): BalloonColor {
  const available = palette.filter((color) => color !== previous);
  const choices = available.length > 0 ? available : palette;
  return choices[Math.floor(Math.random() * choices.length)];
}

function BalloonGoalTrack({
  goal,
  popped,
  color,
}: {
  goal: number;
  popped: number;
  color: BalloonColor;
}) {
  return (
    <div
      className="cmini-balloon-track"
      role="img"
      aria-label={`${popped} of ${goal} ${color} balloons popped`}
    >
      {Array.from({ length: goal }, (_, index) => (
        <span
          key={index}
          className={`cmini-track-balloon${index < popped ? " is-popped" : ""}${index === popped - 1 ? " is-latest" : ""}`}
          style={{ ["--balloon" as string]: FILL[color] }}
        >
          <span className="cmini-track-body" />
          <span className="cmini-track-string" />
        </span>
      ))}
    </div>
  );
}

function makeBalloon(palette: BalloonColor[], left: number, bias?: BalloonColor): Balloon {
  const roll = Math.random();
  const color = bias && roll < 0.45 ? bias : palette[Math.floor(Math.random() * palette.length)];
  return {
    id: `${Date.now()}-${Math.random()}`,
    color,
    left,
    duration: 7 + Math.random() * 4,
    delay: Math.random() * 0.4,
  };
}

export default function ColorsBalloonPop({ mobileApp = false }: { mobileApp?: boolean }) {
  const navigate = useNavigate();
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("colors-balloons");
  const isLandscape = useLandscapeLock(mobileApp);
  const [levelIndex, setLevelIndex] = useState(0);
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [popped, setPopped] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [targetColor, setTargetColor] = useState(() => pickTargetColor(LEVELS[0].palette));
  const previousTargetRef = useRef(targetColor);
  const balloonLanesRef = useRef([...BALLOON_LANES]);
  const nextBalloonLaneRef = useRef(0);
  const doneRef = useRef(false);
  const poppingBalloonIdsRef = useRef(new Set<string>());
  const level = LEVELS[levelIndex];

  const clock = useColorsMiniClock({
    intro: INTRO,
    mapOpen,
    isLandscape,
    paused,
    blocked: completeOpen || gameOverOpen,
    timeLimit: level.time,
    levelIndex,
    soundEnabled,
  });
  useStarTimeUp(clock.timeUpOpen, levelIndex, popped > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  const resetBoard = useCallback((index: number) => {
    const next = LEVELS[index];
    const target = pickTargetColor(next.palette, previousTargetRef.current);
    previousTargetRef.current = target;
    const lanes = shuffleLanes();
    balloonLanesRef.current = lanes;
    nextBalloonLaneRef.current = 0;
    const initialBalloons = Array.from({ length: 6 }, (_, balloonIndex) =>
      makeBalloon(next.palette, lanes[balloonIndex], target)
    );
    doneRef.current = false;
    poppingBalloonIdsRef.current.clear();
    setLevelIndex(index);
    setPopped(0);
    setWrong(0);
    setPaused(false);
    setCompleteOpen(false); setGameOverOpen(false);
    setTargetColor(target);
    setBalloons(initialBalloons);
  }, []);

  useEffect(() => {
    if (!clock.playing || !soundEnabled) return;
    speakKidPrompt(`Pop all the ${targetColor} balloons.`, { interrupt: false });
  }, [clock.playing, soundEnabled, targetColor]);

  useEffect(() => {
    if (!clock.playing) return;
    const timer = window.setInterval(() => {
      const laneIndex = nextBalloonLaneRef.current % balloonLanesRef.current.length;
      nextBalloonLaneRef.current += 1;
      const balloon = makeBalloon(level.palette, balloonLanesRef.current[laneIndex], targetColor);
      setBalloons((current) => [...current.slice(-10), balloon]);
    }, 1400);
    return () => window.clearInterval(timer);
  }, [clock.playing, level.palette, targetColor]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCompleteOpen(true);
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "colors_balloons", Math.max(40, 100 - wrong * 8), wrong, levelIndex >= 2);
    }
    if (soundEnabled) speakNextLevelPrompt(true, levelIndex >= 2);
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong, clock.timeLeft]);

  const onPop = (balloon: Balloon) => {
    if (!clock.playing || doneRef.current || poppingBalloonIdsRef.current.has(balloon.id)) return;
    poppingBalloonIdsRef.current.add(balloon.id);
    playBalloonPopSound(soundEnabled);
    setBalloons((current) =>
      current.map((item) => item.id === balloon.id ? { ...item, popping: true } : item)
    );
    window.setTimeout(() => {
      poppingBalloonIdsRef.current.delete(balloon.id);
      setBalloons((current) => current.filter((item) => item.id !== balloon.id));
    }, 280);
    if (balloon.color !== targetColor) {
      setWrong((count) => count + 1);
      if (soundEnabled) speakKidPrompt("Oops, not that color.", { interrupt: true });
      return;
    }
    setPopped((count) => {
      const next = count + 1;
      if (next >= level.goal) window.setTimeout(finish, 320);
      return next;
    });
  };

  return (
    <div className="colors-page cmini cmini--sky">
      <ColorsMiniChrome
        mapTitle="Balloon Pop Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title={
          <>
            <span className="cmini-title-balloon" style={{ background: FILL[targetColor] }} />
            Pop the{" "}
            <span style={{ color: FILL[targetColor] }}>{targetColor}</span>
            {" "}balloons!
          </>
        }
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        rotateLabel="Balloon Pop"
        mobileApp={mobileApp}
        isLandscape={isLandscape}
        tried={popped > 0 || wrong > 0}
        wrong={wrong}
        extraHeader={<GamePauseButton onClick={() => setPaused(true)} />}
      >
        <BalloonGoalTrack goal={level.goal} popped={popped} color={targetColor} />
        <img className="cmini-bear" src={bear} alt="" />
        <div className="cmini-sky">
          {balloons.map((balloon) => (
            <button
              key={balloon.id}
              data-idle-answer={balloon.color === targetColor && !balloon.popping ? "true" : undefined}
              type="button"
              className={`cmini-balloon${balloon.popping ? " is-popping" : ""}`}
              style={{
                left: `${balloon.left}%`,
                animationDuration: `${balloon.duration}s`,
                animationDelay: `${balloon.delay}s`,
                animationPlayState: clock.playing ? "running" : "paused",
              }}
              onClick={() => onPop(balloon)}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) {
                  setBalloons((current) => current.filter((item) => item.id !== balloon.id));
                }
              }}
              aria-label={`${balloon.color} balloon`}
            >
              <span className="cmini-balloon-body" style={{ background: FILL[balloon.color] }} />
              <span className="cmini-balloon-string" />
            </button>
          ))}
        </div>
        {!completeOpen && (
          <div className="cq-panel">
            <p className="cq-message">
              Pop the{" "}
              <span style={{ color: FILL[targetColor] }}>{targetColor}</span>
              {" "}balloons!
            </p>
            <p className="cq-score">
              {popped >= level.goal ? "All the balloons!" : "Fill the balloons!"} · Oops: {wrong}
            </p>
          </div>
        )}
      </ColorsMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="Take a breath, then keep popping."
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
          subtitle={`You popped ${popped}/${level.goal} goal balloons.`}
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
          subtitle={levelIndex >= 2 ? "You finished Balloon Pop!" : `${level.name} complete! Proceed to the next level?`}
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
