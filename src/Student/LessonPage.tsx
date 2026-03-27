import "./LessonPage.css";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

import colorsBg from "./images/colors-bg.png";
import numbersBg from "./images/numbers-bg.jpg";
import phonicsBg from "./images/phonics-bg.jpg";
import shapesBg from "./images/shapes-bg.jpg";
import lettersBg from "./images/letters-bg.jpg";
import logicBg from "./images/logic-bg.jpg";

type VideoLesson = {
  id: string;
  title: string;
  description: string | null;
  grade_level: string;
  category: string;
  video_path: string;
  is_published: boolean;
};

export default function LessonPage() {
  const navigate = useNavigate();
  const { category } = useParams();

  const [lessonVideoUrl, setLessonVideoUrl] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const formattedCategory = category
    ? category.charAt(0).toUpperCase() + category.slice(1)
    : "";

  const bgMap: Record<string, string> = {
    colors: colorsBg,
    numbers: numbersBg,
    phonics: phonicsBg,
    shapes: shapesBg,
    letters: lettersBg,
    logic: logicBg,
  };

  const backgroundImage = bgMap[category || "colors"];

  const categoryMap: Record<string, string> = {
    numbers: "Numbers",
    letters: "Alphabets",
    phonics: "Phonics",
    colors: "Colors",
    shapes: "Shapes",
    logic: "Logic",
  };

  useEffect(() => {
    const fetchLessonVideo = async () => {
      if (!category) return;

      setLoading(true);

      const dbCategory = categoryMap[category] || formattedCategory;

      const user = JSON.parse(localStorage.getItem("user") || "null");
      const userGradeLevel = user?.grade_level || user?.gradeLevel || null;

      let query = supabase
        .from("video_lessons")
        .select("*")
        .eq("category", dbCategory)
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (userGradeLevel) {
        query = query.eq("grade_level", userGradeLevel);
      }

      const { data, error } = await query.limit(1).maybeSingle();

      if (error) {
        console.error("Error fetching lesson:", error.message);
        setLessonVideoUrl("");
        setLessonTitle("");
        setLoading(false);
        return;
      }

      if (!data) {
        setLessonVideoUrl("");
        setLessonTitle("");
        setLoading(false);
        return;
      }

      setLessonTitle(data.title);

      const { data: publicData } = supabase.storage
        .from("lesson-videos")
        .getPublicUrl(data.video_path);

      setLessonVideoUrl(publicData.publicUrl);
      setLoading(false);
    };

    fetchLessonVideo();
  }, [category, formattedCategory]);

  return (
    <div
      className="lesson-page"
      style={{
        backgroundImage: `url(${backgroundImage})`,
      }}
    >
      <button className="back-btn" onClick={() => navigate("/student")}>
        ← Back
      </button>

      <h1 className="lesson-title">{formattedCategory} Lesson</h1>

      <div className="tv-wrapper">
        <div className="tv-container">
          {loading ? (
            <p className="no-video">Loading lesson...</p>
          ) : lessonVideoUrl ? (
            <video controls>
              <source src={lessonVideoUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          ) : (
            <p className="no-video">No videos yet</p>
          )}
        </div>

        {!loading && lessonTitle && <p className="video-title">{lessonTitle}</p>}

        {!loading && category === "colors" && lessonVideoUrl && (
          <button
            className="start-quest-btn"
            onClick={() => navigate("/quest/colors")}
          >
            Start Colors Activity
          </button>
        )}
      </div>
    </div>
  );
}