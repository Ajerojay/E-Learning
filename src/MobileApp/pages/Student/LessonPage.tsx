import "./LessonPage.css";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
// ===== SUPABASE DATABASE CONNECTION: lessons shared by web and Android app =====
import { supabase } from "../../../lib/supabase";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { isStudentGameAllowed } from "../../../lib/studentGameAccess";
import {
  createOfflineLessonUrl,
  getOfflineLesson,
  getStudentLessonDownload,
  getStudentLessonMeta,
  hasStudentLessonDownload,
  saveStudentLessonDownload,
  studentLessonDownloadId,
} from "../../../lib/offlineLessonStore";
import { cacheOfflineLessons } from "../../../lib/offlineSqlite";


import colorsBg from "./images/colors-bg.png";
import numbersBg from "./images/numbers-bg.jpg";
import phonicsBg from "./images/phonics-bg.jpg";
import shapesBg from "./images/shapes-bg.jpg";
import lettersBg from "./images/letters-bg.jpg";
import logicBg from "./images/logic-bg.jpg";

const CATEGORY_MAP: Record<string, string> = {
  numbers: "Numbers",
  letters: "Alphabets",
  phonics: "Phonics",
  colors: "Colors",
  shapes: "Shapes",
  logic: "Logic",
};

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
  const [onlineVideoUrl, setOnlineVideoUrl] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState("");
  const [activeChildId, setActiveChildId] = useState<string | null>(localStorage.getItem("activeChildId"));
  const blobUrlRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);

  const setPlaybackUrl = (url: string, isBlob = false) => {
    if (blobUrlRef.current && blobUrlRef.current !== url) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (isBlob) blobUrlRef.current = url;
    setLessonVideoUrl(url);
  };

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
  const dbCategory = CATEGORY_MAP[category || ""] || formattedCategory;

  useEffect(() => {
    void getOrCreateActiveChildId().then(childId => {
      if (childId && childId !== activeChildId) setActiveChildId(childId);
      if (childId && category && !isStudentGameAllowed(childId, category)) navigate("/student", { replace: true, state: { blockedGame: category } });
    });
  }, [activeChildId, category, navigate]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  useEffect(() => {
    window.AndroidOrientation?.allowGameRotation?.();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const player = playerRef.current;
    if (!video) return;

    const allowLandscapeIfUserRotates = () => {
      window.AndroidOrientation?.allowGameRotation?.();
      const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
      try {
        orientation?.unlock?.();
      } catch {
        /* Some browsers only allow this during fullscreen. */
      }
    };

    const syncFullscreenState = () => {
      const fullscreenElement =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      const active =
        fullscreenElement === video ||
        fullscreenElement === player ||
        fullscreenElement === player?.parentElement;
      setIsVideoFullscreen(Boolean(active));
      if (active) allowLandscapeIfUserRotates();
    };

    video.addEventListener("webkitbeginfullscreen", allowLandscapeIfUserRotates);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);

    return () => {
      video.removeEventListener("webkitbeginfullscreen", allowLandscapeIfUserRotates);
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, [lessonVideoUrl]);

  const toggleVideoFullscreen = async () => {
    window.AndroidOrientation?.allowGameRotation?.();
    const player = playerRef.current;
    const video = videoRef.current;
    const fullscreenElement =
      document.fullscreenElement ||
      (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;

    if (fullscreenElement || isVideoFullscreen) {
      const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
      try {
        await (document.exitFullscreen || doc.webkitExitFullscreen)?.call(document);
      } catch {
        /* Native Android overlay handles exit. */
      }
      setIsVideoFullscreen(false);
      return;
    }

    const target = player ?? video;
    const request =
      target?.requestFullscreen ||
      (target as (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }) | null)?.webkitRequestFullscreen;
    try {
      await request?.call(target);
      setIsVideoFullscreen(true);
    } catch {
      setIsVideoFullscreen(true);
    }
  };

  useEffect(() => {
    if (!activeChildId || !dbCategory) return;
    void hasStudentLessonDownload(activeChildId, dbCategory, onlineVideoUrl).then(ready => {
      if (ready) setOfflineReady(true);
    });
  }, [activeChildId, dbCategory, onlineVideoUrl]);

  useEffect(() => {
    const fetchLessonVideo = async () => {
      if (!category) return;

      setLoading(true);
      setOfflineMessage("");

      const childId = localStorage.getItem("activeChildId") || activeChildId;
      const online = typeof navigator === "undefined" ? true : navigator.onLine;

      const playSavedBlob = async () => {
        if (!childId) return false;
        try {
          const saved = await getStudentLessonDownload(childId, dbCategory);
          if (!saved?.video) return false;
          const meta = await getStudentLessonMeta(childId, dbCategory);
          setLessonTitle(saved.title || meta?.title || `${formattedCategory} Lesson`);
          setOnlineVideoUrl(saved.sourceUrl || meta?.sourceUrl || "");
          setPlaybackUrl(URL.createObjectURL(saved.video), true);
          setOfflineReady(true);
          return true;
        } catch (error) {
          console.error("Saved lesson lookup error:", error);
          return false;
        }
      };

      if (!online && (await playSavedBlob())) {
        setOfflineMessage("Ready to watch offline.");
        setLoading(false);
        return;
      }

      const user = JSON.parse(localStorage.getItem("user") || "null");
      const userGradeLevel = user?.grade_level || user?.gradeLevel || null;

      let lessonRows: Array<{
        id: string;
        title: string;
        description: string | null;
        grade_level: string | null;
        category: string;
        video_path: string;
        is_published: boolean;
      }> | null = null;
      let lessonError: { message: string } | null = null;

      if (online) {
        try {
          const query = supabase
            .from("video_lessons")
            .select("id,title,description,grade_level,category,video_path,is_published")
            .eq("category", dbCategory)
            .eq("is_published", true)
            .order("created_at", { ascending: false })
            .limit(10);
          const result = await Promise.race([
            query,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("offline-timeout")), 3000)),
          ]);
          lessonRows = result.data;
          lessonError = result.error;
        } catch (error) {
          console.warn("Lesson lookup timed out; using saved video.", error);
        }
      }

      const data = (lessonRows ?? []).find(
        lesson => !userGradeLevel || !lesson.grade_level || lesson.grade_level === userGradeLevel
      );

      if (lessonError) console.error("Lesson video lookup error:", lessonError.message);

      if (data) {
        void cacheOfflineLessons([{
          id: String(data.id),
          title: data.title,
          description: data.description,
          category: data.category,
          gradeLevel: data.grade_level,
          videoPath: data.video_path,
          isPublished: data.is_published,
        }]);
      }

      if (!data) {
        if (await playSavedBlob()) {
          setOfflineMessage("Ready to watch offline.");
          setLoading(false);
          return;
        }
        const offlineLesson = await getOfflineLesson(dbCategory);
        if (offlineLesson) {
          const offlineUrl = createOfflineLessonUrl(offlineLesson);
          setLessonTitle(offlineLesson.title);
          setOnlineVideoUrl(offlineUrl);
          setPlaybackUrl(offlineUrl, true);
          setOfflineReady(true);
          setOfflineMessage("Ready to watch offline.");
          setLoading(false);
          return;
        }
        setLessonVideoUrl("");
        setLessonTitle("");
        setOfflineReady(false);
        setLoading(false);
        return;
      }

      setLessonTitle(data.title);

      const videoPath = data.video_path?.trim() ?? "";
      let videoUrl = videoPath;
      if (!/^https?:\/\//i.test(videoPath)) {
        const { data: publicData } = supabase.storage
          .from("lesson-videos")
          .getPublicUrl(videoPath);
        videoUrl = publicData.publicUrl;
      }

      setOnlineVideoUrl(videoUrl);
      const downloaded = childId ? await hasStudentLessonDownload(childId, dbCategory, videoUrl) : false;
      setOfflineReady(downloaded);

      if (!online && downloaded) {
        await playSavedBlob();
        setOfflineMessage("Ready to watch offline.");
      } else {
        setPlaybackUrl(videoUrl);
        if (downloaded) setOfflineMessage("Saved. You can watch this even without internet.");
      }
      setLoading(false);
    };

    void fetchLessonVideo();
  }, [category, dbCategory, formattedCategory]);

  const downloadForOffline = async () => {
    if (!onlineVideoUrl || downloading || offlineReady) return;

    setDownloading(true);
    setOfflineMessage("");
    try {
      const childId = activeChildId || localStorage.getItem("activeChildId") || (await getOrCreateActiveChildId());
      if (!childId) {
        throw new Error("Log in with the child's PIN first so this lesson stays on their account.");
      }

      const response = await fetch(onlineVideoUrl, { mode: "cors", credentials: "omit" });
      if (!response.ok) {
        throw new Error(`Video download failed (${response.status}).`);
      }

      const video = await response.blob();
      if (!video.size) {
        throw new Error("The lesson video could not be saved.");
      }

      await saveStudentLessonDownload({
        id: studentLessonDownloadId(childId, dbCategory),
        childId,
        category: dbCategory,
        title: lessonTitle || `${formattedCategory} Lesson`,
        sourceUrl: onlineVideoUrl,
        videoType: video.type || "video/mp4",
        video,
        createdAt: Date.now(),
      });

      setOfflineReady(true);
      setOfflineMessage("Saved. You can watch this even without internet.");
    } catch (error) {
      console.error("Offline video download error:", error);
      setOfflineMessage(error instanceof Error ? error.message : "Could not save this lesson offline.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={`lesson-page${isVideoFullscreen ? " is-video-fullscreen" : ""}`}
      style={{
        backgroundImage: `url(${backgroundImage})`,
      }}
    >
      <button className="back-btn" onClick={() => navigate("/student")}>
        &#8592; Back
      </button>

      {!loading && lessonVideoUrl && (
        <button
          type="button"
          className={`offline-video-btn${offlineReady ? " is-offline" : ""}${downloading ? " is-saving" : ""}`}
          onClick={() => void downloadForOffline()}
          disabled={downloading || offlineReady}
          aria-label={offlineReady ? "Lesson saved. Ready to watch without internet." : "Save this lesson to watch later"}
          title={offlineReady ? "Saved — you can watch this even without internet" : "Save this lesson to watch later"}
        >
          <span className="offline-video-btn-icon" aria-hidden="true">
            {downloading ? "⏳" : offlineReady ? "⭐" : "📥"}
          </span>
          <span>{downloading ? "Saving..." : offlineReady ? "Saved!" : "Save video"}</span>
        </button>
      )}

      <h1 className="lesson-title">{formattedCategory} Lesson</h1>

      <div className="tv-wrapper">
        <div className="tv-container" ref={playerRef}>
          {loading ? (
            <p className="no-video">Loading lesson...</p>
          ) : lessonVideoUrl ? (
            <>
              <video
                ref={videoRef}
                key={lessonVideoUrl}
                src={lessonVideoUrl}
                controls
                playsInline
                preload="metadata"
              />
              <button
                type="button"
                className="video-fullscreen-btn"
                onClick={() => void toggleVideoFullscreen()}
                aria-label={isVideoFullscreen ? "Exit full screen" : "Watch in full screen"}
                title={isVideoFullscreen ? "Exit full screen" : "Full screen"}
              >
                {isVideoFullscreen ? <Minimize2 size={22} strokeWidth={2.6} /> : <Maximize2 size={22} strokeWidth={2.6} />}
              </button>
            </>
          ) : (
            <p className="no-video">No videos yet</p>
          )}
        </div>

        {!loading && lessonTitle && lessonVideoUrl && (
          <p className="video-title">{lessonTitle}</p>
        )}

        {offlineMessage && <p className="offline-video-message">{offlineMessage}</p>}

        {category === "phonics" && (
          <>
            <p className="lesson-activity-meta">
              listening choices &mdash; tap the speaker, then pick the animal!
            </p>
            <button
              type="button"
              className="start-quest-btn"
              onClick={() => navigate("/student/PhonicsQuestPage")}
            >
              &#128266; Start Phonics Quest
            </button>
          </>
        )}

        {category === "colors" && (
          <button
            type="button"
            className="start-quest-btn"
            onClick={() => navigate("/quest/colors")}
          >
            Start Colors Activity
          </button>
        )}

        {category === "logic" && (
          <>
            <p className="lesson-activity-meta">
              logic choices &mdash; drag the correct symbol into the box!
            </p>
            <button
              type="button"
              className="start-quest-btn"
              onClick={() =>
                navigate("/student/LogicQuestPage", {
                  state: { showStartPopup: true },
                })
              }
            >
              Start Logic Activity
            </button>
          </>
        )}

        {category === "numbers" && (
          <button
            type="button"
            className="start-quest-btn"
            onClick={() => navigate("/quest/number")}
          >
            Start Numbers Activity
          </button>
        )}

        {category === "letters" && (
          <>
            <p className="lesson-activity-meta">
              match each apple to the right letter basket!
            </p>
            <button
              type="button"
              className="start-quest-btn"
              onClick={() => navigate("/quest/letter")}
            >
              Start Letters Activity
            </button>
          </>
        )}

        {category === "shapes" && (
          <>
            <p className="lesson-activity-meta">
              drag shapes into the right spots to build the house!
            </p>
            <button
              type="button"
              className="start-quest-btn"
              onClick={() => navigate("/quest/shapes")}
            >
              Start Shapes Activity
            </button>
          </>
        )}
      </div>
    </div>
  );
}


