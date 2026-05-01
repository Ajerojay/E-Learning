import "./StudentPage.css";
import logo from "../img/bear.jpg";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getFirstName, getOrCreateActiveChildId } from "../lib/childProgress";

import { FaFont, FaShapes, FaPuzzlePiece } from "react-icons/fa";
import { MdNumbers, MdColorLens } from "react-icons/md";
import { GiSoundWaves } from "react-icons/gi";

export default function StudentPage() {
  const navigate = useNavigate();
  const [childFirstName, setChildFirstName] = useState("Child");

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

      const { data } = await supabase
        .from("children_accounts")
        .select("child_name")
        .eq("id", childId)
        .maybeSingle();

      if (data?.child_name) {
        setChildFirstName(getFirstName(data.child_name));
      }
    };

    void loadChildName();
  }, []);

  return (
    <div className="student-page">

      {/* BACK BUTTON */}
      <button
        className="back-btn"
        onClick={() =>
          navigate("/student-access", { state: { fromStudent: true } })
        }
      >
        ← Back
      </button>

      {/* HEADER */}
      <header className="pd-top-header">
        <div className="pd-brand">
          <img src={logo} alt="logo" className="pd-logo" />
          <span className="pd-brand-text">LearnEase Kids</span>
        </div>
      </header>

      <h1 className="student-title">Hi {childFirstName}!</h1>

      {/* GRID */}
      <div className="lesson-grid">
        {lessons.map((item, index) => (
          <div
            key={index}
            className={`cloud-card ${item.key}`}
            onClick={() => navigate(`/lesson/${item.key}`)}
          >
            <div className="cloud-icon">{item.icon}</div>
            <div className="cloud-text">{item.name}</div>
          </div>
        ))}
      </div>

    </div>
  );
}