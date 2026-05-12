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

export default function Level1Sound() {
  const navigate = useNavigate();

  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0);
  const [showNext, setShowNext] = useState(false);
  const [showNoPrompt, setShowNoPrompt] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState("phonics_sound_match");
  const [message, setMessage] = useState("Tap the sound and choose the animal!");

  const [shuffledAnimals, setShuffledAnimals] = useState(animals);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentLevel = levels[level];

  const playSound = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const audio = new Audio(currentLevel.sound);
    audioRef.current = audio;
    audio.play();
  };

  useEffect(() => {
    playSound();
    setShuffledAnimals(shuffleArray(animals));
  }, [level]);

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
    if (showNext || isFinished) return;

    if (animal === currentLevel.answer) {
      const nextScore = score + 1;
      const percent = Math.round((nextScore / levels.length) * 100);
      const finished = level === levels.length - 1;

      setScore(nextScore);
      setMessage(`Great job! You matched ${currentLevel.answer}!`);
      saveProgress(percent, finished, wrong);

      if (finished) {
        setIsFinished(true);
        setMessage("Amazing! You completed all phonics sound levels!");
      } else {
        setTimeout(() => setShowNext(true), 500);
      }
    } else {
      const nextWrong = wrong + 1;
      setWrong(nextWrong);
      setMessage("Oops! Try again!");
      const pct = Math.round((score / levels.length) * 100);
      void saveProgress(pct, false, nextWrong);
    }
  };

  const goNextLevel = () => {
    setLevel((l) => l + 1);
    setShowNext(false);
    setMessage("Tap the sound and choose the animal!");
  };

  const handlePlayAgain = () => {
    setWrong(0);
    setScore(0);
    setLevel(0);
    setShowNext(false);
    setIsFinished(false);
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

   <span className="pq-level-text">
    (Level {level + 1})
  </span>
  
</h2> 

      <div className="sound-area">
        <div className="sound-circle" onClick={playSound}>🔊</div>

        <img src={currentLevel.image} className="lion-guide" />

        <div className="choices">
          {shuffledAnimals.map((a) => (
            <button
              key={a.name}
              className={`choice-btn choice-btn-${a.name}`}
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
            title={`🎉 Level ${level + 1} Complete!`}
            subtitle={`Proceed to Level ${level + 2}?`}
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
