import { useRef, useState } from "react";
import "./Level1.css";
import lion from "../img/lion-.png";
import rawrSound from "../img/lion-sound.mp3";

const animals = [
  { name: "cat", emoji: "🐱" },
  { name: "dog", emoji: "🐶" },
  { name: "cow", emoji: "🐮" },
  { name: "tiger", emoji: "🐯" },
];

export default function Level1Sound() {
  const [popup, setPopup] = useState("");
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playSound = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const audio = new Audio(rawrSound);
    audioRef.current = audio;
    audio.play();
  };

  const showPopup = (msg: string) => {
    setPopup(msg);
    setTimeout(() => setPopup(""), 1200);
  };

  const handleGuess = (animal: string) => {
    if (animal === "tiger") {
      setScore((s) => s + 1);
      showPopup("🎉 Correct!");
    } else {
      setWrong((w) => w + 1);
      showPopup("❌ Try Again!");
    }
  };

  return (
    <div className="game-container">
      <h2>Listen and match the sound!</h2>

      <div className="sound-area">
        <div className="sound-circle" onClick={playSound}>🔊</div>
        <img src={lion} className="lion-guide" />

        <p className="instruction">Tap the sound and choose the animal!</p>

        <div className="choices">
          {animals.map((a) => (
            <button
              key={a.name}
              className="choice-btn"
              onClick={() => handleGuess(a.name)}
            >
              {a.emoji}
            </button>
          ))}
        </div>
      </div>

      {popup && <div className="popup-overlay">{popup}</div>}

      <div className="stats">
        ⭐ Score: {score} | ❌ Wrong: {wrong}
      </div>
    </div>
  );
}