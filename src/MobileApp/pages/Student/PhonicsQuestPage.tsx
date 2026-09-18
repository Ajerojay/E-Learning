import { useRef, useState, useEffect, useCallback } from "react";
import "./PhonicsQuestPage.css";
import "../../WebView/AppPhonicsQuestPage.css";
import { useNavigate } from "react-router-dom";
// ===== SUPABASE DATABASE CONNECTION: shared by web and AppPhonicsQuestPage =====
import { recordGameProgressRpc, loadPrimaryGameCodeForCategory } from "../../../lib/gameProgressDb";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { GameOverlay, GamePopup, Countdown, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import {
  useLevelIntro,
  LevelIntroOverlay,
  COUNTDOWN_READY_SUBTITLE,
} from "./levelIntro";

import lion from "../../../img/lion-.png";
import cat from "../../../img/cat-arrow.png";
import dog from "../../../img/dog-arrow.png";
import cow from "../../../img/cow-arrow.png";
import chicken from "../../../img/chicken-arrow.png";

import rawrSound from "../../../img/lion-sound.mp3";
import catSound from "../../../img/cat-meow.mp3";
import dogSound from "../../../img/dog-bark.mp3";
import cowSound from "../../../img/cow-moo.mp3";
import chickenSound from "../../../img/chicken-sound.mp3";
import { speakNative, cancelNativeSpeech } from "../../nativeTts";
import QuestLevelSelect from "./QuestLevelSelect";
import ChildMusicToggle from "./ChildMusicToggle";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { LiveStarHud } from "./LevelStars";

type SoundAnimal = {
  name: string;
  emoji: string;
  fileSound?: string;
  voiceSound?: string;
  image?: string;
};

const shuffleArray = <T,>(array: T[]): T[] => {
  return [...array].sort(() => Math.random() - 0.5);
};

const ANIMALS: SoundAnimal[] = [
  { name: "cat", emoji: "🐱", fileSound: catSound, image: cat },
  { name: "dog", emoji: "🐶", fileSound: dogSound, image: dog },
  { name: "cow", emoji: "🐮", fileSound: cowSound, image: cow },
  { name: "chicken", emoji: "🐔", fileSound: chickenSound, image: chicken },
  { name: "lion", emoji: "🦁", fileSound: rawrSound, image: lion },
  { name: "pig", emoji: "🐷", voiceSound: "oink oink" },
  { name: "duck", emoji: "🦆", voiceSound: "quack quack" },
  { name: "sheep", emoji: "🐑", voiceSound: "baa baa" },
  { name: "horse", emoji: "🐴", voiceSound: "neigh" },
  { name: "frog", emoji: "🐸", voiceSound: "ribbit ribbit" },
  { name: "bird", emoji: "🐦", voiceSound: "tweet tweet" },
  { name: "owl", emoji: "🦉", voiceSound: "hoot hoot" },
];

const LEVEL_CONFIG = [
  { pages: 3, choices: 3, time: 40, animals: ["cat", "dog", "cow"] },
  { pages: 4, choices: 4, time: 50, animals: ["chicken", "lion", "pig", "duck"] },
  { pages: 5, choices: 5, time: 60, animals: ["sheep", "horse", "frog", "bird", "owl"] },
] as const;

function animalsByName(names: readonly string[]): SoundAnimal[] {
  return names.map((name) => {
    const animal = ANIMALS.find((item) => item.name === name);
    if (!animal) throw new Error(`Missing phonics animal: ${name}`);
    return animal;
  });
}

function buildLevelRound(levelIndex: number) {
  const config = LEVEL_CONFIG[levelIndex] ?? LEVEL_CONFIG[0];
  const pool = animalsByName(config.animals);
  return {
    pool,
    pages: shuffleArray(pool).slice(0, config.pages),
    config,
  };
}

const ANIMAL_SOUND_VOLUME = 0.35;

const PHONICS_GAME_INTRO = {
  title: "Listen!",
  subtitle: "Tap the sound and choose the matching animal!",
  speech: "Tap the sound and choose the matching animal!",
  displayMs: 4000,
};

type PhonicsQuestPageProps = {
  mobileApp?: boolean;
};

export default function Level1Sound({ mobileApp = false }: PhonicsQuestPageProps) {
  const navigate = useNavigate();
  const [isLandscape, setIsLandscape] = useState(
    () => !mobileApp || window.matchMedia("(orientation: landscape)").matches
  );

  const [wrong, setWrong] = useState(0);
  const [pageScore, setPageScore] = useState(0);
  const [levelIndex, setLevelIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [round, setRound] = useState(() => buildLevelRound(0));
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("phonics");
  const [showNext, setShowNext] = useState(false);
  const [showNoPrompt, setShowNoPrompt] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(LEVEL_CONFIG[0].time);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  useStarTimeUp(timeUpOpen, levelIndex, pageScore > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    setGameOverOpen(true);
    setTimerRunning(false);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);
  const [wrongThisLevel, setWrongThisLevel] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [paused, setPaused] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState("phonics_sound_match");
  // A new component mount (from Start Phonics Quest) is the only intro session.
  const playSession = 0;
  const [message, setMessage] = useState("Tap the sound and choose the animal!");
  const [wrongChoice, setWrongChoice] = useState<string | null>(null);
  const [isSoundAnimating, setIsSoundAnimating] = useState(false);
  const [choiceAnimating, setChoiceAnimating] = useState<string | null>(null);

  const [shuffledAnimals, setShuffledAnimals] = useState<SoundAnimal[]>(() => round.pool);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const wrongChoiceTimerRef = useRef<number | null>(null);
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const advancingRef = useRef(false);
  const currentAnimal = round.pages[pageIndex] ?? round.pages[0];
  const currentAnimalRef = useRef(currentAnimal);
  currentAnimalRef.current = currentAnimal;
  const pageCount = round.config.pages;

  const startCountdown = useCallback(() => setCountdown(3), []);

  const { levelIntroActive, onLevelStart, startCountdownOnly, cancelIntro } =
    useLevelIntro({
      content: PHONICS_GAME_INTRO,
      soundEnabled,
      enabled: isLandscape && !mapOpen && !showNext && !showNoPrompt && !timeUpOpen && !isFinished,
      sessionKey: playSession,
      onStartCountdown: startCountdown,
    });

  const playSound = () => {
    if (!soundEnabled || !isLandscape) return;
    setIsSoundAnimating(true);
    setTimeout(() => setIsSoundAnimating(false), 600);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    cancelNativeSpeech();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const animal = currentAnimalRef.current;
    if (animal.fileSound) {
      const audio = new Audio(animal.fileSound);
      audio.volume = ANIMAL_SOUND_VOLUME;
      audioRef.current = audio;
      audio.play().catch(() => {});
      return;
    }
    if (animal.voiceSound) {
      speakNative(animal.voiceSound, { interrupt: true, rate: 0.9, pitch: 1.2 });
    }
  };

  const sayKid = (text: string) => {
    try {
      if (!soundEnabled) return;
      if (speakNative(text, { interrupt: true, rate: 1, pitch: 1.35 })) return;
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1;
      utterance.pitch = 1.25;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore speech errors
    }
  };

  const speakFeedback = (text: string) => {
    try {
      if (!soundEnabled) return;
      if (speakNative(text, { rate: 1.05, pitch: 1.35 })) return;
      if (!("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((v) =>
          /(female|girl|kid|child|zira|samantha|jenny)/i.test(v.name)
        ) || voices[0];

      if (voice) {
        utterance.voice = voice;
      }

      utterance.rate = 1;
      utterance.pitch = 1.4;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore feedback errors
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
      // ignore audio errors
    }
  };

  useEffect(() => {
    if (!mobileApp) {
      setIsLandscape(true);
      return;
    }

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

  useEffect(() => {
    if (!isLandscape) {
      audioRef.current?.pause();
      bgMusicRef.current?.pause();
      window.speechSynthesis?.cancel();
      cancelNativeSpeech();
      return;
    }
    if (musicEnabled) bgMusicRef.current?.play().catch(() => {});
  }, [isLandscape, musicEnabled]);

  const startLevel = useCallback((index: number) => {
    const next = buildLevelRound(index);
    setLevelIndex(index);
    setPageIndex(0);
    setPageScore(0);
    setRound(next);
    setShuffledAnimals(shuffleArray(next.pool));
    setWrongChoice(null);
    setWrongThisLevel(0);
    setShowNext(false);
    setShowNoPrompt(false);
    setIsFinished(false);
    setCountdown(null);
    setTimeLeft(next.config.time);
    setTimerRunning(false);
    setTimeUpOpen(false);
    setGameOverOpen(false);
    warnedSecondsRef.current = new Set();
    setMessage("Tap the sound and choose the animal!");
    advancingRef.current = false;
  }, []);

  useEffect(() => {
    setShuffledAnimals(shuffleArray(round.pool));
    setWrongChoice(null);
  }, [pageIndex, round]);

  useEffect(() => {
    if (!mapOpen) onLevelStart();
  }, [levelIndex, onLevelStart, mapOpen]);

  useEffect(() => {
    if (levelIntroActive) setTimerRunning(false);
  }, [levelIntroActive]);

  useEffect(() => {
    return () => {
      if (wrongChoiceTimerRef.current !== null) {
        window.clearTimeout(wrongChoiceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (countdown === null || !isLandscape || mapOpen) return;
    if (showNext || showNoPrompt || timeUpOpen || isFinished || paused) return;

    setTimerRunning(false);
    if (countdown <= 0) {
      setCountdown(null);
      setTimerRunning(true);
      sayKid("Go!");
      playKidBeep(0);
      playSound();
      return;
    }

    const voiceTimer = window.setTimeout(() => {
      sayKid(String(countdown));
      playKidBeep(countdown);
    }, 0);
    const nextTimer = window.setTimeout(
      () => setCountdown((p) => (p === null ? null : p - 1)),
      850
    );
    return () => {
      window.clearTimeout(voiceTimer);
      window.clearTimeout(nextTimer);
    };
  }, [countdown, showNext, showNoPrompt, timeUpOpen, isFinished, isLandscape, mapOpen]);

  useEffect(() => {
    if (!timerRunning || !isLandscape || mapOpen) return;
    if (countdown !== null) return;
    if (showNext || showNoPrompt || timeUpOpen || isFinished || paused) return;

    if (timeLeft <= 0) {
      setTimerRunning(false);
      setTimeUpOpen(true);
      setMessage("Time's up!");
      const pct = Math.round((pageScore / pageCount) * 100);
      void saveProgress(pct, false, wrong);
      return;
    }

    const t = window.setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => window.clearTimeout(t);
  }, [
    timerRunning,
    countdown,
    timeLeft,
    showNext,
    showNoPrompt,
    timeUpOpen,
    isFinished,
    pageScore,
    pageCount,
    wrong,
    isLandscape,
    mapOpen,
    paused,
  ]);

  useEffect(() => {
    if (!timerRunning || !isLandscape || mapOpen) return;
    if (countdown !== null) return;
    if (showNext || showNoPrompt || timeUpOpen || isFinished || paused) return;
    if (timeLeft > 5 || timeLeft <= 0) return;
    if (warnedSecondsRef.current.has(timeLeft)) return;

    warnedSecondsRef.current.add(timeLeft);
    sayKid(String(timeLeft));
    playKidBeep(timeLeft);
  }, [timerRunning, countdown, timeLeft, showNext, showNoPrompt, timeUpOpen, isFinished, soundEnabled, isLandscape, mapOpen]);

  useEffect(() => {
    const loadProgressContext = async () => {
      const id = await getOrCreateActiveChildId();
      setChildId(id);

      // ===== SUPABASE DATABASE: LOAD PHONICS CATEGORY AND GAME CODE =====
      const primaryGameCode = await loadPrimaryGameCodeForCategory("phonics");
      if (primaryGameCode) setGameCode(primaryGameCode);
    };

    loadProgressContext();
  }, []);

  const saveProgress = async (score: number, finished: boolean, attempts: number) => {
    if (!childId) return;

    // ===== SUPABASE DATABASE: SAVE SCORE/ATTEMPT FOR PARENT PROGRESS =====
    await recordGameProgressRpc(childId, gameCode, score, attempts, finished);
  };

  const handleGuess = (animal: string) => {
    if (!isLandscape) return;
    if (levelIntroActive || countdown !== null || timeUpOpen || gameOverOpen || paused) return;
    if (showNext || isFinished || advancingRef.current) return;

    setChoiceAnimating(animal);
    setTimeout(() => setChoiceAnimating(null), 600);

    if (animal === currentAnimal.name) {
      const nextScore = pageScore + 1;
      const percent = Math.round((nextScore / pageCount) * 100);
      const lastPage = pageIndex >= pageCount - 1;

      setPageScore(nextScore);
      setMessage("Great job!");
      speakFeedback("Great job!");
      saveProgress(percent, lastPage && levelIndex >= 2, wrong);

      if (lastPage) {
        advancingRef.current = true;
        setTimerRunning(false);
        void completeLevel(levelIndex, { timeLeft, wrongAttempts: wrong });
        if (levelIndex >= LEVEL_CONFIG.length - 1) {
          setIsFinished(true);
          setMessage("Amazing! You completed all phonics sound levels!");
          sayKid("Congratulations! Amazing work!");
        } else {
          window.setTimeout(() => setShowNext(true), 500);
        }
      } else {
        advancingRef.current = true;
        window.setTimeout(() => {
          setPageIndex((current) => current + 1);
          setMessage("Tap the sound and choose the animal!");
          advancingRef.current = false;
          window.setTimeout(playSound, 280);
        }, 650);
      }
    } else {
      const nextWrong = wrong + 1;
      const nextWrongThisLevel = wrongThisLevel + 1;
      setWrong(nextWrong);
      setWrongThisLevel(nextWrongThisLevel);
      setWrongChoice(animal);
      if (wrongChoiceTimerRef.current !== null) {
        window.clearTimeout(wrongChoiceTimerRef.current);
      }
      wrongChoiceTimerRef.current = window.setTimeout(() => {
        setWrongChoice(null);
        wrongChoiceTimerRef.current = null;
      }, 650);
      setMessage("Oops! Try again!");
      speakFeedback("Oops! Try again. Listen again.");
      window.setTimeout(playSound, 700);
      const pct = Math.round((pageScore / pageCount) * 100);
      void saveProgress(pct, false, nextWrong);
    }
  };

  const goNextLevel = () => {
    startLevel(levelIndex + 1);
    setShowNext(false);
  };

  const replayLevel = () => {
    startLevel(levelIndex);
    setTimeUpOpen(false);
    cancelIntro();
    startCountdownOnly();
    window.setTimeout(playSound, 250);
  };

  const handlePlayAgain = () => {
    cancelIntro();
    setWrong(0);
    startLevel(0);
    setShowNext(false);
    setShowNoPrompt(false);
    setIsFinished(false);
    window.setTimeout(() => startCountdownOnly(), 120);
  };

  return (
    <div className="game-container phonics-bg-image phonics-page">
      {mapOpen && (
        <QuestLevelSelect
          title="Sound Quest"
          unlockedCount={unlockedCount}
          levelStars={levelStars}
          onSelectLevel={(index) => {
            startLevel(index);
            setMapOpen(false);
          }}
          onBack={() => navigate("/quest/phonics", { replace: true })}
        />
      )}
      <div className="pq-rotate-notice" role="status">
        <span className="pq-phone-icon" aria-hidden="true">📱</span>
        <strong>Turn your phone sideways!</strong>
        <p>Phonics Quest is more fun in landscape mode.</p>
        <span className="pq-turn-arrow" aria-hidden="true">↻</span>
      </div>

      <button className="pq-back-btn" onClick={() => setMapOpen(true)}>
        {"\u2190"} Map
      </button>

      <h2 className="pq-page-title">
  <span className="pq-main-title">
    Listen and match the sound!
  </span>

  <br />

   <div className="pq-meta-row">
    <span className="pq-level-pill">Level {levelIndex + 1}</span>
    <LiveStarHud timeLeft={timeLeft} tried={pageScore > 0 || wrong > 0} wrong={wrong} />
    <span className={`pq-timer-pill ${timeLeft <= 5 ? "pq-timer-pill--warning" : ""}`}>
      ⏱ {timeLeft}s
    </span>
    <ChildMusicToggle />
    <button
      type="button"
      className="pq-sound-toggle pq-effects-toggle"
      onClick={() => {
        setSoundEnabled((prev) => {
          const next = !prev;
          if (!next && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            cancelNativeSpeech();
          }
          return next;
        });
      }}
      aria-label={soundEnabled ? "Mute sound" : "Unmute sound"}
      title={soundEnabled ? "Mute Sound" : "Unmute Sound"}
    >
      {soundEnabled ? "🔊" : "🔇"}
    </button>
    <GamePauseButton onClick={() => setPaused(true)} />
  </div>
  
</h2> 

      <div className="sound-area">
        <div className="sound-circle-wrapper">
          <button
            type="button"
            className={`sound-circle ${isSoundAnimating ? "pq-pulse-animate" : ""}`}
            onClick={playSound}
            aria-label="Play the animal sound"
          >
            <span className="pq-sound-icon" aria-hidden="true">{"\uD83D\uDD0A"}</span>
            <small>Tap me!</small>
          </button>
          {currentAnimal.image ? (
            <img
              src={currentAnimal.image}
              className={`sound-guide-img ${isSoundAnimating ? "pq-pulse-animate" : ""}`}
              alt=""
            />
          ) : (
            <span
              className={`sound-guide-emoji ${isSoundAnimating ? "pq-pulse-animate" : ""}`}
              aria-hidden="true"
            >
              {currentAnimal.emoji}
            </span>
          )}
        </div>

        <div className="choices">
          {shuffledAnimals.map((a) => (
            <button
              key={a.name}
              className={`choice-btn choice-btn-${a.name} ${
                wrongChoice === a.name ? "choice-btn-wrong" : ""
              } ${choiceAnimating === a.name ? "pq-pulse-animate" : ""}`}
              onClick={() => handleGuess(a.name)}
              aria-label={`Choose ${a.name}`}
            >
              <span>{a.emoji}</span>
              <small>{a.name}</small>
            </button>
          ))}
        </div>
      </div>

      {/* ✅ PANEL WITH BUTTONS INSIDE */}
      {!isFinished && <div className="pq-panel">
        <p className="pq-message">{message}</p>
        <p className="pq-progress">
          Progress: {pageScore}/{pageCount} | Wrong Attempts: {wrong}
        </p>
      </div>}

      {isFinished && (
        <div className="pq-finish-overlay">
          <GameOverlay isOpen={isFinished}>
            <GamePopup
              title="🎉 Amazing!"
              subtitle="You completed all phonics sound levels!"
              buttons={[
                {
                  label: "Play Again",
                  onClick: handlePlayAgain,
                },
                {
                  label: "View Progress",
                  onClick: () => navigate("/parent-progress"),
                  variant: "yes",
                },
              ]}
            >
              Progress: {pageScore}/{pageCount} | Wrong Attempts: {wrong}
            </GamePopup>
          </GameOverlay>
        </div>
      )}

      {showNext && (
        <GameOverlay isOpen={showNext}>
          <GamePopup
            title="🎉 Awesome!"
            subtitle={`Level ${levelIndex + 1} complete! Proceed to Level ${levelIndex + 2}?`}
            buttons={[
              {
                label: "Yes",
                onClick: goNextLevel,
                variant: "yes",
              },
              {
                label: "No",
                onClick: () => {
                  setShowNext(false);
                  setShowNoPrompt(true);
                },
                variant: "no",
              },
            ]}
          />
        </GameOverlay>
      )}

      <LevelIntroOverlay
        isOpen={
          levelIntroActive && !mapOpen && !timeUpOpen && !showNext && !showNoPrompt && !isFinished
        }
        content={PHONICS_GAME_INTRO}
      />

      {countdown !== null && !timeUpOpen && !showNext && !showNoPrompt && !isFinished && (
        <GameOverlay isOpen={countdown !== null}>
          <GamePopup
            title={<Countdown value={countdown} />}
            subtitle={COUNTDOWN_READY_SUBTITLE}
          />
        </GameOverlay>
      )}

      <GamePausePopup
        open={paused}
        subtitle="Ready to listen for more sounds?"
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />

      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/phonics")}
        onReplay={() => startLevel(levelIndex)}
      />
      {timeUpOpen && !gameOverOpen && (
        <GameOverlay isOpen={timeUpOpen}>
          <GamePopup
            title="⏰ Time's up!"
            subtitle={`You matched ${pageScore}/${pageCount} sounds in Level ${levelIndex + 1}.`}
            buttons={[
              {
                label: "Games",
                onClick: () => navigate("/quest/phonics"),
              },
              {
                label: "Replay Level",
                onClick: replayLevel,
                variant: "secondary",
              },
            ]}
          />
        </GameOverlay>
      )}

      {showNoPrompt && (
        <GameOverlay isOpen={showNoPrompt}>
          <GamePopup
            title="Keep playing?"
            subtitle={`Progress: ${pageScore}/${pageCount} | Wrong Attempts: ${wrong}`}
            buttons={[
              {
                label: "Games",
                onClick: () => {
                  setShowNoPrompt(false);
                  navigate("/quest/phonics");
                },
                variant: "secondary",
              },
              {
                label: "Replay Level",
                onClick: () => {
                  setShowNoPrompt(false);
                  handlePlayAgain();
                },
                variant: "yes",
              },
            ]}
          />
        </GameOverlay>
      )}

    </div>
  );
}

