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
  const [locked, setLocked] = useState<boolean>(false); // para di makapindot habang checking

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
    if (locked) return;

    setLocked(true);

    if (selected.length === target) {
      setScore((prev) => prev + 1);
    } else {
      setWrong((prev) => prev + 1);
    }

    setTimeout(() => {
      generateGame();
    }, 1000);
  };

 const positions = [
    { top: 20, left: 350 },   // top
    { top: 10, left: -90 },   // left
    { top: 80, left: 240 },  // right
    { top: 100, left: 10 }, // bottom left
    { top: 16, left: 125 }  // bottom right
  ];
    []

  return (
    <div
      className="rain-container"
      style={{ backgroundImage: `url(${bgImg})` }}
    >
      <div className="tag">Numbers</div>

      <h2 className="title">Count the Raindrops!</h2>

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

      {/* 🔘 SUBMIT BUTTON */}
      <button className="submit-btn" onClick={checkAnswer}>
        Submit
      </button>

      {/* ⭐ SCORE */}
      <div className="score-bar">
        ⭐ Score: {score} | ❌ Wrong: {wrong}
      </div>
    </div>
  );
}