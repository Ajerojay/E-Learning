import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./StudentAccess.css";
import {
  activateChildPinSession,
  findChildrenByPin,
  getChildDisplayName,
  saveChildDeviceLabel,
  type PinChildMatch,
} from "../../../lib/childProgress";
import { cancelNativeSpeech, speakNative } from "../../nativeTts";

function childName(child: PinChildMatch) {
  return getChildDisplayName({
    first_name: child.firstName,
    last_name: child.lastName,
    child_name: child.childName,
  });
}

function whoIsLearningScript(matches: PinChildMatch[]) {
  const names = matches.map(childName);
  const nameList =
    names.length === 2
      ? `${names[0]}. Or ${names[1]}`
      : `${names.slice(0, -1).join(". ")}. Or ${names[names.length - 1]}`;
  return `Who is learning? Ask a parent to tap the correct name. ${nameList}.`;
}

function pickKidVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find((voice) => /en(-|_)us|english/i.test(voice.lang) && /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(voice.name)) ||
    voices.find((voice) => /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(voice.name)) ||
    voices.find((voice) => /en/i.test(voice.lang)) ||
    voices[0]
  );
}

function speakWhoIsLearning(matches: PinChildMatch[]) {
  const text = whoIsLearningScript(matches);
  cancelNativeSpeech();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (speakNative(text, { interrupt: true, rate: 0.95, pitch: 1.3 })) return;
  if (!("speechSynthesis" in window)) return;

  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickKidVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.pitch = 1.25;
    window.speechSynthesis.speak(utterance);
  };

  if (pickKidVoice()) {
    speak();
    return;
  }
  const onVoices = () => {
    window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
    speak();
  };
  window.speechSynthesis.addEventListener("voiceschanged", onVoices);
  void window.speechSynthesis.getVoices();
  window.setTimeout(speak, 250);
}

export default function StudentAccess() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinMatches, setPinMatches] = useState<PinChildMatch[] | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const fromStudent = location.state?.fromStudent;
  const choosingName = Boolean(pinMatches && pinMatches.length > 1);

  const enterChild = useCallback(async (child: PinChildMatch, childPin: string) => {
    await activateChildPinSession(child, childPin);
    saveChildDeviceLabel(child.id);
    navigate("/student", {
      replace: true,
      state: {
        childId: child.id,
        childFirstName: getChildDisplayName({
          first_name: child.firstName,
          last_name: child.lastName,
          child_name: child.childName,
        }),
      },
    });
  }, [navigate]);

  const handleInput = (num: string) => {
    if (choosingName || pin.length >= 4) return;
    setPin(pin + num);
  };

  const handleDelete = () => {
    if (choosingName) return;
    setPin((p) => p.slice(0, -1));
  };

  const handleSubmit = useCallback(async () => {
    if (pin.length !== 4 || busy || choosingName) return;

    setBusy(true);
    try {
      localStorage.removeItem("temporaryStudentAccess");

      const matches = await findChildrenByPin(pin);
      if (matches.length === 1) {
        await enterChild(matches[0], pin);
        return;
      }
      if (matches.length > 1) {
        setPinMatches(matches);
        speakWhoIsLearning(matches);
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
  }, [pin, busy, choosingName, enterChild]);

  const handlePickChild = async (child: PinChildMatch) => {
    if (busy) return;
    setBusy(true);
    cancelNativeSpeech();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    try {
      await enterChild(child, pin);
    } finally {
      setBusy(false);
    }
  };

  const handleChooseDifferentPin = () => {
    cancelNativeSpeech();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setPinMatches(null);
    setPin("");
  };

  useEffect(() => {
    if (!choosingName) return;
    return () => {
      cancelNativeSpeech();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [choosingName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (choosingName) return;

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
  }, [handleSubmit, choosingName]);

  return (
    <div className="lockscreen">
      <button
        className="access-back-btn"
        onClick={() => (choosingName ? handleChooseDifferentPin() : navigate("/"))}
      >
        {choosingName ? "\u2190 Different PIN" : fromStudent ? "\u2190 Exit Student Mode" : "\u2190 Parent Login"}
      </button>

      {choosingName ? (
        <>
          <div className="access-heading">
            <span className="access-mascot" aria-hidden="true">&#128107;</span>
            <h1 className="lock-title">Who is learning?</h1>
            <p>Ask a parent to tap the correct name.</p>
            <button
              type="button"
              className="hear-names-btn"
              onClick={() => pinMatches && speakWhoIsLearning(pinMatches)}
            >
              Hear names
            </button>
          </div>

          <div className="child-name-list" role="list">
            {pinMatches?.map((child) => (
              <button
                key={child.id}
                type="button"
                className="child-name-btn"
                role="listitem"
                disabled={busy}
                onClick={() => void handlePickChild(child)}
              >
                {getChildDisplayName({
                  first_name: child.firstName,
                  last_name: child.lastName,
                  child_name: child.childName,
                })}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
