import { useRef, useState, useEffect } from "react";
import "./PhonicsQuestPage.css";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getOrCreateActiveChildId } from "../lib/childProgress";
import { GameOverlay, GamePopup, Countdown } from "./GamePopup";

import lion from "../img/lion-.png";
import cat from "../img/cat-arrow.png";
import dog from "../img/dog-arrow.png";
import cow from "../img/cow-arrow.png";
import chicken from "../img/chicken-arrow.png";

import rawrSound from "../img/lion-sound.mp3";
import catSound from "../img/cat-meow.mp3";
import dogSound from "../img/dog-bark.mp3";
import cowSound from "../img/cow-moo.mp3";
import chickenSound from "../img/chicken-sound.mp3";
import bgMusic from "./bg-music-loop.mp3";

const shuffleArray = (array: any[]) => {
  return [...array].sort(() => Math.random() - 0.5);
};

const animals = [
  { name: "cat", emoji: "🐱" },
  { name: "dog", emoji: "🐶" },
  { name: "cow", emoji: "🐮" },
  { name: "lion", emoji: "🦁" },
  { name: "chicken", emoji: "🐔" },
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
const LEVEL_INTRO_DELAY_MS = 1800;

export default function Level1Sound() {
  const navigate = useNavigate();

  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0);
  const [showNext, setShowNext] = useState(false);
  const [showNoPrompt, setShowNoPrompt] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [levelIntroActive, setLevelIntroActive] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(PHONICS_LEVEL_TIME);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);
  const [wrongThisLevel, setWrongThisLevel] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState("phonics_sound_match");
  const [message, setMessage] = useState("Tap the sound and choose the animal!");
  const [wrongChoice, setWrongChoice] = useState<string | null>(null);

  const [shuffledAnimals, setShuffledAnimals] = useState(animals);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const levelIntroTimerRef = useRef<number | null>(null);
  const wrongChoiceTimerRef = useRef<number | null>(null);
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const currentLevel = levels[level];

  const clearLevelIntroTimer = () => {
    if (levelIntroTimerRef.current !== null) {
      window.clearTimeout(levelIntroTimerRef.current);
      levelIntroTimerRef.current = null;
    }
  };

  const playSound = () => {
    if (!soundEnabled) return;
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
      if (!soundEnabled || !("speechSynthesis" in window)) return;
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

  const startCountdown = () => {
    setLevelIntroActive(false);
    setCountdown(3);
    levelIntroTimerRef.current = null;
  };

  const speakLevelIntro = () => {
    const startedAt = Date.now();
    const startCountdownAfterMinimumIntro = () => {
      const elapsed = Date.now() - startedAt;
      const remainingDelay = Math.max(0, LEVEL_INTRO_DELAY_MS - elapsed);
      levelIntroTimerRef.current = window.setTimeout(startCountdown, remainingDelay);
    };

    if (!soundEnabled || !("speechSynthesis" in window)) {
      levelIntroTimerRef.current = window.setTimeout(startCountdown, LEVEL_INTRO_DELAY_MS);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`Match the ${currentLevel.answer} sound.`);
      utterance.lang = "en-US";
      utterance.rate = 0.86;
      utterance.pitch = 1.25;
      utterance.volume = 1;
      const fallbackTimer = window.setTimeout(startCountdownAfterMinimumIntro, 4200);
      levelIntroTimerRef.current = fallbackTimer;

      utterance.onend = () => {
        window.clearTimeout(fallbackTimer);
        startCountdownAfterMinimumIntro();
      };
      utterance.onerror = () => {
        window.clearTimeout(fallbackTimer);
        startCountdownAfterMinimumIntro();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      levelIntroTimerRef.current = window.setTimeout(startCountdown, LEVEL_INTRO_DELAY_MS);
    }
  };

  const speakFeedback = (text: string) => {
    try {
      if (!soundEnabled || !("speechSynthesis" in window)) return;
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
    setShuffledAnimals(shuffleArray(animals));
    setWrongChoice(null);
    setWrongThisLevel(0);
    setLevelIntroActive(true);
    setCountdown(null);
    setTimeLeft(PHONICS_LEVEL_TIME);
    setTimerRunning(false);
    setTimeUpOpen(false);
    warnedSecondsRef.current = new Set();
  }, [level]);

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
    if (!levelIntroActive) return;
    if (showNext || showNoPrompt || timeUpOpen || isFinished) return;

    setTimerRunning(false);

    clearLevelIntroTimer();

    speakLevelIntro();

    return () => {
      clearLevelIntroTimer();
    };
  }, [levelIntroActive, currentLevel.answer, showNext, showNoPrompt, timeUpOpen, isFinished, soundEnabled]);

  useEffect(() => {
    return () => {
      clearLevelIntroTimer();
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
    if (countdown === null) return;
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
  }, [countdown, showNext, showNoPrompt, timeUpOpen, isFinished]);

  useEffect(() => {
    if (!timerRunning) return;
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
  ]);

  useEffect(() => {
    if (!timerRunning) return;
    if (countdown !== null) return;
    if (showNext || showNoPrompt || timeUpOpen || isFinished) return;
    if (timeLeft > 5 || timeLeft <= 0) return;
    if (warnedSecondsRef.current.has(timeLeft)) return;

    warnedSecondsRef.current.add(timeLeft);
    sayKid(String(timeLeft));
    playKidBeep(timeLeft);
  }, [timerRunning, countdown, timeLeft, showNext, showNoPrompt, timeUpOpen, isFinished, soundEnabled]);

  useEffect(() => {
    const loadProgressContext = async () => {
      const id = await getOrCreateActiveChildId();
      setChildId(id);

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

    await supabase.rpc("record_game_attempt", {
      p_child_id: childId,
      p_game_code: gameCode,
      p_score: score,
      p_wrong_attempts: attempts,
      p_finished: finished,
    });
  };

  const handleGuess = (animal: string) => {
    if (levelIntroActive || countdown !== null || timeUpOpen) return;
    if (showNext || isFinished) return;

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
    clearLevelIntroTimer();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setLevelIntroActive(false);
    setCountdown(null);
    setTimeLeft(PHONICS_LEVEL_TIME);
    setTimerRunning(true);
    warnedSecondsRef.current = new Set();
    setMessage("Tap the sound and choose the animal!");
    window.setTimeout(playSound, 250);
  };

  const handlePlayAgain = () => {
    setWrong(0);
    setScore(0);
    setLevel(0);
    setShowNext(false);
    setShowNoPrompt(false);
    setIsFinished(false);
    setWrongChoice(null);
    setWrongThisLevel(0);
    setTimeUpOpen(false);
    setLevelIntroActive(true);
    setCountdown(null);
    setTimeLeft(PHONICS_LEVEL_TIME);
    setTimerRunning(false);
    warnedSecondsRef.current = new Set();
    setMessage("Tap the sound and choose the animal!");
  };

  return (
    <div className="game-container phonics-bg-image phonics-page">
      <button className="pq-back-btn" onClick={() => navigate("/lesson/phonics")}>
        ← Back
      </button>

      <h2 className="pq-page-title">
  <span className="pq-main-title">
    Listen and match the sound!
  </span>

  <br />

   <div className="pq-meta-row">
    <span className="pq-level-pill">Level {level + 1}</span>
    <span className={`pq-timer-pill ${timeLeft <= 5 ? "pq-timer-pill--warning" : ""}`}>
      ⏱ {timeLeft}s
    </span>
    <button
      type="button"
      className="pq-sound-toggle"
      onClick={() => setMusicEnabled((prev) => !prev)}
      aria-label={musicEnabled ? "Mute music" : "Unmute music"}
      title={musicEnabled ? "Mute Music" : "Unmute Music"}
    >
      {musicEnabled ? "🎵" : "🔇"}
    </button>
    <button
      type="button"
      className="pq-sound-toggle"
      onClick={() => {
        setSoundEnabled((prev) => {
          const next = !prev;
          if (!next && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
          }
          return next;
        });
      }}
      aria-label={soundEnabled ? "Mute sound" : "Unmute sound"}
      title={soundEnabled ? "Mute Sound" : "Unmute Sound"}
    >
      {soundEnabled ? "🔊" : "🔇"}
    </button>
  </div>
  
</h2> 

      <div className="sound-area">
        <div className="sound-circle" onClick={playSound}>🔊</div>

        <img src={currentLevel.image} className="lion-guide" />

        <div className="choices">
          {shuffledAnimals.map((a) => (
            <button
              key={a.name}
              className={`choice-btn choice-btn-${a.name} ${
                wrongChoice === a.name ? "choice-btn-wrong" : ""
              }`}
              onClick={() => handleGuess(a.name)}
            >
              {a.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* ✅ PANEL WITH BUTTONS INSIDE */}
      <div className="pq-panel">
        <p className="pq-message">{message}</p>
        <p className="pq-progress">
          Progress: {score}/{levels.length} | Wrong Attempts: {wrong}
        </p>

        {isFinished && (
          <div className="pq-actions">
            <button className="pq-action-btn" onClick={handlePlayAgain}>
              Play Again
            </button>
            <button
              className="pq-action-btn success"
              onClick={() => navigate("/parent-progress")}
            >
              View Progress
            </button>
          </div>
        )}
      </div>

      {showNext && (
        <GameOverlay isOpen={showNext}>
          <GamePopup
            title="🎉 Awesome!"
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

      {levelIntroActive && !timeUpOpen && !showNext && !showNoPrompt && !isFinished && (
        <GameOverlay isOpen={levelIntroActive}>
          <div className="game-popup">
            <div className="game-popup-title">Listen!</div>
            <div className="game-popup-subtitle">
              Match the {currentLevel.answer} sound.
            </div>
          </div>
        </GameOverlay>
      )}

      {countdown !== null && !timeUpOpen && !showNext && !showNoPrompt && !isFinished && (
        <GameOverlay isOpen={countdown !== null}>
          <GamePopup
            title={<Countdown value={countdown} />}
            subtitle="Get ready!"
          />
        </GameOverlay>
      )}

      {timeUpOpen && (
        <GameOverlay isOpen={timeUpOpen}>
          <GamePopup
            title="⏰ Time's up!"
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
