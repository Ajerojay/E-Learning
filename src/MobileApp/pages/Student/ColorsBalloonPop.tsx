import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { recordGameProgressRpc } from "../../../lib/gameProgressDb";
import { speakKidPrompt } from "../../nativeTts";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { playBalloonPopSound } from "./colorsMiniAudio";
import { ColorsMiniChrome, colorsNextLevelButtons, speakNextLevelPrompt } from "./ColorsMiniChrome";
import { useColorsMiniClock, useLandscapeLock } from "./useColorsMiniClock";
import type { LevelIntroContent } from "./levelIntro";
import bear from "./images/bear-2.png";
import "./ColorsMiniGames.css";

type BalloonColor = "red" | "blue" | "yellow" | "green" | "orange";

type Balloon = {
  id: string;
  color: BalloonColor;
  left: number;
  duration: number;
  delay: number;
};

const INTRO: LevelIntroContent = {
  title: "Pop the balloons!",
  subtitle: "Tap only the color Bear asks for. Leave the other balloons alone.",
  speech: "Hi friend! Pop all the balloons that match the color I say. Do not tap the other colors. You can do it!",
  compact: true,
};

const LEVELS: Array<{
  name: string;
  target: BalloonColor;
  goal: number;
  time: number;
  palette: BalloonColor[];
  prompt: string;
}> = [
  { name: "Level 1", target: "blue", goal: 5, time: 40, palette: ["red", "blue", "yellow"], prompt: "Pop all the blue balloons!" },
  { name: "Level 2", target: "green", goal: 7, time: 45, palette: ["red", "blue", "yellow", "green", "orange"], prompt: "Pop all the green balloons!" },
  { name: "Level 3", target: "red", goal: 8, time: 50, palette: ["red", "blue", "yellow", "green", "orange"], prompt: "Pop all the red balloons!" },
];

const FILL: Record<BalloonColor, string> = {
  red: "#ff6b81",
  blue: "#4d9fff",
  yellow: "#ffd93d",
  green: "#62d26f",
  orange: "#ff9f43",
};

function makeBalloon(palette: BalloonColor[], bias?: BalloonColor): Balloon {
  const roll = Math.random();
  const color = bias && roll < 0.45 ? bias : palette[Math.floor(Math.random() * palette.length)];
  return {
    id: `${Date.now()}-${Math.random()}`,
    color,
    left: 10 + Math.random() * 72,
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
  const doneRef = useRef(false);
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
    doneRef.current = false;
    setLevelIndex(index);
    setPopped(0);
    setWrong(0);
    setPaused(false);
    setCompleteOpen(false); setGameOverOpen(false);
    setBalloons(Array.from({ length: 6 }, () => makeBalloon(next.palette, next.target)));
  }, []);

  useEffect(() => {
    if (!clock.playing || !soundEnabled) return;
    speakKidPrompt(level.prompt, { interrupt: false });
  }, [clock.playing, level.prompt, soundEnabled]);

  useEffect(() => {
    if (!clock.playing) return;
    const timer = window.setInterval(() => {
      setBalloons((current) => [...current.slice(-10), makeBalloon(level.palette, level.target)]);
    }, 1400);
    return () => window.clearInterval(timer);
  }, [clock.playing, level.palette, level.target]);

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
    if (!clock.playing || doneRef.current) return;
    playBalloonPopSound(soundEnabled);
    setBalloons((current) => current.filter((item) => item.id !== balloon.id));
    if (balloon.color !== level.target) {
      setWrong((count) => count + 1);
      if (soundEnabled) speakKidPrompt("Oops, not that color.", { interrupt: true });
      return;
    }
    setPopped((count) => {
      const next = count + 1;
      if (next >= level.goal) window.setTimeout(finish, 200);
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
        title={level.prompt}
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
        <p className="cmini-progress">
          {popped}/{level.goal}
        </p>
        <img className="cmini-bear" src={bear} alt="" />
        <div className="cmini-sky">
          {balloons.map((balloon) => (
            <button
              key={balloon.id}
              type="button"
              className="cmini-balloon"
              style={{
                left: `${balloon.left}%`,
                animationDuration: `${balloon.duration}s`,
                animationDelay: `${balloon.delay}s`,
                animationPlayState: clock.playing ? "running" : "paused",
              }}
              onClick={() => onPop(balloon)}
              onAnimationEnd={() => setBalloons((current) => current.filter((item) => item.id !== balloon.id))}
              aria-label={`${balloon.color} balloon`}
            >
              <span className="cmini-balloon-body" style={{ background: FILL[balloon.color] }} />
              <span className="cmini-balloon-string" />
            </button>
          ))}
        </div>
        {!completeOpen && (
          <div className="cq-panel">
            <p className="cq-message">Pop only the {level.target} balloons!</p>
            <p className="cq-score">
              Progress: {popped}/{level.goal} | Wrong Attempts: {wrong}
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
          subtitle={`You popped ${popped}/${level.goal} ${level.target} balloons.`}
          buttons={[
            { label: "Replay Level", onClick: () => { resetBoard(levelIndex); clock.replayLevel(); } },
            { label: "Map", variant: "secondary", onClick: () => { clock.setTimeUpOpen(false); setMapOpen(true); } },
          ]}
        />
      </GameOverlay>
      <GameOverlay isOpen={completeOpen}>
        <GamePopup
          title="Awesome!"
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
