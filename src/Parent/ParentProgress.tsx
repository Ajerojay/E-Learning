import React, { useEffect, useState } from "react";
import "./ParentProgress.css";
import { useNavigate } from "react-router-dom";
import logo from "../../images/learnease logo-no bg.png";

type ProgressItem = {
  score: number;
  completed: boolean;
  finished?: boolean;
  attempts?: number;
  lessonTitle?: string;
  activityTitle?: string;
};

type ProgressData = {
  [key: string]: ProgressItem;
};

export default function ParentProgress() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(true);
  const [progress, setProgress] = useState<ProgressData>({});

  useEffect(() => {
    const demoMode = localStorage.getItem("demoMode");

    if (demoMode === "true") {
      setProgress({});
      return;
    }

    const saved = JSON.parse(localStorage.getItem("progress") || "{}");
    setProgress(saved);
  }, []);

  const sidebarIcons = import.meta.glob("../../images/sidebar/*", {
    eager: true,
    import: "default",
  }) as Record<string, string>;

  const getSidebarIconSrc = (id: string) => {
    const idKey = id.toLowerCase().replace(/[^a-z]/g, "");
    const match = Object.entries(sidebarIcons).find(([path]) => {
      const file = path.split("/").pop()?.toLowerCase() || "";
      const base = file.replace(/\.[^/.]+$/, "");
      const baseKey = base.replace(/[^a-z]/g, "");
      return baseKey === idKey;
    });
    return match?.[1];
  };

  const getStatus = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score > 0) return "Needs Practice";
    return "Getting Started";
  };

  const subjects = [
    { key: "colors", label: "Colors", icon: "🎨" },
    { key: "shapes", label: "Shapes", icon: "🔺" },
    { key: "letters", label: "Letters", icon: "🔤" },
    { key: "numbers", label: "Numbers", icon: "🔢" },
    { key: "phonics", label: "Phonics", icon: "🗣️" },
    { key: "logic", label: "Logic", icon: "🧩" },
  ];

  const safeProgress = {
    colors: progress.colors || { score: 0, completed: false },
    shapes: progress.shapes || { score: 0, completed: false },
    letters: progress.letters || { score: 0, completed: false },
    numbers: progress.numbers || { score: 0, completed: false },
    phonics: progress.phonics || { score: 0, completed: false },
    logic: progress.logic || { score: 0, completed: false },
  };

  const overall =
    subjects.reduce(
      (sum, sub) => sum + (safeProgress[sub.key as keyof typeof safeProgress]?.score || 0),
      0
    ) / subjects.length;

  const hasRealColorsData =
    progress.colors &&
    typeof progress.colors.score === "number" &&
    typeof progress.colors.attempts === "number";

  const colorsData: ProgressItem = hasRealColorsData
    ? {
        score: progress.colors?.score || 0,
        completed: progress.colors?.completed || false,
        finished: progress.colors?.finished || false,
        attempts: progress.colors?.attempts || 0,
        lessonTitle: progress.colors?.lessonTitle || "Colors Lesson",
        activityTitle: progress.colors?.activityTitle || "Sort the Colors",
      }
    : {
        score: 0,
        completed: false,
        finished: false,
        attempts: 0,
        lessonTitle: "Colors Lesson",
        activityTitle: "Sort the Colors",
      };

  const getColorsRecommendation = () => {
    const score = colorsData.score || 0;
    const attempts = colorsData.attempts || 0;
    const finished = colorsData.finished || false;
    const lessonTitle = colorsData.lessonTitle || "Colors Lesson";
    const activityTitle = colorsData.activityTitle || "Sort the Colors";

    if (!hasRealColorsData) {
      return {
        title: "NO RECOMMENDATION YET",
        status: "Current Status: None as of now",
        intro: "No Colors activity data has been recorded yet.",
        childDid:
          "Once Sofia starts and completes an activity, this section will show personalized recommendations.",
        onlineTitle: "SCREEN TIME",
        onlineAction: "No activity yet",
        onlineDesc:
          "There is no recommended screen-time activity at the moment.",
        onlineButton: "—",
        onlineRoute: "",
        offlineTitle: "PARENT TIME",
        offlineAction: "No activity yet",
        offlineDesc:
          "There is no recommended parent-guided activity at the moment.",
        offlineButton: "—",
      };
    }

    if (!finished) {
      return {
        title: "COLORS SUPPORT",
        status: `Current Status: Not Finished (${score}%)`,
        intro:
          "Sofia has not finished the Colors activity yet. She may still be learning how to sort objects correctly.",
        childDid: `She started "${activityTitle}" but did not finish it yet.`,
        onlineTitle: "SCREEN TIME (5m)",
        onlineAction: "Replay Colors Game",
        onlineDesc: `Let her try "${activityTitle}" again to complete the task.`,
        onlineButton: "▶ Play Again",
        onlineRoute: "/quest/colors",
        offlineTitle: "PARENT TIME (10m)",
        offlineAction: "Color Basket Practice",
        offlineDesc:
          "Use red, blue, and yellow objects at home and ask her to sort them into groups.",
        offlineButton: "✅ Mark as done",
      };
    }

    if (attempts >= 6) {
      return {
        title: "COLORS REVIEW",
        status: `Current Status: Needs Video Review (${score}%)`,
        intro:
          "Sofia completed the activity, but she needed many attempts. Rewatching the lesson may help reinforce color recognition.",
        childDid: `She completed "${activityTitle}" with ${attempts} attempts, which suggests she may still be confusing some colors.`,
        onlineTitle: "SCREEN TIME (8m)",
        onlineAction: "Rewatch Colors Lesson",
        onlineDesc: `Let her rewatch "${lessonTitle}" before trying the activity again.`,
        onlineButton: "▶ Watch Lesson",
        onlineRoute: "/lesson/colors",
        offlineTitle: "PARENT TIME (10m)",
        offlineAction: "Find Colors Around",
        offlineDesc:
          "Ask her to find red, blue, and yellow items around the house and name each one.",
        offlineButton: "✅ Mark as done",
      };
    }

    if (attempts >= 3) {
      return {
        title: "COLORS PRACTICE",
        status: `Current Status: Improving (${score}%)`,
        intro:
          "Sofia is improving, but she still needs more practice to become confident.",
        childDid: `She completed "${activityTitle}" with ${attempts} attempts, so a repeat game would help strengthen her skills.`,
        onlineTitle: "SCREEN TIME (5m)",
        onlineAction: "Replay Colors Game",
        onlineDesc: `Encourage her to replay "${activityTitle}" one more time.`,
        onlineButton: "▶ Play Again",
        onlineRoute: "/quest/colors",
        offlineTitle: "PARENT TIME (8m)",
        offlineAction: "Color Sorting Game",
        offlineDesc:
          "Prepare simple colored objects at home and let her sort them into matching groups.",
        offlineButton: "✅ Mark as done",
      };
    }

    return {
      title: "COLORS ACHIEVED",
      status: `Current Status: Excellent (${score}%)`,
      intro:
        "Sofia did very well in the Colors activity and shows strong understanding.",
      childDid: `She completed "${activityTitle}" with only ${attempts} attempt(s), which shows good color recognition.`,
      onlineTitle: "SCREEN TIME (5m)",
      onlineAction: "Play Again for Fun",
      onlineDesc:
        "Let her replay the game for reinforcement or move on to another activity.",
      onlineButton: "▶ Play Now",
      onlineRoute: "/quest/colors",
      offlineTitle: "PARENT TIME (5m)",
      offlineAction: "Color Hunt",
      offlineDesc:
        "Ask her to find one red, one blue, and one yellow object around the house.",
      offlineButton: "✅ Mark as done",
    };
  };

  const colorsRecommendation = getColorsRecommendation();

  return (
    <div className="pp-wrapper">
      <aside
        className="pp-sidebar"
        data-collapsed={sidebarCollapsed ? "true" : "false"}
        onMouseEnter={() => setSidebarCollapsed(false)}
        onMouseLeave={() => setSidebarCollapsed(true)}
      >
        <nav className="pp-nav">
          <button
            type="button"
            className="pp-nav-item"
            title="Homepage"
            onClick={() => navigate("/parent-dashboard")}
          >
            <span className="pp-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("home") ? (
                <img className="pp-nav-img" src={getSidebarIconSrc("home")} alt="" />
              ) : (
                "🏠"
              )}
            </span>
            <span className="pp-nav-label">HOMEPAGE</span>
          </button>

          <button type="button" className="pp-nav-item" title="Your child">
            <span className="pp-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("child") ? (
                <img className="pp-nav-img" src={getSidebarIconSrc("child")} alt="" />
              ) : (
                "🧑‍🤝‍🧑"
              )}
            </span>
            <span className="pp-nav-label">YOUR CHILD</span>
          </button>

          <button type="button" className="pp-nav-item pp-active" title="Progress">
            <span className="pp-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("progress") ? (
                <img
                  className="pp-nav-img"
                  src={getSidebarIconSrc("progress")}
                  alt=""
                />
              ) : (
                "📈"
              )}
            </span>
            <span className="pp-nav-label">PROGRESS</span>
          </button>

          <button
            type="button"
            className="pp-nav-item pp-logout"
            title="Logout"
            onClick={() => {
              setSidebarCollapsed(true);
              navigate("/");
            }}
          >
            <span className="pp-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("logout") ? (
                <img
                  className="pp-nav-img"
                  src={getSidebarIconSrc("logout")}
                  alt=""
                />
              ) : (
                "🚪"
              )}
            </span>
            <span className="pp-nav-label">LOGOUT</span>
          </button>
        </nav>
      </aside>

      <div className="pp-main">
        <header className="pp-top-header">
          <div className="pp-brand">
            <img src={logo} alt="LearnEase Kids logo" className="pp-logo" />
            <span className="pp-brand-text">LearnEase Kids</span>
          </div>
          <button className="pp-bell-icon">🔔</button>
        </header>

        <main className="pp-content">
          <section className="pp-heading-card">
            <h1>Your Children’s Progress</h1>
          </section>

          <section className="pp-summary-row">
            <div className="pp-child-card">
              <div className="pp-avatar">🦄</div>
              <div>
                <h2>Sofia Cruz</h2>
                <p className="pp-grade">Kinder</p>
              </div>
            </div>

            <div className="pp-overall-card">
              <div
                className="pp-circle"
                style={{
                  background: `conic-gradient(#c4e4c1 0 ${Math.round(
                    overall
                  )}%, #f2efe8 ${Math.round(overall)}% 100%)`,
                }}
              >
                <span>{Math.round(overall)}%</span>
              </div>
            </div>
          </section>

          <section className="pp-grid">
            {subjects.map((sub) => {
              const score = safeProgress[sub.key as keyof typeof safeProgress]?.score || 0;
              return (
                <div key={sub.key} className="pp-subject-card">
                  <div className="pp-subject-header">
                    <span className="pp-subject-icon">{sub.icon}</span>
                    <h3>{sub.label}</h3>
                  </div>

                  <div className="pp-bar">
                    <div className="pp-fill" style={{ width: `${score}%` }}></div>
                  </div>

                  <div className="pp-row">
                    <span className="pp-percent">{score}%</span>
                  </div>

                  <p className="pp-status">Status: {getStatus(score)}</p>
                </div>
              );
            })}
          </section>

          <section className="pp-recommended">
            <div className="pp-recommended-title">
              <span>⭐</span>
              <h2>
                RECOMMENDED FOR <span>SOFIA</span>
              </h2>
            </div>

            <p className="pp-recommended-sub">
              Based on her recent activity, here are the best ways to help her improve.
            </p>

            <div className="pp-recommend-card blue">
              <div className="pp-tag">{colorsRecommendation.title}</div>
              <h3>🎨 {colorsRecommendation.status}</h3>
              <p>{colorsRecommendation.intro}</p>
              <p className="pp-child-did">{colorsRecommendation.childDid}</p>

              <div className="pp-recommend-actions">
                <div className="pp-recommend-box">
                  <p className="pp-mini-title">📱 {colorsRecommendation.onlineTitle}</p>
                  <strong>{colorsRecommendation.onlineAction}</strong>
                  <p>{colorsRecommendation.onlineDesc}</p>

                  {colorsRecommendation.onlineRoute ? (
                    <button onClick={() => navigate(colorsRecommendation.onlineRoute)}>
                      {colorsRecommendation.onlineButton}
                    </button>
                  ) : (
                    <button disabled>{colorsRecommendation.onlineButton}</button>
                  )}
                </div>

                <div className="pp-recommend-box">
                  <p className="pp-mini-title">🏠 {colorsRecommendation.offlineTitle}</p>
                  <strong>{colorsRecommendation.offlineAction}</strong>
                  <p>{colorsRecommendation.offlineDesc}</p>
                  <button disabled={!hasRealColorsData}>
                    {colorsRecommendation.offlineButton}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}