import { useEffect, useState } from "react";
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
    const storedPin = localStorage.getItem("studentPin");

    if (!storedPin) {
      setPin("");
      alert("Please log in as parent first to set up your child's PIN.");
      return;
    }

    if (pin === storedPin) {
      navigate("/student");
    } else {
      setPin("");
      alert("Incorrect PIN");
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key >= "0" && event.key <= "9") {
        setPin((prev) => (prev.length < 4 ? prev + event.key : prev));
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        setPin((prev) => prev.slice(0, -1));
        return;
      }

      if (event.key === "Enter") {
        handleSubmit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSubmit]);

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