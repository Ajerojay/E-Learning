import { useState } from "react";
import "./SoundGame.css";
import Level1Sound from "./Level1Sound";
import Level2Pattern from "./Level2Pattern";

export default function SoundGame() {
  const [level, setLevel] = useState(1);
  const [popup, setPopup] = useState("");
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);

  const showPopup = (msg: string, next?: () => void) => {
    setPopup(msg);
    setTimeout(() => {
      setPopup("");
      next && next();
    }, 1200);
  };

  return (
    <div className="game-container">

      {level === 1 && (
        <Level1Sound 
          setLevel={setLevel}
          setScore={setScore}
          setWrong={setWrong}
          showPopup={showPopup}
        />
      )}

      {level === 2 && (
        <Level2Pattern 
          setLevel={setLevel}
          setScore={setScore}
          setWrong={setWrong}
          showPopup={showPopup}
        />
      )}

      {popup && <div className="popup-overlay">{popup}</div>}

      <div className="stats">
        ⭐ Score: {score} | ❌ Wrong: {wrong}
      </div>

    </div>
  );
}