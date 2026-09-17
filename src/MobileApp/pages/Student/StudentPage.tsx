import "./StudentPage.css";
import logo from "../../../img/bear.jpg";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { getOrCreateActiveChildId, getRememberedChildFirstName, rememberChildFirstName, getChildDisplayFirstName } from "../../../lib/childProgress";
import { getActiveChild } from "../../../lib/supabaseData";
import { cacheOfflineChild, getOfflineChildById } from "../../../lib/offlineSqlite";
import { getStudentGameAccess } from "../../../lib/studentGameAccess";
import { isActivityOpen } from "../../../lib/activityConfig";
import { cancelNativeSpeech, speakKidPrompt } from "../../nativeTts";
import bgMusic from "./bg-music-loop.mp3";

import { FaFont, FaShapes, FaPuzzlePiece } from "react-icons/fa";
import { MdNumbers, MdColorLens } from "react-icons/md";
import { GiSoundWaves } from "react-icons/gi";

export default function StudentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedChild = location.state as { childId?: string; childFirstName?: string } | null;
  const [childFirstName, setChildFirstName] = useState(() => {
    const childId = localStorage.getItem("activeChildId");
    if (selectedChild?.childId && selectedChild.childId === childId && selectedChild.childFirstName) {
      return selectedChild.childFirstName;
    }
    return getRememberedChildFirstName(childId) || "Child";
  });
  const [allowedGames, setAllowedGames] = useState<string[]>([]);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const pageActiveRef = useRef(true);
  const greetedRef = useRef(false);

  const lessons = [
    { name: "Phonics", icon: <GiSoundWaves />, key: "phonics" },
    { name: "Numbers", icon: <MdNumbers />, key: "numbers" },
    { name: "Colors", icon: <MdColorLens />, key: "colors" },
    { name: "Shapes", icon: <FaShapes />, key: "shapes" },
    { name: "Letters", icon: <FaFont />, key: "letters" },
    { name: "Logic", icon: <FaPuzzlePiece />, key: "logic" },
  ];

  useEffect(() => {
    const loadChildName = async () => {
      const childId = await getOrCreateActiveChildId();
      if (!childId) return;
      setAllowedGames(getStudentGameAccess(childId));

      const applyName = (name: string, allowPlaceholder = false) => {
        const clean = name.trim();
        if (!clean) return;
        if (!allowPlaceholder && clean === "Child") return;
        setChildFirstName(clean);
        rememberChildFirstName(childId, clean);
      };

      const remembered = getRememberedChildFirstName(childId);
      if (remembered) applyName(remembered, true);
      else if (selectedChild?.childId === childId && selectedChild.childFirstName) {
        applyName(selectedChild.childFirstName, true);
      }
      const cachedChild = await getOfflineChildById(childId);
      applyName(getChildDisplayFirstName({
        first_name: cachedChild?.firstName,
        child_name: cachedChild?.childName,
      }));

      try {
        const child = await Promise.race([
          getActiveChild(childId),
          new Promise<null>((_, reject) => window.setTimeout(() => reject(new Error("offline-timeout")), 2500)),
        ]);
        applyName(getChildDisplayFirstName({
          first_name: child?.firstName,
          child_name: child?.childName,
        }));
        if (child) {
          void cacheOfflineChild({
            id: childId,
            parentId: child.parentId,
            childName: child.childName,
            firstName: child.firstName,
            lastName: child.lastName,
            pinCode: child.pinCode,
            isActive: child.isActive,
          });
        }
      } catch {
        // Keep the locally remembered name when the network is gone.
      }
    };

    void loadChildName();
  }, []);

  useEffect(() => {
    const name = childFirstName.trim();
    const childId = localStorage.getItem("activeChildId");
    const greetingKey = childId ? `studentGreetingPending:${childId}` : "";
    const greetingPending = Boolean(greetingKey && sessionStorage.getItem(greetingKey) === "1");
    if (!name || name === "Child" || greetedRef.current || !greetingPending) return;

    const resumeMusic = () => {
      if (pageActiveRef.current && bgMusicRef.current && musicEnabled) {
        bgMusicRef.current.play().catch(() => {});
      }
    };

    const timer = window.setTimeout(() => {
      if (greetedRef.current) return;
      greetedRef.current = true;
      sessionStorage.removeItem(greetingKey);
      if (bgMusicRef.current && musicEnabled) bgMusicRef.current.pause();
      speakKidPrompt(`Hi, ${name}! What would you like to learn today?`, {
        interrupt: true,
        onEnd: resumeMusic,
      });
    }, 650);

    return () => window.clearTimeout(timer);
  }, [childFirstName, musicEnabled]);

  useEffect(() => {
    pageActiveRef.current = true;
    const pauseForLesson = () => bgMusicRef.current?.pause();
    window.addEventListener("learnease:pause-background-music", pauseForLesson);
    return () => {
      pageActiveRef.current = false;
      window.removeEventListener("learnease:pause-background-music", pauseForLesson);
      cancelNativeSpeech();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      bgMusicRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    // Initialize background music
    if (!bgMusicRef.current) {
      const audio = new Audio(bgMusic);
      audio.loop = true;
      audio.volume = 0.3;
      bgMusicRef.current = audio;

      if (musicEnabled) {
        audio.play().catch(() => {
          // Browser may require user interaction to autoplay
        });
      }
    }

    return () => {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
        bgMusicRef.current.currentTime = 0;
      }
    };
  }, []);

  useEffect(() => {
    // Handle music enabled/disabled toggle
    if (bgMusicRef.current) {
      if (musicEnabled) {
        bgMusicRef.current.play().catch(() => {});
      } else {
        bgMusicRef.current.pause();
      }
    }
  }, [musicEnabled]);

  return (
    <div className="student-page">

      {/* BACK BUTTON */}
      <button
        className="student-back-btn"
        onClick={() =>
          navigate("/student-access", { state: { fromStudent: true } })
        }
      >
        <span className="student-back-arrow" aria-hidden="true">&#8592;</span>
        <span className="student-back-label">Back</span>
      </button>

      {/* HEADER */}
      <header className="student-top-header">
        <div className="student-brand">
          <img src={logo} alt="LearnEase bear" className="student-logo" />
          <span className="student-brand-text">LearnEase Kids</span>
        </div>
        <button
          type="button"
          className="student-music-toggle"
          onClick={() => setMusicEnabled((prev) => !prev)}
          aria-label={musicEnabled ? "Mute music" : "Unmute music"}
          title={musicEnabled ? "Mute Music" : "Unmute Music"}
        >
          {musicEnabled ? "\u{1F3B5}" : "\u{1F507}"}
        </button>
      </header>

      <section className="student-welcome">
        <span className="welcome-sparkle" aria-hidden="true">&#10024;</span>
        <h1 className="student-title">Hi, {childFirstName}! &#128400;</h1>
        <p>What would you like to learn today?</p>
        {location.state?.blockedGame && <p className="student-access-note">That activity is currently locked by your teacher.</p>}
      </section>

      {/* GRID */}
      <div className="lesson-grid">
        {lessons.filter(item => allowedGames.includes(item.key) && isActivityOpen(item.key as import("../../../lib/childProgress").SubjectKey)).map((item, index) => (
          <button
            key={index}
            type="button"
            className={`cloud-card ${item.key}`}
            onClick={() => navigate(`/lesson/${item.key}`)}
            aria-label={`Open ${item.name} lesson`}
          >
            <div className="cloud-icon">{item.icon}</div>
            <div className="cloud-text">{item.name}</div>
            <span className="lesson-go" aria-hidden="true">Play &#8594;</span>
          </button>
        ))}
      </div>

    </div>
  );
}

