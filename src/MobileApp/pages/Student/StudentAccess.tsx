import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./StudentAccess.css";
// ===== SUPABASE DATABASE: PIN validation helper shared by web and Android app =====
import { linkChildSessionToSupabasePin, saveChildDeviceLabel } from "../../../lib/childProgress";

export default function StudentAccess() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const fromStudent = location.state?.fromStudent;

  const handleInput = (num: string) => {
    if (pin.length < 4) setPin(pin + num);
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
  };

  const handleSubmit = useCallback(async () => {
    if (pin.length !== 4 || busy) return;

    setBusy(true);
    try {
      localStorage.removeItem("temporaryStudentAccess");

      // ===== SUPABASE DATABASE: VERIFY PIN IN children_accounts =====
      const ok = await linkChildSessionToSupabasePin(pin);
      if (ok) {
        saveChildDeviceLabel();
        navigate("/student");
        return;
      }
      setPin("");
      const storedPin = localStorage.getItem("studentPin");
      if (!storedPin) {
        alert("Please log in as parent first to set up your child's PIN.");
      } else {
        alert("Incorrect PIN");
      }
    } finally {
      setBusy(false);
    }
  }, [pin, busy, navigate]);

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
        void handleSubmit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSubmit]);

  return (
    <div className="lockscreen">
      <button
        className="access-back-btn"
        onClick={() => navigate("/")}
      >
        {fromStudent ? "\u2190 Exit Student Mode" : "\u2190 Parent Login"}
      </button>

      <div className="access-heading">
        <span className="access-mascot" aria-hidden="true">&#129528;</span>
        <h1 className="lock-title">Enter Your PIN</h1>
        <p>Tap the four numbers to start learning!</p>
      </div>

      <div className="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`dot ${pin.length > i ? "filled" : ""}`}
          />
        ))}
      </div>

      <div className="keypad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button key={num} type="button" onClick={() => handleInput(num.toString())}>
            {num}
          </button>
        ))}

        <button type="button" className="empty" aria-hidden="true" />
        <button type="button" onClick={() => handleInput("0")}>0</button>
        <button type="button" onClick={handleDelete}>⌫</button>
      </div>

      <button type="button" className="enter-btn" onClick={() => void handleSubmit()} disabled={busy || pin.length !== 4}>
        {busy ? "Checking\u2026" : "Enter"}
      </button>

    </div>
  );
}

