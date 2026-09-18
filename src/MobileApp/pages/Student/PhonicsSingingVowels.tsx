import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { recordGameProgressRpc } from "../../../lib/gameProgressDb";
import { speakKidPrompt, cancelNativeSpeech } from "../../nativeTts";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { PhonicsGameFooter, PhonicsMiniChrome, phonicsNextLevelButtons } from "./PhonicsMiniChrome";
import { useColorsMiniClock } from "./useColorsMiniClock";
import type { LevelIntroContent } from "./levelIntro";
import bear from "./images/bear-3.png";
import birdA from "./images/vowels/a.png";
import birdE from "./images/vowels/e.png";
import birdI from "./images/vowels/i.png";
import birdO from "./images/vowels/o.png";
import birdU from "./images/vowels/u.png";
import branchArt from "./images/vowels/branch.png";
import "./PhonicsMiniGames.css";

import ah1 from "./sounds/vowels/ah-1.mp3";
import ah2 from "./sounds/vowels/ah-2.mp3";
import ah4 from "./sounds/vowels/ah-4.mp3";
import eh1 from "./sounds/vowels/eh-1.mp3";
import eh2 from "./sounds/vowels/eh-2.mp3";
import eh4 from "./sounds/vowels/eh-4.mp3";
import ih1 from "./sounds/vowels/ih-1.mp3";
import ih2 from "./sounds/vowels/ih-2.mp3";
import ih4 from "./sounds/vowels/ih-4.mp3";
import oh1 from "./sounds/vowels/oh-1.mp3";
import oh2 from "./sounds/vowels/oh-2.mp3";
import oh4 from "./sounds/vowels/oh-4.mp3";
import uh1 from "./sounds/vowels/uh-1.mp3";
import uh2 from "./sounds/vowels/uh-2.mp3";
import uh4 from "./sounds/vowels/uh-4.mp3";
import wholeVowels from "./sounds/vowels/whole-vowels.mp3";

type VowelLetter = "A" | "E" | "I" | "O" | "U";

type VowelBird = {
  letter: VowelLetter;
  song: string;
  spoken: string;
  art: string;
};

const BIRDS: VowelBird[] = [
  { letter: "A", song: "Ah, ah, ah", spoken: "ah", art: birdA },
  { letter: "E", song: "Eh, eh, eh", spoken: "eh", art: birdE },
  { letter: "I", song: "Ih, ih, ih", spoken: "ih", art: birdI },
  { letter: "O", song: "Oh, oh, oh", spoken: "oh", art: birdO },
  { letter: "U", song: "Uh, uh, uh", spoken: "uh", art: birdU },
];

const DEMO_CUES: { letter: VowelLetter; start: number }[] = [
  { letter: "A", start: 0 },
  { letter: "E", start: 0.68 },
  { letter: "I", start: 1.22 },
  { letter: "O", start: 1.72 },
  { letter: "U", start: 2.24 },
];

const DEMO_FALLBACK_MS = 3200;

function demoLetterAt(timeSec: number): VowelLetter {
  let letter: VowelLetter = DEMO_CUES[0].letter;
  for (const cue of DEMO_CUES) {
    if (timeSec >= cue.start) letter = cue.letter;
  }
  return letter;
}

const VOWEL_CLIPS: Record<VowelLetter, string[]> = {
  A: [ah1, ah2, ah4],
  E: [eh1, eh2, eh4],
  I: [ih1, ih2, ih4],
  O: [oh1, oh2, oh4],
  U: [uh1, uh2, uh4],
};

const LEVELS = [
  { name: "Level 1", rounds: 3, time: 50, shuffle: false },
  { name: "Level 2", rounds: 4, time: 55, shuffle: false },
  { name: "Level 3", rounds: 5, time: 60, shuffle: true },
];

const INTRO: LevelIntroContent = {
  title: "The Singing Vowels!",
  subtitle: "First listen to A E I O U. Then find the bird that sings the sound Bear asks for.",
  speech: "First we sing all the vowels together. Then find the bird that makes the sound I ask for!",
  compact: true,
};

function shuffle<T>(list: T[]): T[] {
  return [...list].sort(() => Math.random() - 0.5);
}

function pickVowelClip(letter: VowelLetter) {
  const clips = VOWEL_CLIPS[letter];
  return clips[Math.floor(Math.random() * clips.length)];
}

function makeTargets(count: number) {
  const picks: VowelBird[] = [];
  while (picks.length < count) {
    const next = BIRDS[Math.floor(Math.random() * BIRDS.length)];
    if (picks[picks.length - 1]?.letter === next.letter) continue;
    picks.push(next);
  }
  return picks;
}

export default function PhonicsSingingVowels() {
  const navigate = useNavigate();
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("phonics-vowels");
  const [levelIndex, setLevelIndex] = useState(0);
  const [targets, setTargets] = useState(() => makeTargets(LEVELS[0].rounds));
  const [round, setRound] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [message, setMessage] = useState("Sing with the vowels!");
  const [singing, setSinging] = useState<string | null>(null);
  const [wrongBird, setWrongBird] = useState<string | null>(null);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [demoDone, setDemoDone] = useState(false);
  const [order, setOrder] = useState<VowelBird[]>(BIRDS);
  const doneRef = useRef(false);
  const busyRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playIdRef = useRef(0);
  const highlightTimers = useRef<number[]>([]);
  const promptTimerRef = useRef(0);
  const level = LEVELS[levelIndex];
  const target = targets[Math.min(round, Math.max(0, targets.length - 1))];

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

  const askFor = useCallback((bird: VowelBird) => {
    return `Find the ${bird.spoken} sound!`;
  }, []);

  const stopClip = useCallback(() => {
    playIdRef.current += 1;
    window.clearTimeout(promptTimerRef.current);
    highlightTimers.current.forEach((id) => window.clearTimeout(id));
    highlightTimers.current = [];
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    cancelNativeSpeech();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const playClip = useCallback((src: string, gainValue = 1) => {
    return new Promise<void>((resolve) => {
      playIdRef.current += 1;
      if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch { /* already stopped */ }
        sourceRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.ontimeupdate = null;
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      cancelNativeSpeech();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (!soundEnabled) {
        resolve();
        return;
      }
      const playId = playIdRef.current;
      const finish = () => {
        if (playId !== playIdRef.current) return;
        if (audioRef.current) audioRef.current = null;
        if (sourceRef.current) sourceRef.current = null;
        resolve();
      };

      const playPlain = () => {
        const audio = new Audio(src);
        audio.volume = 1;
        audioRef.current = audio;
        audio.onended = finish;
        audio.onerror = finish;
        audio.play().catch(finish);
      };

      if (gainValue <= 1) {
        playPlain();
        return;
      }

      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        playPlain();
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
          gain.connect(ctx.destination);
          sourceRef.current = source;
          source.onended = finish;
          source.start();
        } catch {
          if (playId !== playIdRef.current) return;
          playPlain();
        }
      })();
    });
  }, [soundEnabled]);

  const promptFindSound = useCallback((bird: VowelBird) => {
    const text = askFor(bird);
    setMessage(text);
    window.clearTimeout(promptTimerRef.current);
    if (!soundEnabled) return Promise.resolve();
    const clip = pickVowelClip(bird.letter);
    busyRef.current = true;
    speakKidPrompt("Find the", { interrupt: true, rate: 0.92, pitch: 1.28 });
    return new Promise<void>((resolve) => {
      promptTimerRef.current = window.setTimeout(() => {
        void playClip(clip, 4.2).then(() => {
          speakKidPrompt("sound!", { interrupt: true, rate: 0.92, pitch: 1.28 });
          promptTimerRef.current = window.setTimeout(() => {
            busyRef.current = false;
            resolve();
          }, 800);
        });
      }, 900);
    });
  }, [askFor, playClip, soundEnabled]);

  const resetBoard = useCallback((index: number) => {
    const next = LEVELS[index];
    doneRef.current = false;
    busyRef.current = false;
    stopClip();
    setLevelIndex(index);
    setTargets(makeTargets(next.rounds));
    setRound(0);
    setWrong(0);
    setPaused(false);
    setCompleteOpen(false);
    setGameOverOpen(false);
    setSinging(null);
    setWrongBird(null);
    setDemoPlaying(false);
    setDemoDone(false);
    setOrder(next.shuffle ? shuffle(BIRDS) : BIRDS);
    setMessage("Sing with the vowels!");
  }, [stopClip]);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  useEffect(() => {
    if (!soundEnabled) stopClip();
  }, [soundEnabled, stopClip]);

  useEffect(() => () => stopClip(), [stopClip]);

  useEffect(() => {
    if (!clock.playing || demoDone) return;
    let cancelled = false;
    const highlightAt = (letter: VowelLetter | null) => {
      if (!cancelled) setSinging(letter);
    };

    const finishDemo = () => {
      if (cancelled) return;
      busyRef.current = false;
      setDemoPlaying(false);
      setSinging(null);
      setDemoDone(true);
    };

    busyRef.current = true;
    setDemoPlaying(true);
    setMessage("Sing A, E, I, O, U!");
    highlightAt("A");

    const runTimedHighlight = () => {
      DEMO_CUES.forEach((cue) => {
        const timer = window.setTimeout(() => highlightAt(cue.letter), cue.start * 1000);
        highlightTimers.current.push(timer);
      });
    };

    if (!soundEnabled) {
      runTimedHighlight();
      const doneTimer = window.setTimeout(finishDemo, DEMO_FALLBACK_MS);
      highlightTimers.current.push(doneTimer);
      return () => {
        cancelled = true;
        stopClip();
      };
    }

    const audio = new Audio(wholeVowels);
    audio.volume = 0.55;
    audioRef.current = audio;
    let raf = 0;
    const tick = () => {
      if (cancelled || audioRef.current !== audio) return;
      highlightAt(demoLetterAt(audio.currentTime));
      raf = window.requestAnimationFrame(tick);
    };
    audio.onplay = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(tick);
    };
    audio.ontimeupdate = () => {
      if (cancelled || audioRef.current !== audio) return;
      highlightAt(demoLetterAt(audio.currentTime));
    };
    audio.onended = () => {
      window.cancelAnimationFrame(raf);
      finishDemo();
    };
    audio.onerror = () => {
      window.cancelAnimationFrame(raf);
      finishDemo();
    };
    audio.play().catch(() => {
      window.cancelAnimationFrame(raf);
      runTimedHighlight();
      const doneTimer = window.setTimeout(finishDemo, DEMO_FALLBACK_MS);
      highlightTimers.current.push(doneTimer);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      stopClip();
    };
  }, [clock.playing, demoDone, soundEnabled, stopClip]);

  useEffect(() => {
    if (!clock.playing || !demoDone || !target) return;
    promptFindSound(target);
  }, [clock.playing, demoDone, promptFindSound, target]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCompleteOpen(true);
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "phonics_vowels", Math.max(40, 100 - wrong * 8), wrong, levelIndex >= 2);
    }
    if (soundEnabled && levelIndex >= 2) speakKidPrompt("Beautiful singing! Level complete!", { interrupt: true });
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const onTapBird = (bird: VowelBird) => {
    if (!clock.playing || completeOpen || gameOverOpen || doneRef.current || busyRef.current || demoPlaying || !demoDone) return;
    setSinging(bird.letter);
    window.setTimeout(() => setSinging((current) => (current === bird.letter ? null : current)), 900);

    if (bird.letter === target.letter) {
      const nextRound = round + 1;
      busyRef.current = true;
      void playClip(pickVowelClip(bird.letter)).then(() => {
        if (nextRound >= level.rounds) {
          setMessage("Awesome!");
          window.setTimeout(finish, 250);
          return;
        }
        busyRef.current = false;
        setRound(nextRound);
      });
      return;
    }

    setWrong((count) => count + 1);
    setWrongBird(bird.letter);
    setMessage("Oops! Try again.");
    busyRef.current = true;
    window.setTimeout(() => setWrongBird((current) => (current === bird.letter ? null : current)), 700);
    if (!soundEnabled) {
      window.setTimeout(() => {
        setMessage(askFor(target));
        busyRef.current = false;
      }, 700);
      return;
    }
    speakKidPrompt("Oops! Try again!", { interrupt: true, rate: 0.95, pitch: 1.28 });
    window.clearTimeout(promptTimerRef.current);
    promptTimerRef.current = window.setTimeout(() => {
      void promptFindSound(target);
    }, 1400);
  };

  return (
    <div className="ssm pmini pvowel">
      <PhonicsMiniChrome
        mapTitle="Vowel Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title={demoPlaying || !demoDone ? "Sing A E I O U!" : target ? askFor(target) : "The Singing Vowels"}
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
        <div className="pvowel-stage">
          <div className="pvowel-branch" aria-label="Vowel birds">
            <img className="pvowel-twig-art" src={branchArt} alt="" draggable={false} />
            <div className="pvowel-birds">
            {order.map((bird, index) => (
              <button
                key={bird.letter}
                type="button"
                className={`pvowel-bird${singing === bird.letter ? " is-singing" : ""}${demoPlaying && singing === bird.letter ? " is-demo" : ""}${wrongBird === bird.letter ? " is-wrong" : ""}`}
                style={{ animationDelay: `${index * 80}ms` }}
                onClick={() => onTapBird(bird)}
                aria-label={`${bird.letter}, ${bird.song}`}
              >
                <img src={bird.art} alt="" draggable={false} />
              </button>
            ))}
            </div>
          </div>
          <div className="pvowel-bear-row">
            <img className="pvowel-bear" src={bear} alt="" />
            {singing && <span className="pvowel-notes" aria-hidden="true">♪ ♫ ♪</span>}
          </div>
        </div>
      </PhonicsMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="The birds can wait a moment."
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
      <GameOverlay isOpen={completeOpen && !gameOverOpen}>
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
            onNo: () => { setCompleteOpen(false); setMapOpen(true); },
            onGames: () => navigate("/quest/phonics"),
          })}
        />
      </GameOverlay>
    </div>
  );
}
