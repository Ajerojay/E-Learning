import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { recordGameProgressRpc } from "../../../lib/gameProgressDb";
import { isMobileApp } from "../../isMobileApp";
import { speakKidPrompt, cancelNativeSpeech } from "../../nativeTts";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { PhonicsGameFooter, PhonicsMiniChrome, phonicsNextLevelButtons } from "./PhonicsMiniChrome";
import { useColorsMiniClock } from "./useColorsMiniClock";
import type { LevelIntroContent } from "./levelIntro";
import bear from "./images/bear-3.png";
import "./PhonicsMiniGames.css";

import promptA from "./sounds/begin/a-apple.mp3";
import letterA from "./sounds/begin/a.mp3";
import promptB from "./sounds/begin/b-ball.mp3";
import letterB from "./sounds/begin/b.mp3";
import promptC from "./sounds/begin/c-cat.mp3";
import letterC from "./sounds/begin/c.mp3";
import promptD from "./sounds/begin/d-dog.mp3";
import letterD from "./sounds/begin/d.mp3";
import promptF from "./sounds/begin/f-fish.mp3";
import letterF from "./sounds/begin/f.mp3";
import promptH from "./sounds/begin/h-hat.mp3";
import letterH from "./sounds/begin/h.mp3";
import promptL from "./sounds/begin/l-leaf.mp3";
import letterL from "./sounds/begin/l.mp3";
import promptM from "./sounds/begin/m-moon.mp3";
import letterM from "./sounds/begin/m.mp3";
import promptP from "./sounds/begin/p-pig.mp3";
import letterP from "./sounds/begin/p.mp3";
import promptR from "./sounds/begin/r-rainbow.mp3";
import letterR from "./sounds/begin/r.mp3";
import promptS from "./sounds/begin/s-sun.mp3";
import letterS from "./sounds/begin/s.mp3";
import promptT from "./sounds/begin/t-tree.mp3";
import letterT from "./sounds/begin/t.mp3";

type SoundItem = {
  word: string;
  letter: string;
  stretch: string;
  sound: string;
  emoji: string;
  promptClip: string;
  letterClip: string;
  letterGain?: number;
};

const ITEMS: SoundItem[] = [
  { word: "sun", letter: "S", stretch: "Ssss-un", sound: "Ssss", emoji: "☀️", promptClip: promptS, letterClip: letterS, letterGain: 9 },
  { word: "moon", letter: "M", stretch: "Mmm-oon", sound: "Mmm", emoji: "🌙", promptClip: promptM, letterClip: letterM },
  { word: "tree", letter: "T", stretch: "Tuh-ree", sound: "Tuh", emoji: "🌳", promptClip: promptT, letterClip: letterT },
  { word: "apple", letter: "A", stretch: "Aaa-pple", sound: "Aaa", emoji: "🍎", promptClip: promptA, letterClip: letterA },
  { word: "ball", letter: "B", stretch: "Buh-all", sound: "Buh", emoji: "⚽", promptClip: promptB, letterClip: letterB },
  { word: "cat", letter: "C", stretch: "Cuh-at", sound: "Cuh", emoji: "🐱", promptClip: promptC, letterClip: letterC },
  { word: "dog", letter: "D", stretch: "Duh-og", sound: "Duh", emoji: "🐶", promptClip: promptD, letterClip: letterD },
  { word: "fish", letter: "F", stretch: "Ffff-ish", sound: "Ffff", emoji: "🐟", promptClip: promptF, letterClip: letterF },
  { word: "hat", letter: "H", stretch: "Huh-at", sound: "Huh", emoji: "🎩", promptClip: promptH, letterClip: letterH },
  { word: "leaf", letter: "L", stretch: "Llll-eaf", sound: "Llll", emoji: "🍃", promptClip: promptL, letterClip: letterL },
  { word: "pig", letter: "P", stretch: "Puh-ig", sound: "Puh", emoji: "🐷", promptClip: promptP, letterClip: letterP },
  { word: "rainbow", letter: "R", stretch: "Rrrr-ainbow", sound: "Rrrr", emoji: "🌈", promptClip: promptR, letterClip: letterR },
];

const LEVELS = [
  { name: "Level 1", rounds: 3, time: 45, choices: 3 },
  { name: "Level 2", rounds: 4, time: 50, choices: 5 },
  { name: "Level 3", rounds: 5, time: 55, choices: 6 },
];

const INTRO: LevelIntroContent = {
  title: "Beginning Sounds!",
  subtitle: "Look at the picture, hear the first sound, then tap the matching letter.",
  speech: "Look at the picture. Listen to the first sound, then tap the letter that makes that sound. You can do it!",
  compact: true,
};

const LETTER_COLORS = ["#8fd3ff", "#ffe38a", "#c8f0b8", "#ffc4e0", "#d4c4ff", "#ffd0a8"];

function shuffle<T>(list: T[]): T[] {
  return [...list].sort(() => Math.random() - 0.5);
}

function makeChoices(letter: string, count: number): string[] {
  const others = ITEMS.map((item) => item.letter).filter((value, index, all) => all.indexOf(value) === index && value !== letter);
  return shuffle([letter, ...shuffle(others).slice(0, Math.max(1, count - 1))]);
}

function dealExclusivePacks(): SoundItem[][] {
  const shuffled = shuffle(ITEMS);
  let offset = 0;
  return LEVELS.map((level) => {
    const pack = shuffled.slice(offset, offset + level.rounds);
    offset += level.rounds;
    return pack;
  });
}

function makeQueueFromPack(pack: SoundItem[], choiceCount: number) {
  return shuffle(pack).map((item) => ({
    ...item,
    choices: makeChoices(item.letter, choiceCount),
  }));
}

export default function PhonicsBeginningSounds() {
  const navigate = useNavigate();
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("phonics-begin");
  const [levelIndex, setLevelIndex] = useState(0);
  const packsRef = useRef(dealExclusivePacks());
  const [queue, setQueue] = useState(() => makeQueueFromPack(packsRef.current[0], LEVELS[0].choices));
  const [round, setRound] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [message, setMessage] = useState("What letter makes the first sound?");
  const [wrongChoice, setWrongChoice] = useState<string | null>(null);
  const doneRef = useRef(false);
  const busyRef = useRef(false);
  const praiseTimerRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playIdRef = useRef(0);
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

  const stopClip = useCallback(() => {
    playIdRef.current += 1;
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    cancelNativeSpeech();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const playClip = useCallback((src: string, gainValue = 1) => {
    if (!soundEnabled) return;
    stopClip();
    const playId = playIdRef.current;
    if (gainValue <= 1) {
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.play().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.play().catch(() => {});
      return;
    }
    const ctx = audioCtxRef.current ?? new Ctx();
    audioCtxRef.current = ctx;
    void (async () => {
      try {
        if (ctx.state === "suspended") await ctx.resume();
        const response = await fetch(src);
        const data = await response.arrayBuffer();
        if (playId !== playIdRef.current) return;
        const buffer = await ctx.decodeAudioData(data.slice(0));
        if (playId !== playIdRef.current) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = gainValue;
        source.buffer = buffer;
        source.connect(gain);
        if (gainValue >= 6) {
          const shelf = ctx.createBiquadFilter();
          shelf.type = "highshelf";
          shelf.frequency.value = 4000;
          shelf.gain.value = 10;
          gain.connect(shelf);
          shelf.connect(ctx.destination);
        } else {
          gain.connect(ctx.destination);
        }
        sourceRef.current = source;
        source.onended = () => {
          if (sourceRef.current === source) sourceRef.current = null;
        };
        source.start();
      } catch {
        if (playId !== playIdRef.current) return;
        const audio = new Audio(src);
        audioRef.current = audio;
        audio.play().catch(() => {});
      }
    })();
  }, [soundEnabled, stopClip]);

  const playPrompt = useCallback((next: SoundItem) => {
    playClip(next.promptClip);
  }, [playClip]);

  const playLetterSound = useCallback((next: SoundItem) => {
    playClip(next.letterClip, next.letterGain ?? 1);
  }, [playClip]);

  const resetBoard = useCallback((index: number) => {
    doneRef.current = false;
    busyRef.current = false;
    window.clearTimeout(praiseTimerRef.current);
    if (index === 0) packsRef.current = dealExclusivePacks();
    setLevelIndex(index);
    const pack = packsRef.current[index] ?? packsRef.current[0];
    setQueue(makeQueueFromPack(pack, LEVELS[index]?.choices ?? LEVELS[0].choices));
    setRound(0);
    setWrong(0);
    setPaused(false);
    setCompleteOpen(false); setGameOverOpen(false);
    setWrongChoice(null);
    setMessage("What letter makes the first sound?");
  }, []);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  useEffect(() => {
    if (!clock.playing || !soundEnabled || !item) return;
    playPrompt(item);
    setMessage(`${item.stretch}. What letter makes the ${item.sound} sound?`);
  }, [clock.playing, item, playPrompt, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) stopClip();
  }, [soundEnabled, stopClip]);

  useEffect(() => () => {
    window.clearTimeout(praiseTimerRef.current);
    stopClip();
  }, [stopClip]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCompleteOpen(true);
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "phonics_begin", Math.max(40, 100 - wrong * 8), wrong, levelIndex >= 2);
    }
    if (soundEnabled && levelIndex >= 2) speakKidPrompt("Great listening! Level complete!", { interrupt: true });
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const onPick = (letter: string) => {
    if (!clock.playing || completeOpen || doneRef.current || busyRef.current) return;
    if (letter === item.letter) {
      const nextRound = round + 1;
      const last = nextRound >= level.rounds;
      const praise = last ? "Awesome!" : ["Great job!", "Yes! That's it!", "You got it!"][nextRound % 3];
      setWrongChoice(null);
      setMessage(praise);
      busyRef.current = true;
      if (soundEnabled) speakKidPrompt(praise, { interrupt: true, rate: 0.95, pitch: 1.28 });
      window.clearTimeout(praiseTimerRef.current);
      praiseTimerRef.current = window.setTimeout(() => {
        if (last) {
          finish();
          return;
        }
        busyRef.current = false;
        setRound(nextRound);
      }, soundEnabled ? 1100 : 350);
      return;
    }
    setWrong((count) => count + 1);
    setWrongChoice(letter);
    setMessage("Oops! Listen again.");
    if (soundEnabled) playLetterSound(item);
    window.setTimeout(() => setWrongChoice(null), 650);
  };

  return (
    <div className={`ssm pmini pbegin${isMobileApp() ? " pmini--app" : ""}`}>
      <PhonicsMiniChrome
        mapTitle="Letter Sounds Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title={item ? `${item.stretch}!` : "Beginning Sounds"}
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
            <PhonicsGameFooter
              message={message}
              progress={Math.min(round, level.rounds)}
              total={level.rounds}
              wrong={wrong}
            />
          ) : null
        }
      >
        {item && (
          <div className="pbegin-stage">
            <div className="pbegin-card">
              <button
                type="button"
                className="pbegin-object"
                onClick={() => playLetterSound(item)}
                aria-label={`Hear ${item.word}`}
              >
                <span className="pbegin-emoji">{item.emoji}</span>
                <small>{item.word}</small>
              </button>
              <button
                type="button"
                className="pbegin-replay"
                onClick={() => playLetterSound(item)}
                aria-label="Play the beginning sound again"
              >
                <span aria-hidden="true">🔊</span>
                <small>Again</small>
              </button>
            </div>
            <div className={`pbegin-letters${item.choices.length > 3 ? " pbegin-letters--many" : ""}`}>
              {item.choices.map((letter, index) => (
                <button
                  key={`${item.word}-${letter}`}
                  type="button"
                  className={`pbegin-letter${wrongChoice === letter ? " is-wrong" : ""}`}
                  style={{ background: LETTER_COLORS[index % LETTER_COLORS.length] }}
                  onClick={() => onPick(letter)}
                  aria-label={`Letter ${letter}`}
                >
                  <span>{letter}</span>
                </button>
              ))}
            </div>
            <img className="pbegin-bear" src={bear} alt="" />
          </div>
        )}
      </PhonicsMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="Ready to listen for more sounds?"
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />
      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/phonics")}
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
          subtitle={
            levelIndex >= 2
              ? `Progress: ${level.rounds}/${level.rounds} | Wrong Attempts: ${wrong}`
              : `Proceed to the next level? Progress: ${level.rounds}/${level.rounds} | Wrong Attempts: ${wrong}`
          }
          buttons={phonicsNextLevelButtons({
            levelIndex,
            lastIndex: 2,
            onYes: () => resetBoard(levelIndex + 1),
            onNo: () => { setCompleteOpen(false); setGameOverOpen(false); setMapOpen(true); },
            onGames: () => navigate("/quest/phonics"),
          })}
        />
      </GameOverlay>
    </div>
  );
}
