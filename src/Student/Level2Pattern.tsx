import { useState, useEffect } from "react";
import "./Level2.css";
import lion_think from "../img/lion_think.png";

export default function Level2Pattern() {
  const correct = "sun";

  const [popup, setPopup] = useState("");
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [dropped, setDropped] = useState<string | null>(null);
  const [time, setTime] = useState(30);

  // ⏱ TIMER
  const [isFinished, setIsFinished] = useState(false);
  useEffect(() => {
  if (isFinished) return; // 🔥 pinaka important

  if (time === 0) {
    setPopup("TIME_UP");
    return;
  }

  const timer = setInterval(() => {
    setTime((t) => t - 1);
  }, 1000);

  return () => clearInterval(timer);
}, [time, isFinished]);

  const showPopup = (msg: string) => {
    setPopup(msg);
    setTimeout(() => setPopup(""), 1200);
  };

  const handleDragStart = (e: any, value: string) => {
    if (time === 0) return;
    e.dataTransfer.setData("text/plain", value);
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    if (time === 0) return;

    const value = e.dataTransfer.getData("text/plain");

    setDropped(value);

    if (value === correct) {
      setScore((s) => s + 1);
      setIsFinished(true);
      showPopup("🎉 Correct!");
    } else {
      setWrong((w) => w + 1);
      showPopup("❌ Try Again!");
      setDropped(null);
    }
  };

  const handleBack = () => {
    window.history.back();
  };

  const handleRestart = () => {
    setTime(30);
    setScore(0);
    setWrong(0);
    setDropped(null);
    setPopup("");
     setIsFinished(false);
  };

  return (
    <div className="pattern">
      <h2>What comes next?</h2>

      <p className="instruction">
        Drag the correct symbol into the box
      </p>

      <div className="timer">⏱ {time}s</div>

      <div className="pattern-content">
        <img src={lion_think} className="lion-think" />

        <div className="pattern-right">
          <div className="pattern-box">
            ☀️ ☁️ ☀️
            <span
              className="drop-box"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {dropped === "sun" && "☀️"}
              {dropped === "cloud" && "☁️"}
              {!dropped && "❓"}
            </span>
          </div>

          <div className="choices">
            <div
              className="choice-btn2"
              draggable={time !== 0}
              onDragStart={(e) => handleDragStart(e, "sun")}
            >
              ☀️
            </div>

            <div
              className="choice-btn2"
              draggable={time !== 0}
              onDragStart={(e) => handleDragStart(e, "cloud")}
            >
              ☁️
            </div>
          </div>
        </div>
      </div>

      {/* 🔥 FIXED POPUP */}
      {popup && (
        <div className="popup-overlay">
          
          {/* TIME UP SCREEN */}
          {popup === "TIME_UP" ? (
            <div className="popup-content">
              <h2>⏰ Time's up!</h2>

              <div className="popup-buttons">
                <button onClick={handleBack}>← Back</button>
              </div>
            </div>
          ) : (
            popup
          )}

        </div>
      )}

      <div className="stats">
        ⭐ Score: {score} | ❌ Wrong: {wrong}
      </div>
    </div>
  );
}