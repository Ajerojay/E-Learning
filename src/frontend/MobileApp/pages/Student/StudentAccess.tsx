import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./StudentAccess.css";
import {
  activateChildPinSession,
  findChildrenByPin,
  getChildDisplayName,
  saveChildDeviceLabel,
  type PinChildMatch,
} from "../../../../backend/childProgress";
import { cancelNativeSpeech, speakNative, speakTrackedNative, subscribeAndroidTts } from "../../nativeTts";
import { recordChildLoginAttendance } from "../../../../backend/attendance";
import { childNeedsAvatarPick, getStoredChildAvatar, rememberChildAvatar } from "../../../../backend/childAvatar";
import { childAvatarById } from "./childAvatars";

function childName(child: PinChildMatch) {
  return getChildDisplayName({
    first_name: child.firstName,
    last_name: child.lastName,
    child_name: child.childName,
  });
}

type NameSpeechPart = { key: string; childId: string | null; text: string };

function nameSpeechParts(matches: PinChildMatch[]): NameSpeechPart[] {
  const parts: NameSpeechPart[] = [
    { key: "who-0", childId: null, text: "Who is learning? Ask a parent to tap the correct name." },
  ];
  matches.forEach((child, index) => {
    const name = childName(child);
    const last = index === matches.length - 1 && matches.length > 1;
    parts.push({ key: `who-${index + 1}`, childId: child.id, text: last ? `Or ${name}.` : `${name}.` });
  });
  return parts;
}

function estimateSpeechMs(text: string, rate = 0.95) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const pauses = (text.match(/[.?!]/g) || []).length;
  return Math.max(700, Math.round((words / (2.4 * rate)) * 1000 + pauses * 280));
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

function scheduleNameHighlights(
  parts: NameSpeechPart[],
  onHighlight: (childId: string | null) => void,
  onFinish: () => void,
  isStopped: () => boolean
) {
  const timers: number[] = [];
  let elapsed = 0;
  parts.forEach((part) => {
    const at = elapsed;
    timers.push(window.setTimeout(() => {
      if (!isStopped()) onHighlight(part.childId);
    }, at));
    elapsed += estimateSpeechMs(part.text);
  });
  timers.push(window.setTimeout(() => {
    if (!isStopped()) onFinish();
  }, elapsed + 280));
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}

function startWhoIsLearningSpeech(
  matches: PinChildMatch[],
  onHighlight: (childId: string | null) => void,
  onFinish: () => void
) {
  const parts = nameSpeechParts(matches);
  let stopped = false;
  const isStopped = () => stopped;
  let cleanup = () => {};

  const finish = () => {
    if (stopped) return;
    stopped = true;
    cleanup();
    onFinish();
  };

  cancelNativeSpeech();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  const nativeReady = Boolean(window.AndroidTts?.isReady?.());
  if (nativeReady && typeof window.AndroidTts?.speakTracked === "function") {
    let backupStop = () => {};
    const probe = window.setTimeout(() => {
      if (stopped) return;
      backupStop = scheduleNameHighlights(parts, onHighlight, finish, isStopped);
    }, 1000);
    const unsubscribe = subscribeAndroidTts((utteranceId, event) => {
      if (stopped) return;
      const partIndex = parts.findIndex((part) => part.key === utteranceId);
      if (partIndex < 0) return;
      window.clearTimeout(probe);
      backupStop();
      backupStop = () => {};
      if (event === "start") onHighlight(parts[partIndex].childId);
      const isLast = partIndex === parts.length - 1;
      if (isLast && (event === "done" || event === "error" || event === "stop")) finish();
    });
    parts.forEach((part, index) => {
      speakTrackedNative(part.text, part.key, { interrupt: index === 0, rate: 0.95, pitch: 1.3 });
    });
    cleanup = () => {
      window.clearTimeout(probe);
      backupStop();
      unsubscribe();
    };
  } else if (nativeReady && window.AndroidTts) {
    const text = parts.map((part) => part.text).join(" ");
    if (speakNative(text, { interrupt: true, rate: 0.95, pitch: 1.3 })) {
      cleanup = scheduleNameHighlights(parts, onHighlight, finish, isStopped);
    } else {
      finish();
    }
  } else if ("speechSynthesis" in window) {
    let index = 0;
    let watchdog = 0;
    let voicesHandler: (() => void) | null = null;
    const clearWatchdog = () => {
      if (watchdog) window.clearTimeout(watchdog);
      watchdog = 0;
    };
    const step = () => {
      if (stopped) return;
      if (index >= parts.length) {
        finish();
        return;
      }
      const part = parts[index];
      let moved = false;
      const next = () => {
        if (moved || stopped) return;
        moved = true;
        clearWatchdog();
        index += 1;
        step();
      };
      const utterance = new SpeechSynthesisUtterance(part.text);
      const voice = pickKidVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || "en-US";
      utterance.rate = 0.95;
      utterance.pitch = 1.25;
      utterance.onstart = () => {
        if (!stopped) onHighlight(part.childId);
      };
      utterance.onend = next;
      utterance.onerror = next;
      watchdog = window.setTimeout(next, estimateSpeechMs(part.text) * 2 + 1200);
      window.speechSynthesis.speak(utterance);
    };
    const begin = () => {
      if (stopped) return;
      window.speechSynthesis.cancel();
      window.setTimeout(() => {
        if (!stopped) step();
      }, 70);
    };
    if (pickKidVoice()) {
      begin();
    } else {
      voicesHandler = () => {
        if (!voicesHandler) return;
        window.speechSynthesis.removeEventListener("voiceschanged", voicesHandler);
        voicesHandler = null;
        begin();
      };
      window.speechSynthesis.addEventListener("voiceschanged", voicesHandler);
      void window.speechSynthesis.getVoices();
      window.setTimeout(() => {
        if (!voicesHandler) return;
        window.speechSynthesis.removeEventListener("voiceschanged", voicesHandler);
        voicesHandler = null;
        begin();
      }, 300);
    }
    cleanup = () => {
      clearWatchdog();
      if (voicesHandler) {
        window.speechSynthesis.removeEventListener("voiceschanged", voicesHandler);
        voicesHandler = null;
      }
    };
  } else {
    finish();
  }

  return () => {
    if (stopped) return;
    stopped = true;
    cleanup();
    cancelNativeSpeech();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M3.5 9.2v5.6h4.1L13 19.8V4.2L7.6 9.2H3.5z" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 8.5a4.4 4.4 0 0 1 0 7" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M18.3 6.1a8 8 0 0 1 0 11.8" />
    </svg>
  );
}

export default function StudentAccess() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState<"incorrect" | "setup" | null>(null);
  const [pinMatches, setPinMatches] = useState<PinChildMatch[] | null>(null);
  const [spokenChildId, setSpokenChildId] = useState<string | null>(null);
  const [namesPlaying, setNamesPlaying] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const fromStudent = location.state?.fromStudent;
  const choosingName = Boolean(pinMatches && pinMatches.length > 1);
  const attemptedPin = useRef("");
  const speechStopRef = useRef<(() => void) | null>(null);
  const speechGeneration = useRef(0);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const stopNameSpeech = useCallback(() => {
    speechGeneration.current += 1;
    speechStopRef.current?.();
    speechStopRef.current = null;
    setSpokenChildId(null);
    setNamesPlaying(false);
  }, []);

  const playNames = useCallback((matches: PinChildMatch[]) => {
    speechStopRef.current?.();
    const generation = ++speechGeneration.current;
    setNamesPlaying(true);
    setSpokenChildId(null);
    speechStopRef.current = startWhoIsLearningSpeech(
      matches,
      (childId) => {
        if (speechGeneration.current === generation) setSpokenChildId(childId);
      },
      () => {
        if (speechGeneration.current !== generation) return;
        speechStopRef.current = null;
        setNamesPlaying(false);
        setSpokenChildId(null);
      }
    );
  }, []);

  const enterChild = useCallback(async (child: PinChildMatch, childPin: string) => {
    await activateChildPinSession(child, childPin);
    saveChildDeviceLabel(child.id);
    rememberChildAvatar(child.id, child.avatar);
    sessionStorage.setItem(`studentGreetingPending:${child.id}`, "1");
    await recordChildLoginAttendance(child.id);
    const childFirstName = getChildDisplayName({
      first_name: child.firstName,
      last_name: child.lastName,
      child_name: child.childName,
    });
    const needsAvatar = await childNeedsAvatarPick(child.id);
    navigate(needsAvatar ? "/student/pick-avatar" : "/student", {
      replace: true,
      state: {
        childId: child.id,
        childFirstName,
      },
    });
  }, [navigate]);

  const handleInput = (num: string) => {
    if (choosingName || busy || pin.length >= 4) return;
    setPinError(null);
    setPin(pin + num);
  };

  const handleDelete = () => {
    if (choosingName || busy) return;
    setPinError(null);
    setPin((p) => p.slice(0, -1));
  };

  const handleSubmit = useCallback(async () => {
    if (pin.length !== 4 || busy || choosingName) return;
    if (attemptedPin.current === pin) return;
    attemptedPin.current = pin;

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
        playNames(matches);
        return;
      }

      attemptedPin.current = "";
      setPin("");
      const storedPin = localStorage.getItem("studentPin");
      setPinError(storedPin ? "incorrect" : "setup");
    } finally {
      setBusy(false);
    }
  }, [pin, busy, choosingName, enterChild, playNames]);

  const handlePickChild = async (child: PinChildMatch) => {
    if (busy) return;
    setBusy(true);
    stopNameSpeech();
    try {
      await enterChild(child, pin);
    } finally {
      setBusy(false);
    }
  };

  const handleChooseDifferentPin = () => {
    stopNameSpeech();
    attemptedPin.current = "";
    setPinMatches(null);
    setPin("");
  };

  useEffect(() => {
    if (pin.length === 4) void handleSubmit();
  }, [pin, handleSubmit]);

  useEffect(() => {
    if (!spokenChildId) return;
    cardRefs.current[spokenChildId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [spokenChildId]);

  useEffect(() => {
    if (!choosingName) return;
    return () => {
      speechStopRef.current?.();
      speechStopRef.current = null;
    };
  }, [choosingName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (choosingName || busy) return;

      if (event.key >= "0" && event.key <= "9") {
        setPinError(null);
        setPin((prev) => (prev.length < 4 ? prev + event.key : prev));
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        setPinError(null);
        setPin((prev) => prev.slice(0, -1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, choosingName]);

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
              className={`hear-names-btn${namesPlaying ? " is-playing" : ""}`}
              aria-label="Hear names"
              onClick={() => pinMatches && playNames(pinMatches)}
            >
              <span className="hear-names-icon"><SpeakerIcon /></span>
              Hear names
            </button>
          </div>

          <div className="child-name-list" role="list">
            {pinMatches?.map((child) => {
              const name = childName(child);
              const avatar = childAvatarById(child.avatar || getStoredChildAvatar(child.id));
              const spoken = spokenChildId === child.id;
              return (
              <button
                key={child.id}
                ref={(node) => { cardRefs.current[child.id] = node; }}
                type="button"
                className={`child-name-btn${spoken ? " is-spoken" : ""}`}
                role="listitem"
                aria-current={spoken ? "true" : undefined}
                disabled={busy}
                onClick={() => void handlePickChild(child)}
              >
                {avatar && <img className="child-name-avatar" src={avatar.src} alt="" />}
                <span className="child-name-label">{name}</span>
                {spoken && (
                  <span className="child-name-speaking" aria-hidden="true">
                    <SpeakerIcon />
                  </span>
                )}
              </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="access-heading">
            <span className="access-mascot" aria-hidden="true">&#129528;</span>
            <h1 className="lock-title">Enter Your PIN</h1>
            <p>{busy ? "Checking your PIN..." : "Tap the four numbers to start learning!"}</p>
          </div>

          <div className={`pin-dots ${pinError ? "has-error" : ""}`}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`dot ${pin.length > i ? "filled" : ""}`}
              />
            ))}
          </div>

          {pinError && (
            <div className="pin-error-overlay" role="presentation">
              <section className="pin-error-card" role="alertdialog" aria-modal="true" aria-live="assertive" aria-labelledby="pin-error-title">
                <span className="pin-error-mascot" aria-hidden="true">🧸</span>
                <span>
                <strong id="pin-error-title">{pinError === "incorrect" ? "Oops! That PIN doesn't match" : "Let's ask a parent"}</strong>
                <small>
                  {pinError === "incorrect"
                    ? "Try your four numbers again, or ask your parent for help."
                    : "A parent needs to sign in online once to set up your PIN on this device."}
                </small>
                </span>
                <button type="button" onClick={() => setPinError(null)}>
                  {pinError === "incorrect" ? "Try Again" : "Got It"}
                </button>
              </section>
            </div>
          )}

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
        </>
      )}
    </div>
  );
}
