import React, { useEffect, useMemo, useState } from "react";
import "./ParentProgress.css";
import { useNavigate } from "react-router-dom";
import logo from "../../images/learnease logo-no bg.png";
import { supabase } from "../lib/supabase";
import {
  getFirstName,
  getOrCreateActiveChildId,
  SUBJECT_KEYS,
  type SubjectKey,
} from "../lib/childProgress";

type CategoryProgressRow = {
  category_code: SubjectKey;
  category_score: number;
};

export default function ParentProgress() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(true);
  const [loading, setLoading] = useState(true);
  const [childName, setChildName] = useState("Sofia Cruz");
  const [categoryRows, setCategoryRows] = useState<CategoryProgressRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadProgress = async () => {
      setLoading(true);
      const childId = await getOrCreateActiveChildId();
      if (!childId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const [{ data: child }, { data: categories }] = await Promise.all([
        supabase.from("children_accounts").select("child_name").eq("id", childId).maybeSingle(),
        supabase
          .from("v_child_category_progress")
          .select("category_code, category_score")
          .eq("child_id", childId),
      ]);

      if (cancelled) return;

      if (child?.child_name) {
        setChildName(child.child_name);
      }

      if (categories) {
        setCategoryRows(categories as CategoryProgressRow[]);
      }

      setLoading(false);
    };

    void loadProgress();
    const onFocus = () => {
      void loadProgress();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadProgress();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
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

  const subjects: { key: SubjectKey; label: string; icon: string }[] = [
    { key: "colors", label: "Colors", icon: "🎨" },
    { key: "shapes", label: "Shapes", icon: "🔺" },
    { key: "letters", label: "Letters", icon: "🔤" },
    { key: "numbers", label: "Numbers", icon: "🔢" },
    { key: "phonics", label: "Phonics", icon: "🗣️" },
    { key: "logic", label: "Logic", icon: "🧩" },
  ];

  const safeProgress = useMemo(() => {
    const base = Object.fromEntries(SUBJECT_KEYS.map((key) => [key, 0])) as Record<SubjectKey, number>;
    for (const row of categoryRows) {
      base[row.category_code] = Math.round(row.category_score || 0);
    }
    return base;
  }, [categoryRows]);

  const overall = Math.round(
    SUBJECT_KEYS.reduce((sum, key) => sum + (safeProgress[key] || 0), 0) / SUBJECT_KEYS.length
  );

  const childFirstName = getFirstName(childName);

  type Recommendation = {
    title: string;
    status: string;
    intro: string;
    childDid: string;
    onlineTitle: string;
    onlineAction: string;
    onlineDesc: string;
    onlineButton: string;
    onlineRoute: string;
    offlineTitle: string;
    offlineAction: string;
    offlineDesc: string;
    offlineButton: string;
  };

  const buildRecommendationForSubject = (
    key: SubjectKey,
    score: number
  ): Recommendation => {
    const baseNoActivity: Recommendation = {
      title: "NO RECOMMENDATION YET",
      status: "Current Status: None as of now",
      intro: `No ${key} activity data has been recorded yet.`,
      childDid:
        `Once ${childFirstName} starts and completes an activity here, this section will show personalized recommendations.`,
      onlineTitle: "SCREEN TIME",
      onlineAction: "No activity yet",
      onlineDesc: "There is no recommended screen-time activity at the moment.",
      onlineButton: "—",
      onlineRoute: "",
      offlineTitle: "PARENT TIME",
      offlineAction: "No activity yet",
      offlineDesc:
        "There is no recommended parent-guided activity at the moment.",
      offlineButton: "—",
    };

    if (score <= 0) return baseNoActivity;

    const statusPrefix =
      score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 30 ? "Needs Practice" : "Getting Started";

    const common: Recommendation = {
      ...baseNoActivity,
      title: "",
      status: `Current Status: ${statusPrefix} (${score}%)`,
      onlineButton: "▶ Play Now",
      offlineButton: "✅ Mark as done",
    };

    switch (key) {
      case "colors":
        return {
          ...common,
          title: "COLORS FOCUS",
          intro:
            score >= 80
              ? `${childFirstName} shows strong understanding of colors. A quick replay will keep skills sharp.`
              : `${childFirstName} is still learning to sort objects into the right color baskets.`,
          childDid:
            score >= 80
              ? `${childFirstName} completed the Colors activity with a great score.`
              : `${childFirstName} has started the Colors activity but still needs more practice.`,
          onlineTitle: "SCREEN TIME (5m)",
          onlineAction: "Replay Colors Game",
          onlineDesc: "Let her replay the Colors sorting game for extra practice.",
          onlineRoute: "/quest/colors",
          offlineTitle: "PARENT TIME (10m)",
          offlineAction: "Color Hunt",
          offlineDesc:
            "Ask her to find red, blue, and yellow objects around the house and name each one.",
        };
      case "shapes":
        return {
          ...common,
          title: "SHAPES FOCUS",
          intro:
            score >= 80
              ? `${childFirstName} is confident with basic shapes.`
              : `${childFirstName} is still mixing up some shapes like squares and rectangles.`,
          childDid:
            score >= 80
              ? `${childFirstName} can match most shapes correctly in the house-building activity.`
              : `${childFirstName} has started the shapes activity but still needs help matching shapes to the right spots.`,
          onlineTitle: "SCREEN TIME (10m)",
          onlineAction: "Shape Sorter Adventure",
          onlineDesc: "Drag shapes to the correct spots to build the house.",
          onlineRoute: "/quest/shapes",
          offlineTitle: "PARENT TIME (15m)",
          offlineAction: "Shape Hunt at Home",
          offlineDesc:
            "Look for objects shaped like circles, rectangles, and triangles around the house together.",
        };
      case "letters":
        return {
          ...common,
          title: "LETTERS PRACTICE",
          intro:
            score >= 80
              ? `${childFirstName} is recognizing letters very well.`
              : `${childFirstName} is still learning to match letters to the correct basket.`,
          childDid:
            score >= 80
              ? `${childFirstName} can sort most letters correctly in the apple-and-basket game.`
              : `${childFirstName} has begun matching letters but still needs more practice with A, B, C and beyond.`,
          onlineTitle: "SCREEN TIME (8m)",
          onlineAction: "Replay Letters Game",
          onlineDesc:
            "Let her play the apple letter sorting game again to strengthen recognition.",
          onlineRoute: "/quest/letter",
          offlineTitle: "PARENT TIME (10m)",
          offlineAction: "Alphabet Cards",
          offlineDesc:
            "Use letter cards or write letters on paper and ask her to find objects that start with each letter.",
        };
      case "numbers":
        return {
          ...common,
          title: "NUMBERS PRACTICE",
          intro:
            score >= 80
              ? `${childFirstName} can quickly count and match numbers.`
              : `${childFirstName} is still learning to count and match the correct number of raindrops.`,
          childDid:
            score >= 80
              ? `${childFirstName} finishes the counting raindrops game with strong accuracy.`
              : `${childFirstName} sometimes taps too many or too few raindrops when counting.`,
          onlineTitle: "SCREEN TIME (8m)",
          onlineAction: "Replay Numbers Game",
          onlineDesc:
            "Have her replay the counting raindrops game to build stronger number sense.",
          onlineRoute: "/quest/number",
          offlineTitle: "PARENT TIME (10m)",
          offlineAction: "Count Around the House",
          offlineDesc:
            "Count steps, toys, or snacks together and compare the numbers out loud.",
        };
      case "phonics":
        return {
          ...common,
          title: "PHONICS INTRO",
          intro:
            score >= 80
              ? `${childFirstName} is great at matching animal sounds to the right animal.`
              : `${childFirstName} is still getting used to animal sounds and needs more listening practice.`,
          childDid:
            score >= 80
              ? `${childFirstName} usually chooses the right animal after hearing the sound.`
              : `${childFirstName} sometimes guesses the wrong animal after hearing the sound.`,
          onlineTitle: "LISTEN & LEARN (5m)",
          onlineAction: "Replay Phonics Game",
          onlineDesc:
            "Let her replay the animal sound matching game to build listening skills.",
          onlineRoute: "/student/PhonicsQuestPage",
          offlineTitle: "TALK TOGETHER (10m)",
          offlineAction: "Animal Sounds Game",
          offlineDesc:
            "Make animal sounds together and ask her to guess which animal it is.",
        };
      case "logic":
      default:
        return {
          ...common,
          title: "LOGIC FOCUS",
          intro:
            score >= 80
              ? `${childFirstName} is doing very well with patterns and logic puzzles.`
              : `${childFirstName} is still learning to spot patterns and choose the correct next symbol.`,
          childDid:
            score >= 80
              ? `${childFirstName} can complete most logic levels without much help.`
              : `${childFirstName} sometimes picks the wrong symbol when finishing a pattern.`,
          onlineTitle: "SCREEN TIME (10m)",
          onlineAction: "Replay Logic Game",
          onlineDesc:
            "Encourage her to replay the pattern game and explain why each choice is correct.",
          onlineRoute: "/student/LogicQuestPage",
          offlineTitle: "PARENT TIME (10m)",
          offlineAction: "Pattern at Home",
          offlineDesc:
            "Create simple patterns with toys (car, car, block…) and ask her what comes next.",
        };
    }
  };

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
                <h2>{childName}</h2>
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
              const score = safeProgress[sub.key] || 0;
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
                RECOMMENDED FOR <span>{childName.toUpperCase()}</span>
              </h2>
            </div>

            <p className="pp-recommended-sub">
              Based on her recent activity, here are the best ways to help her improve.
            </p>

            {subjects.map((sub) => {
              const score = safeProgress[sub.key] || 0;
              const rec = buildRecommendationForSubject(sub.key, score);
              const cardClass = `pp-recommend-card pp-recommend-card--${sub.key}`;

              return (
                <div key={sub.key} className={cardClass}>
                  <div className="pp-tag">{rec.title || `${sub.label.toUpperCase()} FOCUS`}</div>
                  <h3>
                    {sub.icon} {rec.status}
                  </h3>
                  <p>{rec.intro}</p>
                  <p className="pp-child-did">{rec.childDid}</p>

                  <div className="pp-recommend-actions">
                    <div className="pp-recommend-box">
                      <p className="pp-mini-title">📱 {rec.onlineTitle}</p>
                      <strong>{rec.onlineAction}</strong>
                      <p>{rec.onlineDesc}</p>

                      {rec.onlineRoute ? (
                        <button onClick={() => navigate(rec.onlineRoute)}>
                          {rec.onlineButton}
                        </button>
                      ) : (
                        <button disabled>{rec.onlineButton}</button>
                      )}
                    </div>

                    <div className="pp-recommend-box">
                      <p className="pp-mini-title">🏠 {rec.offlineTitle}</p>
                      <strong>{rec.offlineAction}</strong>
                      <p>{rec.offlineDesc}</p>
                      <button disabled={score <= 0 || loading}>{rec.offlineButton}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}