import "./StudentPage.css";
import logo from "../../../img/bear.jpg";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { getStudentGameAccess } from "../../../lib/studentGameAccess";
import { isActivityOpen } from "../../../lib/activityConfig";
import bgMusic from "./bg-music-loop.mp3";

import { FaFont, FaShapes, FaPuzzlePiece } from "react-icons/fa";
import { MdNumbers, MdColorLens } from "react-icons/md";
import { GiSoundWaves } from "react-icons/gi";

export default function StudentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [childFirstName, setChildFirstName] = useState("Child");
  const [allowedGames, setAllowedGames] = useState<string[]>([]);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

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

      const { data } = await supabase
        .from("children_accounts")
        .select("first_name")
        .eq("id", childId)
        .maybeSingle();

      const firstName = data?.first_name?.trim();
      if (firstName) {
        setChildFirstName(firstName);
      }
    };

    void loadChildName();
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

