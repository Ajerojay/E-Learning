import { useEffect, useMemo, useState } from "react";
import "./raingame.css";

import cloudImg from "../Student/images/cloud.png";
import bgImg from "../Student/images/numbers-bg.jpg";
import dropImg from "../Student/images/rain.png";

export default function RainGame() {
  const [target, setTarget] = useState<number>(3);
  const [selected, setSelected] = useState<number[]>([]);
  const [score, setScore] = useState<number>(0);
  const [wrong, setWrong] = useState<number>(0);
  const [locked, setLocked] = useState<boolean>(false);

  useEffect(() => {
    generateGame();
  }, []);

  const generateGame = () => {
    const num = Math.floor(Math.random() * 5) + 1;
    setTarget(num);
    setSelected([]);
    setLocked(false);
  };

  const handleClick = (id: number) => {
    if (selected.includes(id) || locked) return;

    setSelected((prev) => [...prev, id]);
  };

  const checkAnswer = () => {
    if (locked || selected.length === 0) return;

    setLocked(true);

    if (selected.length === target) {
      setScore((prev) => prev + 1);
    } else {
      setWrong((prev) => prev + 1);
    }

    setTimeout(generateGame, 800); // ⚡ faster reset
  };

 const positions = [
    { top: 20, left: 350 },   // top
    { top: 10, left: -90 },   // left
    { top: 80, left: 240 },  // right
    { top: 100, left: 10 }, // bottom left
    { top: 16, left: 125 }  // bottom right
  ];
 

  return (
    <div
      className="rain-container"
      style={{ backgroundImage: `url(${bgImg})` }}
    >
      <div className="tag">Numbers</div>

      <h2 className="title">Count the Raindrops!</h2>

      {/* 🧠 SIMPLE INSTRUCTION */}
      <p className="instruction">
        Tap the raindrops that match the number ☁️
      </p>

      <div className="cloud-wrapper">
        <img src={cloudImg} className="cloud-img" />
        <div className="cloud-number">{target}</div>

        <div className="drops-area">
          {positions.map((pos, index) => (
            <img
              key={index}
              src={dropImg}
              className={`drop ${
                selected.includes(index) ? "clicked" : ""
              }`}
              style={{ top: pos.top, left: pos.left }}
              onClick={() => handleClick(index)}
            />
          ))}
        </div>
      </div>

      {/* 🔘 SMART SUBMIT */}
      <button
        className="submit-btn"
        onClick={checkAnswer}
        disabled={selected.length === 0 || locked}
      >
        Submit
      </button>

      {/* ⭐ SCORE */}
      <div className="score-bar">
        ⭐ Score: {score} | ❌ Wrong: {wrong}
      </div>
    </div>
  );
}