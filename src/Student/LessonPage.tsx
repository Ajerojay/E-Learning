import "./LessonPage.css";
import { useNavigate, useParams } from "react-router-dom";

/* ✅ IMPORT ALL BACKGROUNDS */
import colorsBg from "./images/colors-bg.png";
import numbersBg from "./images/numbers-bg.jpg";
import phonicsBg from "./images/phonics-bg.jpg";
import shapesBg from "./images/shapes-bg.jpg";
import lettersBg from "./images/letters-bg.jpg";
import logicBg from "./images/logic-bg.jpg";

export default function LessonPage() {
  const navigate = useNavigate();
  const { category } = useParams();

  const videos = JSON.parse(localStorage.getItem("videos") || "{}");

 const formattedCategory =
  category
    ? category.charAt(0).toUpperCase() + category.slice(1)
    : "";
    
  const lessonVideos = videos[formattedCategory || ""] || [];

  /* ✅ DYNAMIC BACKGROUND */
  const bgMap: any = {
    colors: colorsBg,
    numbers: numbersBg,
    phonics: phonicsBg,
    shapes: shapesBg,
    letters: lettersBg,
    logic: logicBg,
  };

  const backgroundImage = bgMap[category || "colors"];

  return (
    <div
      className="lesson-page"
      style={{
        backgroundImage: `url(${backgroundImage})`,
      }}
    >

      {/* BACK BUTTON */}
      <button className="back-btn" onClick={() => navigate("/student")}>
        ← Back
      </button>

      <h1 className="lesson-title">{formattedCategory} Lesson</h1>

      {/* TV CONTAINER */}
      <div className="tv-container">
        {lessonVideos.length > 0 ? (
          <iframe
            src={lessonVideos[0].link}
            title="Lesson"
            frameBorder="0"
            allowFullScreen
          ></iframe>
        ) : (
          <p className="no-video">No videos yet</p>
        )}
      </div>

    </div>
  );
}