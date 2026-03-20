import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./StudentAccess.css";

export default function StudentAccess() {
  const [pin, setPin] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const fromStudent = location.state?.fromStudent;

  const handleInput = (num: string) => {
    if (pin.length < 4) setPin(pin + num);
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const handleSubmit = () => {
    const storedPin = localStorage.getItem("studentPin") || "1234";

    if (pin === storedPin) {
      navigate("/student");
    } else {
      setPin("");
      alert("Incorrect PIN");
    }
  };

  return (
    <div className="lockscreen">

      {/* BACK BUTTON (SMART LABEL) */}
      <button
        className="access-back-btn"
        onClick={() => navigate("/")}
      >
        {fromStudent ? "← Exit Student Mode" : "← Parent Login"}
      </button>

      <h1 className="lock-title">Enter Passcode</h1>

      {/* DOTS */}
      <div className="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`dot ${pin.length > i ? "filled" : ""}`}
          />
        ))}
      </div>

      {/* KEYPAD */}
      <div className="keypad">
        {[1,2,3,4,5,6,7,8,9].map((num) => (
          <button key={num} onClick={() => handleInput(num.toString())}>
            {num}
          </button>
        ))}

        <button className="empty"></button>
        <button onClick={() => handleInput("0")}>0</button>
        <button onClick={handleDelete}>⌫</button>
      </div>

      <button className="enter-btn" onClick={handleSubmit}>
        Enter
      </button>

    </div>
  );
}