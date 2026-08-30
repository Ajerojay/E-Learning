import { useRef, useState, useEffect, useCallback } from "react";
import "./PhonicsQuestPage.css";
import { useNavigate } from "react-router-dom";
// ===== SUPABASE DATABASE CONNECTION: shared by web and AppPhonicsQuestPage =====
import { supabase } from "../../../lib/supabase";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { GameOverlay, GamePopup, Countdown } from "./GamePopup";
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
import bgMusic from "./bg-music-loop.mp3";
import { speakNative, cancelNativeSpeech } from "../../nativeTts";

const shuffleArray = (array: any[]) => {
  return [...array].sort(() => Math.random() - 0.5);
};

const animals = [
  { name: "cat", emoji: "ðŸ±" },
  { name: "dog", emoji: "ðŸ¶" },
  { name: "cow", emoji: "ðŸ®" },
  { name: "lion", emoji: "ðŸ¦" },
  { name: "chicken", emoji: "ðŸ”" },
];

const levels = [
  { answer: "cat", sound: catSound, image: cat },
  { answer: "dog", sound: dogSound, image: dog },
  { answer: "cow", sound: cowSound, image: cow },
  { answer: "chicken", sound: chickenSound, image: chicken },
  { answer: "lion", sound: rawrSound, image: lion },
];

const ANIMAL_SOUND_VOLUME = 0.35;
const PHONICS_LEVEL_TIME = 30;

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
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0);
  const [showNext, setShowNext] = useState(false);
  const [showNoPrompt, setShowNoPrompt] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(PHONICS_LEVEL_TIME);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);
  const [wrongThisLevel, setWrongThisLevel] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState("phonics_sound_match");
  // A new component mount (from Start Phonics Quest) is the only intro session.
  const playSession = 0;
  const [message, setMessage] = useState("Tap the sound and choose the animal!");
  const [wrongChoice, setWrongChoice] = useState<string | null>(null);
  const [isSoundAnimating, setIsSoundAnimating] = useState(false);
  const [choiceAnimating, setChoiceAnimating] = useState<string | null>(null);

  const [shuffledAnimals, setShuffledAnimals] = useState(animals);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const wrongChoiceTimerRef = useRef<number | null>(null);
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const currentLevel = levels[level];

  const startCountdown = useCallback(() => setCountdown(3), []);

  const { levelIntroActive, onLevelStart, startCountdownOnly, cancelIntro } =
    useLevelIntro({
      content: PHONICS_GAME_INTRO,
      soundEnabled,
      enabled: isLandscape && !showNext && !showNoPrompt && !timeUpOpen && !isFinished,
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
    const audio = new Audio(currentLevel.sound);
    audio.volume = ANIMAL_SOUND_VOLUME;
    audioRef.current = audio;
    audio.play().catch(() => {});
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

  useEffect(() => {
    setShuffledAnimals(shuffleArray(animals));
    setWrongChoice(null);
    setWrongThisLevel(0);
    setCountdown(null);
    setTimeLeft(PHONICS_LEVEL_TIME);
    setTimerRunning(false);
    setTimeUpOpen(false);
    warnedSecondsRef.current = new Set();
    onLevelStart();
  }, [level, onLevelStart]);

  useEffect(() => {
    if (!bgMusicRef.current) {
      const audio = new Audio(bgMusic);
      audio.loop = true;
      audio.volume = 0.25;
      bgMusicRef.current = audio;
      if (musicEnabled) {
        audio.play().catch(() => {});
      }
    }

    return () => {
      bgMusicRef.current?.pause();
    };
  }, []);

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
    const audio = bgMusicRef.current;
    if (!audio) return;
    if (musicEnabled) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [musicEnabled]);

  useEffect(() => {
    if (countdown === null || !isLandscape) return;
    if (showNext || showNoPrompt || timeUpOpen || isFinished) return;

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
  }, [countdown, showNext, showNoPrompt, timeUpOpen, isFinished, isLandscape]);

  useEffect(() => {
    if (!timerRunning || !isLandscape) return;
    if (countdown !== null) return;
    if (showNext || showNoPrompt || timeUpOpen || isFinished) return;

    if (timeLeft <= 0) {
      setTimerRunning(false);
      setTimeUpOpen(true);
      setMessage("Time's up!");
      const pct = Math.round((score / levels.length) * 100);
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
    score,
    wrong,
    isLandscape,
  ]);

  useEffect(() => {
    if (!timerRunning || !isLandscape) return;
    if (countdown !== null) return;
    if (showNext || showNoPrompt || timeUpOpen || isFinished) return;
    if (timeLeft > 5 || timeLeft <= 0) return;
    if (warnedSecondsRef.current.has(timeLeft)) return;

    warnedSecondsRef.current.add(timeLeft);
    sayKid(String(timeLeft));
    playKidBeep(timeLeft);
  }, [timerRunning, countdown, timeLeft, showNext, showNoPrompt, timeUpOpen, isFinished, soundEnabled, isLandscape]);

  useEffect(() => {
    const loadProgressContext = async () => {
      const id = await getOrCreateActiveChildId();
      setChildId(id);

      // ===== SUPABASE DATABASE: LOAD PHONICS CATEGORY AND GAME CODE =====
      const { data: phonicsCategory } = await supabase
        .from("learning_categories")
        .select("id")
        .eq("code", "phonics")
        .maybeSingle();

      if (!phonicsCategory?.id) return;

      const { data: games } = await supabase
        .from("learning_games")
        .select("game_code")
        .eq("category_id", phonicsCategory.id)
        .limit(1);

      if (games?.[0]?.game_code) {
        setGameCode(games[0].game_code);
      }
    };

    loadProgressContext();
  }, []);

  const saveProgress = async (score: number, finished: boolean, attempts: number) => {
    if (!childId) return;

    // ===== SUPABASE DATABASE: SAVE SCORE/ATTEMPT FOR PARENT PROGRESS =====
    await supabase.rpc("record_game_attempt", {
      p_child_id: childId,
      p_game_code: gameCode,
      p_score: score,
      p_wrong_attempts: attempts,
      p_finished: finished,
    });
  };

  const handleGuess = (animal: string) => {
    if (!isLandscape) return;
    if (levelIntroActive || countdown !== null || timeUpOpen) return;
    if (showNext || isFinished) return;

    setChoiceAnimating(animal);
    setTimeout(() => setChoiceAnimating(null), 600);

    if (animal === currentLevel.answer) {
      const nextScore = score + 1;
      const percent = Math.round((nextScore / levels.length) * 100);
      const finished = level === levels.length - 1;

      setScore(nextScore);
      setMessage(`Great job! You matched ${currentLevel.answer}!`);
      speakFeedback("Great job!");
      saveProgress(percent, finished, wrong);

      if (finished) {
        setTimerRunning(false);
        setIsFinished(true);
        setMessage("Amazing! You completed all phonics sound levels!");
        sayKid("Congratulations! Amazing work! You completed all phonics sound levels!");
      } else {
        setTimerRunning(false);
        setTimeout(() => setShowNext(true), 500);
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
      if (nextWrongThisLevel % 2 === 0) {
        speakFeedback(`The sound is ${currentLevel.answer}. Listen again.`);
        window.setTimeout(playSound, 900);
      } else {
        speakFeedback("Try again!");
      }
      const pct = Math.round((score / levels.length) * 100);
      void saveProgress(pct, false, nextWrong);
    }
  };

  const goNextLevel = () => {
    setLevel((l) => l + 1);
    setShowNext(false);
    setMessage("Tap the sound and choose the animal!");
  };

  const replayLevel = () => {
    setTimeUpOpen(false);
    setWrongThisLevel(0);
    setWrongChoice(null);
    cancelIntro();
    startCountdownOnly();
    setTimeLeft(PHONICS_LEVEL_TIME);
    setTimerRunning(true);
    warnedSecondsRef.current = new Set();
    setMessage("Tap the sound and choose the animal!");
    window.setTimeout(playSound, 250);
  };

  const handlePlayAgain = () => {
    // The full instruction belongs only to a fresh visit from
    // "Start Phonics Quest". Replays go straight to 3-2-1.
    cancelIntro();
    setWrong(0);
    setScore(0);
    setLevel(0);
    setShowNext(false);
    setShowNoPrompt(false);
    setIsFinished(false);
    setWrongChoice(null);
    setWrongThisLevel(0);
    setTimeUpOpen(false);
    setCountdown(null);
    setTimeLeft(PHONICS_LEVEL_TIME);
    setTimerRunning(false);
    warnedSecondsRef.current = new Set();
    setMessage("Tap the sound and choose the animal!");
    window.setTimeout(() => startCountdownOnly(), 120);
  };

  return (
    <div className="game-container phonics-bg-image phonics-page">
      <div className="pq-rotate-notice" role="status">
        <span className="pq-phone-icon" aria-hidden="true">ðŸ“±</span>
        <strong>Turn your phone sideways!</strong>
        <p>Phonics Quest is more fun in landscape mode.</p>
        <span className="pq-turn-arrow" aria-hidden="true">â†»</span>
      </div>

      <button className="pq-back-btn" onClick={() => navigate("/lesson/phonics", { replace: true })}>
        â† Back
      </button>

      <h2 className="pq-page-title">
  <span className="pq-main-title">
    Listen and match the sound!
  </span>

  <br />

   <div className="pq-meta-row">
    <span className="pq-level-pill">Level {level + 1}</span>
    <span className={`pq-timer-pill ${timeLeft <= 5 ? "pq-timer-pill--warning" : ""}`}>
      â± {timeLeft}s
    </span>
    <button
      type="button"
      className="pq-sound-toggle pq-music-toggle"
      onClick={() => setMusicEnabled((prev) => !prev)}
      aria-label={musicEnabled ? "Mute music" : "Unmute music"}
      title={musicEnabled ? "Mute Music" : "Unmute Music"}
    >
      {musicEnabled ? "ðŸŽµ" : "ðŸ”‡"}
    </button>
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
      {soundEnabled ? "ðŸ”Š" : "ðŸ”‡"}
    </button>
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
            ðŸ”Š
            <small>Tap me!</small>
          </button>
          <img
            src={currentLevel.image}
            className={`sound-guide-img ${isSoundAnimating ? "pq-pulse-animate" : ""}`}
            alt="Animal guide"
          />
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

      {/* âœ… PANEL WITH BUTTONS INSIDE */}
      {!isFinished && <div className="pq-panel">
        <p className="pq-message">{message}</p>
        <p className="pq-progress">
          Progress: {score}/{levels.length} | Wrong Attempts: {wrong}
        </p>
      </div>}

      {isFinished && (
        <div className="pq-finish-overlay">
          <GameOverlay isOpen={isFinished}>
            <GamePopup
              title="ðŸŽ‰ Amazing!"
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
              Progress: {score}/{levels.length} | Wrong Attempts: {wrong}
            </GamePopup>
          </GameOverlay>
        </div>
      )}

      {showNext && (
        <GameOverlay isOpen={showNext}>
          <GamePopup
            title="ðŸŽ‰ Awesome!"
            subtitle={`Level ${level + 1} complete! Proceed to Level ${level + 2}?`}
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
          levelIntroActive && !timeUpOpen && !showNext && !showNoPrompt && !isFinished
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

      {timeUpOpen && (
        <GameOverlay isOpen={timeUpOpen}>
          <GamePopup
            title="â° Time's up!"
            subtitle={`You matched ${score}/${levels.length} animals in Level ${level + 1}.`}
            buttons={[
              {
                label: "Back to Lesson",
                onClick: () => navigate("/lesson/phonics"),
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
            subtitle={`Progress: ${score}/${levels.length} | Wrong Attempts: ${wrong}`}
            buttons={[
              {
                label: "Back to Lesson",
                onClick: () => {
                  setShowNoPrompt(false);
                  navigate("/lesson/phonics");
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

