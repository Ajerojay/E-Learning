import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { recordGameProgressRpc } from "../../../lib/gameProgressDb";
import { speakKidPrompt } from "../../nativeTts";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { LogicGameFooter, LogicMiniChrome, logicNextLevelButtons } from "./LogicMiniChrome";
import { useColorsMiniClock } from "./useColorsMiniClock";
import type { LevelIntroContent } from "./levelIntro";
import "./LogicMiniGames.css";

type OddItem = { id: string; emoji: string; label: string };

type OddSet = {
  odd: OddItem;
  mates: OddItem[];
};

const SETS: OddSet[] = [
  {
    odd: { id: "shoe", emoji: "👟", label: "shoe" },
    mates: [
      { id: "apple", emoji: "🍎", label: "apple" },
      { id: "banana", emoji: "🍌", label: "banana" },
      { id: "grapes", emoji: "🍇", label: "grapes" },
      { id: "orange", emoji: "🍊", label: "orange" },
      { id: "strawberry", emoji: "🍓", label: "strawberry" },
      { id: "watermelon", emoji: "🍉", label: "watermelon" },
      { id: "pear", emoji: "🍐", label: "pear" },
    ],
  },
  {
    odd: { id: "chair", emoji: "🪑", label: "chair" },
    mates: [
      { id: "cat", emoji: "🐱", label: "cat" },
      { id: "dog", emoji: "🐶", label: "dog" },
      { id: "rabbit", emoji: "🐰", label: "rabbit" },
      { id: "hamster", emoji: "🐹", label: "hamster" },
      { id: "cow", emoji: "🐮", label: "cow" },
      { id: "pig", emoji: "🐷", label: "pig" },
      { id: "sheep", emoji: "🐑", label: "sheep" },
    ],
  },
  {
    odd: { id: "apple", emoji: "🍎", label: "apple" },
    mates: [
      { id: "car", emoji: "🚗", label: "car" },
      { id: "bus", emoji: "🚌", label: "bus" },
      { id: "bike", emoji: "🚲", label: "bike" },
      { id: "train", emoji: "🚂", label: "train" },
      { id: "boat", emoji: "⛵", label: "boat" },
      { id: "plane", emoji: "✈️", label: "plane" },
      { id: "truck", emoji: "🚚", label: "truck" },
    ],
  },
  {
    odd: { id: "sock", emoji: "🧦", label: "sock" },
    mates: [
      { id: "sun", emoji: "☀️", label: "sun" },
      { id: "moon", emoji: "🌙", label: "moon" },
      { id: "star", emoji: "⭐", label: "star" },
      { id: "cloud", emoji: "☁️", label: "cloud" },
      { id: "rainbow", emoji: "🌈", label: "rainbow" },
      { id: "lightning", emoji: "⚡", label: "lightning" },
      { id: "comet", emoji: "☄️", label: "comet" },
    ],
  },
  {
    odd: { id: "banana", emoji: "🍌", label: "banana" },
    mates: [
      { id: "shirt", emoji: "👕", label: "shirt" },
      { id: "pants", emoji: "👖", label: "pants" },
      { id: "hat", emoji: "🎩", label: "hat" },
      { id: "dress", emoji: "👗", label: "dress" },
      { id: "coat", emoji: "🧥", label: "coat" },
      { id: "boot", emoji: "👢", label: "boot" },
      { id: "glove", emoji: "🧤", label: "glove" },
    ],
  },
  {
    odd: { id: "cat", emoji: "🐱", label: "cat" },
    mates: [
      { id: "circle", emoji: "🔵", label: "circle" },
      { id: "square", emoji: "🟥", label: "square" },
      { id: "triangle", emoji: "🔺", label: "triangle" },
      { id: "heart", emoji: "💚", label: "heart" },
      { id: "diamond", emoji: "🔶", label: "diamond" },
      { id: "starshape", emoji: "⭐", label: "star" },
      { id: "oval", emoji: "🥚", label: "oval" },
    ],
  },
  {
    odd: { id: "ball", emoji: "⚽", label: "ball" },
    mates: [
      { id: "spoon", emoji: "🥄", label: "spoon" },
      { id: "fork", emoji: "🍴", label: "fork" },
      { id: "plate", emoji: "🍽️", label: "plate" },
      { id: "cup", emoji: "🥤", label: "cup" },
      { id: "bowl", emoji: "🥣", label: "bowl" },
      { id: "knife", emoji: "🔪", label: "knife" },
      { id: "glass", emoji: "🥛", label: "glass" },
    ],
  },
  {
    odd: { id: "plane", emoji: "✈️", label: "plane" },
    mates: [
      { id: "cow2", emoji: "🐮", label: "cow" },
      { id: "pig2", emoji: "🐷", label: "pig" },
      { id: "sheep2", emoji: "🐑", label: "sheep" },
      { id: "chicken", emoji: "🐔", label: "chicken" },
      { id: "horse", emoji: "🐴", label: "horse" },
      { id: "duck", emoji: "🦆", label: "duck" },
      { id: "goat", emoji: "🐐", label: "goat" },
    ],
  },
  {
    odd: { id: "icecream", emoji: "🍦", label: "ice cream" },
    mates: [
      { id: "hammer", emoji: "🔨", label: "hammer" },
      { id: "wrench", emoji: "🔧", label: "wrench" },
      { id: "screwdriver", emoji: "🪛", label: "screwdriver" },
      { id: "saw", emoji: "🪚", label: "saw" },
      { id: "drill", emoji: "🔩", label: "bolt" },
      { id: "pliers", emoji: "🛠️", label: "tools" },
      { id: "axe", emoji: "🪓", label: "axe" },
    ],
  },
];

const LEVELS = [
  { name: "Level 1", rounds: 3, time: 45, choices: 4 },
  { name: "Level 2", rounds: 4, time: 50, choices: 6 },
  { name: "Level 3", rounds: 5, time: 55, choices: 8 },
];

const INTRO: LevelIntroContent = {
  title: "Which one doesn't belong?",
  subtitle: "Some pictures go together. Tap the one that is different.",
  speech: "Which one doesn't belong? Look at the pictures and tap the one that is different.",
  compact: true,
};

const PRAISE = [
  "Good job!",
  "Yes! That's right!",
  "Nice work!",
  "You found it!",
  "Great thinking!",
];

function shuffle<T>(list: T[]): T[] {
  return [...list].sort(() => Math.random() - 0.5);
}

function makeQueue(index: number) {
  const level = LEVELS[index] ?? LEVELS[0];
  const count = Math.max(2, level.choices);
  return shuffle(SETS).slice(0, level.rounds).map((set) => {
    const mates = shuffle(set.mates).slice(0, count - 1);
    return {
      oddId: set.odd.id,
      items: shuffle([...mates, set.odd]),
    };
  });
}

export default function LogicOddOneOut() {
  const navigate = useNavigate();
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("logic-odd");
  const [levelIndex, setLevelIndex] = useState(0);
  const [queue, setQueue] = useState(() => makeQueue(0));
  const [round, setRound] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [message, setMessage] = useState("Tap the one that doesn't belong.");
  const [wrongChoice, setWrongChoice] = useState<string | null>(null);
  const [rightChoice, setRightChoice] = useState<string | null>(null);
  const doneRef = useRef(false);
  const level = LEVELS[levelIndex];
  const item = queue[Math.min(round, Math.max(0, queue.length - 1))];

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
  useStarTimeUp(clock.timeUpOpen, levelIndex, round > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  const resetBoard = useCallback((index: number) => {
    doneRef.current = false;
    setLevelIndex(index);
    setQueue(makeQueue(index));
    setRound(0);
    setWrong(0);
    setPaused(false);
    setCompleteOpen(false); setGameOverOpen(false);
    setWrongChoice(null);
    setRightChoice(null);
    setMessage("Tap the one that doesn't belong.");
  }, []);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  useEffect(() => {
    if (!clock.playing || !soundEnabled) return;
    speakKidPrompt("Which one doesn't belong?", { interrupt: true, rate: 0.9 });
  }, [clock.playing, soundEnabled, round, levelIndex]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCompleteOpen(true);
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "logic_odd", Math.max(40, 100 - wrong * 8), wrong, levelIndex >= 2);
    }
    if (soundEnabled) speakKidPrompt("Great thinking! Level complete!", { interrupt: true });
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const onPick = (choiceId: string) => {
    if (mapOpen || paused || completeOpen || gameOverOpen || doneRef.current || rightChoice) return;
    if (clock.levelIntroActive || clock.countdown !== null || clock.timeUpOpen) return;
    if (choiceId === item.oddId) {
      setWrongChoice(null);
      setRightChoice(choiceId);
      const nextRound = round + 1;
      const praise = PRAISE[round % PRAISE.length];
      const done = nextRound >= level.rounds;
      setMessage(done ? "Awesome! You found them all!" : praise);
      if (soundEnabled) {
        speakKidPrompt(done ? "Good job! You found them all!" : praise, { interrupt: true });
      }
      if (done) {
        setRound(nextRound);
        window.setTimeout(finish, 900);
        return;
      }
      window.setTimeout(() => {
        setRound(nextRound);
        setRightChoice(null);
        setMessage("Tap the one that doesn't belong.");
      }, 900);
      return;
    }
    setWrong((count) => count + 1);
    setWrongChoice(choiceId);
    setMessage("Oops! Try again.");
    if (soundEnabled) speakKidPrompt("Oops! Try the one that doesn't belong.", { interrupt: true });
    window.setTimeout(() => setWrongChoice(null), 550);
  };

  return (
    <div className="ssm pmini lmini lmini--odd">
      <LogicMiniChrome
        mapTitle="Odd One Out Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title="Which one doesn't belong?"
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        tried={round > 0 || wrong > 0}
        wrong={wrong}
        extraHeader={<GamePauseButton onClick={() => setPaused(true)} />}
        footer={
          !completeOpen ? (
            <LogicGameFooter
              message={message}
              progress={Math.min(round, level.rounds)}
              total={level.rounds}
              wrong={wrong}
            />
          ) : null
        }
      >
        {item && (
          <div className="lodd-stage">
            <div className={`lodd-grid lodd-grid--n${item.items.length}`}>
              {item.items.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={`lodd-card${wrongChoice === choice.id ? " is-wrong" : ""}${rightChoice === choice.id ? " is-right" : ""}`}
                  onClick={() => onPick(choice.id)}
                  aria-label={choice.label}
                >
                  <span aria-hidden="true">{choice.emoji}</span>
                  <small>{choice.label}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </LogicMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="Ready to find the odd one out?"
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />
      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/logic")}
        onReplay={() => { resetBoard(levelIndex); clock.replayLevel(); }}
      />
      <GameOverlay isOpen={clock.timeUpOpen && !gameOverOpen}>
        <GamePopup
          title="Time's up!"
          subtitle={`Progress: ${Math.min(round, level.rounds)}/${level.rounds} | Wrong Attempts: ${wrong}`}
          buttons={[
            { label: "Replay Level", onClick: () => { resetBoard(levelIndex); clock.replayLevel(); } },
            { label: "Map", variant: "secondary", onClick: () => { clock.setTimeUpOpen(false); setMapOpen(true); } },
          ]}
        />
      </GameOverlay>
      <GameOverlay isOpen={completeOpen}>
        <GamePopup
          title="Awesome!"
          subtitle={`Progress: ${level.rounds}/${level.rounds} | Wrong Attempts: ${wrong}`}
          buttons={logicNextLevelButtons({
            levelIndex,
            lastIndex: 2,
            onYes: () => resetBoard(levelIndex + 1),
            onNo: () => { setCompleteOpen(false); setGameOverOpen(false); setMapOpen(true); },
            onGames: () => navigate("/quest/logic"),
          })}
        />
      </GameOverlay>
    </div>
  );
}
