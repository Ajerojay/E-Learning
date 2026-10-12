import React, { useEffect, useState } from "react";
import "./ParentProgress.css";
import { useNavigate } from "react-router-dom";
import logo from "../../../../../images/learnease logo-no bg.png";
import {
  getChildDisplayFirstName,
  getChildDisplayName,
  getLocalUser,
  getOrCreateActiveChildId,
  normalizeSubjectKey,
  SUBJECT_KEYS,
  type SubjectKey,
} from "../../../../backend/childProgress";
import { getActiveChild, getChildCategoryProgress, getParentChildren } from "../../../../backend/supabaseData";
import { CHILD_AVATAR_UPDATED_EVENT, getStoredChildAvatar, normalizeChildAvatar } from "../../../../backend/childAvatar";
import { childAvatarById } from "../Student/childAvatars";
import { cacheOfflineCategoryProgress, cacheOfflineChild, getOfflineCategoryProgress, getOfflineChildrenFromSqlite } from "../../../../backend/offlineSqlite";
import BearLoading from "../../BearLoading";

type ChildProgressCard = {
  id: string;
  name: string;
  firstName: string;
  grade: string;
  avatarId: string;
  overall: number;
  categories: Record<SubjectKey, number>;
};

function emptyCategories(): Record<SubjectKey, number> {
  return Object.fromEntries(SUBJECT_KEYS.map((key) => [key, 0])) as Record<SubjectKey, number>;
}

function scoresFromRows(rows: Array<{ category_code: string; category_score: number }>): Record<SubjectKey, number> {
  const base = emptyCategories();
  for (const row of rows) {
    const key = normalizeSubjectKey(row.category_code);
    if (key) base[key] = Math.round(row.category_score || 0);
  }
  return base;
}

function overallFromScores(scores: Record<SubjectKey, number>) {
  const played = SUBJECT_KEYS.map((key) => scores[key]).filter((score) => score > 0);
  return played.length ? Math.round(played.reduce((sum, score) => sum + score, 0) / played.length) : 0;
}

export default function ParentProgress() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(true);
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ChildProgressCard[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [parentDone, setParentDone] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    const loadChildCard = async (id: string, nameRow: { child_name?: string | null; first_name?: string | null; last_name?: string | null }, grade?: string | null, avatar?: string | null): Promise<ChildProgressCard> => {
      let categories: Array<{ category_code: string; category_score: number }> = [];
      try {
        categories = await getChildCategoryProgress(id);
        await cacheOfflineCategoryProgress(id, categories.map(row => ({ categoryCode: row.category_code, categoryScore: row.category_score })));
      } catch {
        categories = await getOfflineCategoryProgress(id);
      }
      const mapped = scoresFromRows(categories);
      const played = categories.map((row) => Math.round(row.category_score || 0));
      return {
        id,
        name: getChildDisplayName(nameRow),
        firstName: getChildDisplayFirstName(nameRow),
        grade: grade?.trim() || "Kinder",
        avatarId: normalizeChildAvatar(avatar) || getStoredChildAvatar(id),
        overall: played.length ? Math.round(played.reduce((sum, score) => sum + score, 0) / played.length) : overallFromScores(mapped),
        categories: mapped,
      };
    };

    const loadProgress = async () => {
      setLoading(true);
      const activeId = await getOrCreateActiveChildId();
      const localUser = getLocalUser();
      const parentId = localUser?.role === "parent" ? String(localUser.id || "") : "";
      let cards: ChildProgressCard[] = [];

      try {
        const roster = parentId ? await getParentChildren(parentId) : [];
        if (roster.length) {
          const connected = roster.filter((kid) => kid.isActive !== false);
          await Promise.all(connected.map((kid) => cacheOfflineChild({
            id: kid.id,
            parentId: kid.parentId,
            childName: kid.childName,
            firstName: kid.firstName,
            lastName: kid.lastName,
            pinCode: kid.pinCode,
            isActive: kid.isActive,
          })));
          const named = connected.filter((kid) => getChildDisplayName({
            child_name: kid.childName,
            first_name: kid.firstName,
            last_name: kid.lastName,
          }) !== "Child");
          const visible = named.length ? named : connected;
          cards = await Promise.all(visible.map((kid) => loadChildCard(
            kid.id,
            { child_name: kid.childName, first_name: kid.firstName, last_name: kid.lastName },
            kid.gradeLevel,
            kid.avatar,
          )));
        }
      } catch {
        cards = [];
      }

      if (!cards.length) {
        try {
          const cachedKids = await getOfflineChildrenFromSqlite();
          const connectedKids = cachedKids.filter((kid) =>
            parentId && kid.parent_id === parentId && kid.is_active !== 0
          );
          if (connectedKids.length) {
            cards = await Promise.all(connectedKids.map((kid) => loadChildCard(
              kid.id,
              { child_name: kid.child_name, first_name: kid.first_name, last_name: kid.last_name },
            )));
          }
        } catch {
          cards = [];
        }
      }

      if (!cards.length && activeId) {
        try {
          const child = await getActiveChild(activeId);
          if (child?.parentId === parentId && child.isActive !== false) {
            cards = [await loadChildCard(
              activeId,
              { child_name: child.childName, first_name: child.firstName, last_name: child.lastName },
              child.gradeLevel,
              child.avatar,
            )];
          }
        } catch {
          const cached = (await getOfflineChildrenFromSqlite()).find((row) =>
            row.id === activeId && parentId && row.parent_id === parentId && row.is_active !== 0
          );
          if (cached) {
            cards = [await loadChildCard(
              activeId,
              { child_name: cached.child_name, first_name: cached.first_name, last_name: cached.last_name },
            )];
          }
        }
      }

      if (cancelled) return;
      setChildren(cards);
      setSelectedChildId((current) => {
        if (current && cards.some((card) => card.id === current)) return current;
        if (activeId && cards.some((card) => card.id === activeId)) return activeId;
        return cards[0]?.id ?? null;
      });
      setLoading(false);
    };

    void loadProgress();
    const onFocus = () => {
      void loadProgress();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadProgress();
    };
    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ childId?: string; avatarId?: string }>).detail;
      if (!detail?.childId || !detail.avatarId) return;
      setChildren(current => current.map(child => child.id === detail.childId ? { ...child, avatarId: detail.avatarId! } : child));
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(CHILD_AVATAR_UPDATED_EVENT, onAvatarUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(CHILD_AVATAR_UPDATED_EVENT, onAvatarUpdated);
    };
  }, []);

  const sidebarIcons = import.meta.glob("../../../../../images/sidebar/*", {
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
    if (score >= 100) return "Excellent";
    if (score >= 67) return "Good";
    if (score > 0) return "Needs Practice";
    return "Getting Started";
  };

  const subjects: { key: SubjectKey; label: string; icon: string }[] = [
    { key: "colors", label: "Colors", icon: "\u{1F3A8}" },
    { key: "shapes", label: "Shapes", icon: "\u{1F532}" },
    { key: "letters", label: "Letters", icon: "\u{1F524}" },
    { key: "numbers", label: "Numbers", icon: "\u{1F522}" },
    { key: "phonics", label: "Phonics", icon: "\u{1F5E3}\uFE0F" },
    { key: "logic", label: "Logic", icon: "\u{1F9E9}" },
  ];

  const selectedChild = children.find((child) => child.id === selectedChildId) ?? children[0];

  useEffect(() => {
    if (!selectedChild?.id) {
      setParentDone({});
      return;
    }
    const next: Record<string, number> = {};
    for (const key of SUBJECT_KEYS) {
      const cardKey = `parentTimeCardsDone:${selectedChild.id}:${key}`;
      const savedCards = localStorage.getItem(cardKey);
      if (savedCards !== null) {
        const mask = Number(savedCards) || 0;
        if (mask > 0) next[key] = mask;
      } else {
        const legacyCount = Number(localStorage.getItem(`parentTimeDone:${selectedChild.id}:${key}`)) || 0;
        if (legacyCount > 0) next[key] = legacyCount >= 2 ? 3 : 1;
      }
    }
    setParentDone(next);
  }, [selectedChild?.id]);

  const toggleParentActivity = (key: SubjectKey, activityIndex: number) => {
    if (!selectedChild?.id) return;
    const activityBit = 1 << activityIndex;
    setParentDone((current) => {
      const nextMask = (current[key] ?? 0) ^ activityBit;
      localStorage.setItem(`parentTimeCardsDone:${selectedChild.id}:${key}`, String(nextMask));
      return { ...current, [key]: nextMask };
    });
  };

  const childName = selectedChild?.name || "Child";
  const childFirstName = selectedChild?.firstName || "Child";
  const safeProgress = selectedChild?.categories ?? emptyCategories();

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
    offlineExtra: string;
    offlineExtraDesc: string;
    offlineThird: string;
    offlineThirdDesc: string;
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
      onlineButton: "\u2014",
      onlineRoute: "",
      offlineTitle: "PARENT TIME",
      offlineAction: "No activity yet",
      offlineDesc:
        "There is no recommended parent-guided activity at the moment.",
      offlineExtra: "",
      offlineExtraDesc: "",
      offlineThird: "",
      offlineThirdDesc: "",
    };

    if (score <= 0) return baseNoActivity;

    const statusPrefix =
      score >= 100 ? "Excellent" : score >= 67 ? "Good" : score >= 30 ? "Needs Practice" : "Getting Started";
    const mastered = score >= 100;

    const common: Recommendation = {
      ...baseNoActivity,
      title: "",
      status: `Current Status: ${statusPrefix} (${score}%)`,
      onlineButton: "\u25B6 Play Now",
      offlineExtra: "",
      offlineExtraDesc: "",
    };

    switch (key) {
      case "colors":
        return {
          ...common,
          title: "COLORS FOCUS",
          intro: mastered
            ? `${childFirstName} earned 3 stars on all 3 Colors games. A short replay will keep that sharp.`
            : `${childFirstName} is still learning colors. 100% means all 3 games finished with 3 stars, even when a game is finished on time.`,
          childDid: mastered
            ? `${childFirstName} finished every Colors game with 3 stars and did not need lots of extra tries.`
            : `${childFirstName} has not mastered all 3 Colors games yet. Missed answers and extra tries keep a game under 3 stars.`,
          onlineTitle: "SCREEN TIME (5m)",
          onlineAction: "Replay Colors Game",
          onlineDesc: mastered
            ? "Replay one Colors game together and notice if the stars stay at 3."
            : "Replay the Colors games that are still under 3 stars.",
          onlineRoute: "/quest/colors",
          offlineTitle: "PARENT TIME (10m)",
          offlineAction: "Color Hunt",
          offlineDesc: "Ask her to find red, blue, and yellow objects around the house and name each one.",
          offlineExtra: "Laundry Colors",
          offlineExtraDesc: "Sort shirts or socks into color piles and name each pile out loud.",
          offlineThird: "Color Mixing",
          offlineThirdDesc: "Mix two paint or food colors together and guess what new color they will make.",
        };
      case "shapes":
        return {
          ...common,
          title: "SHAPES FOCUS",
          intro: mastered
            ? `${childFirstName} earned 3 stars on all 3 Shapes games.`
            : `${childFirstName} is still mixing up some shapes. Finishing one game on time is not enough for 100%.`,
          childDid: mastered
            ? `${childFirstName} finished every Shapes game with 3 stars.`
            : `${childFirstName} still needs 3 stars on all 3 Shapes games. Extra tries lower the stars.`,
          onlineTitle: "SCREEN TIME (10m)",
          onlineAction: "Shape Sorter Adventure",
          onlineDesc: mastered
            ? "Replay a Shapes game and talk about which shape came next."
            : "Replay the Shapes games that are still under 3 stars.",
          onlineRoute: "/quest/shapes",
          offlineTitle: "PARENT TIME (15m)",
          offlineAction: "Shape Hunt at Home",
          offlineDesc: "Look for circles, rectangles, and triangles around the house together.",
          offlineExtra: "Snack Shapes",
          offlineExtraDesc: "Before a snack, name the shape of the plate, crackers, or fruit slices.",
          offlineThird: "Build a Shape",
          offlineThirdDesc: "Use blocks or paper to build a shape, then count its sides and corners together.",
        };
      case "letters":
        return {
          ...common,
          title: "LETTERS PRACTICE",
          intro: mastered
            ? `${childFirstName} earned 3 stars on every level of all 3 Letters games.`
            : `${childFirstName} has started letters. The score adds every level: 3 games, 3 levels each, up to 3 stars.`,
          childDid: mastered
            ? `${childFirstName} finished every Letters level with 3 stars.`
            : `${childFirstName}'s finished letter levels are counted. 100% needs 3 stars on all 9 levels.`,
          onlineTitle: "SCREEN TIME (8m)",
          onlineAction: "Replay Letters Game",
          onlineDesc: mastered
            ? "Replay a Letters game and ask her to say each letter out loud."
            : "Replay the Letters games that do not have 3 stars yet.",
          onlineRoute: "/quest/letter",
          offlineTitle: "PARENT TIME (10m)",
          offlineAction: "Alphabet Cards",
          offlineDesc: "Write letters on paper and ask her to find something that starts with each one.",
          offlineExtra: "Letter Walk",
          offlineExtraDesc: "Look for the first letter of her name on books, boxes, or signs.",
          offlineThird: "Name Letter Search",
          offlineThirdDesc: "Find and point out the letters in her name on a book cover or package.",
        };
      case "numbers":
        return {
          ...common,
          title: "NUMBERS PRACTICE",
          intro: mastered
            ? `${childFirstName} earned 3 stars on all 3 Numbers games.`
            : `${childFirstName} is still building number sense. One finished game does not make the subject 100%.`,
          childDid: mastered
            ? `${childFirstName} finished every Numbers game with 3 stars.`
            : `${childFirstName} still needs 3 stars on all 3 Numbers games. Extra tries lower the stars.`,
          onlineTitle: "SCREEN TIME (8m)",
          onlineAction: "Replay Numbers Game",
          onlineDesc: mastered
            ? "Replay a Numbers game and count along with her."
            : "Replay the Numbers games that are still under 3 stars.",
          onlineRoute: "/quest/number",
          offlineTitle: "PARENT TIME (10m)",
          offlineAction: "Count Around the House",
          offlineDesc: "Count steps, toys, or snacks together and compare the numbers out loud.",
          offlineExtra: "Snack Count",
          offlineExtraDesc: "Count a small pile of snacks into her hand, then ask her to count them back.",
          offlineThird: "Number Hop",
          offlineThirdDesc: "Count aloud while hopping or clapping, and take turns choosing the next number.",
        };
      case "phonics":
        return {
          ...common,
          title: "PHONICS INTRO",
          intro: mastered
            ? `${childFirstName} earned 3 stars on all 3 Phonics games.`
            : `${childFirstName} still needs listening practice. Finishing on time with many tries is not 3 stars.`,
          childDid: mastered
            ? `${childFirstName} finished every Phonics game with 3 stars.`
            : `${childFirstName} has not earned 3 stars on all 3 Phonics games yet.`,
          onlineTitle: "LISTEN & LEARN (5m)",
          onlineAction: "Replay Phonics Game",
          onlineDesc: mastered
            ? "Replay a Phonics game and pause so she can say the sound first."
            : "Replay the Phonics games that are still under 3 stars.",
          onlineRoute: "/student/PhonicsQuestPage",
          offlineTitle: "TALK TOGETHER (10m)",
          offlineAction: "Animal Sounds Game",
          offlineDesc: "Make an animal sound and ask her to guess which animal it is.",
          offlineExtra: "First Sound Game",
          offlineExtraDesc: "Say a short word slowly and ask which sound she hears at the beginning.",
          offlineThird: "Sound Hunt",
          offlineThirdDesc: "Choose an easy sound and find objects nearby whose names begin with that sound.",
        };
      case "logic":
      default:
        return {
          ...common,
          title: "LOGIC FOCUS",
          intro: mastered
            ? `${childFirstName} earned 3 stars on all 3 Logic games.`
            : `${childFirstName} is still learning patterns. 100% needs 3 stars on all 3 games.`,
          childDid: mastered
            ? `${childFirstName} finished every Logic game with 3 stars.`
            : `${childFirstName} sometimes needs another try. Those extra tries keep Logic under 100%.`,
          onlineTitle: "SCREEN TIME (10m)",
          onlineAction: "Replay Logic Game",
          onlineDesc: mastered
            ? "Replay a Logic game and ask her why the next piece fits."
            : "Replay the Logic games that are still under 3 stars.",
          onlineRoute: "/quest/logic",
          offlineTitle: "PARENT TIME (10m)",
          offlineAction: "Pattern at Home",
          offlineDesc: "Make a simple pattern with toys and ask her what comes next.",
          offlineExtra: "Clap the Pattern",
          offlineExtraDesc: "Clap a short pattern, ask her to copy it, then let her make one for you.",
          offlineThird: "Color Pattern Train",
          offlineThirdDesc: "Line up two colors of toys in a repeating pattern and ask what comes next.",
        };
    }
  };

  return (
    <div className="pp-wrapper pp-mobile-parent">
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
                "\u{1F3E0}"
              )}
            </span>
            <span className="pp-nav-label">HOMEPAGE</span>
          </button>

          <button
            type="button"
            className="pp-nav-item"
            title="Your child"
            onClick={() => navigate("/parent-children")}
          >
            <span className="pp-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("child") ? (
                <img className="pp-nav-img" src={getSidebarIconSrc("child")} alt="" />
              ) : (
                "\u{1F476}"
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
                "\u{1F4C8}"
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
                "\u{1F6AA}"
              )}
            </span>
            <span className="pp-nav-label">LOGOUT</span>
          </button>
        </nav>
      </aside>

      <div className={`pp-main${loading ? " is-loading" : ""}`}>
        {!loading && (
          <header className="pp-top-header">
            <div className="pp-brand">
              <img src={logo} alt="LearnEase logo" className="pp-logo" />
              <span className="pp-brand-text">LearnEase</span>
            </div>
            <button className="pp-bell-icon">&#128276;</button>
          </header>
        )}

        <main className="pp-content">
          {loading ? (
            <BearLoading compact />
          ) : (
            <>
          <section className="pp-heading-card">
            <h1>Your Children&apos;s Progress</h1>
          </section>

          <section className="pp-children-list">
            {children.map((child) => {
              const selected = child.id === (selectedChild?.id ?? child.id);
              const avatar = childAvatarById(child.avatarId);
              return (
                <button
                  type="button"
                  key={child.id}
                  className={`pp-summary-row${selected ? " is-selected" : ""}`}
                  onClick={() => setSelectedChildId(child.id)}
                >
                  <div className="pp-child-card">
                    <div className="pp-avatar">
                      {avatar ? <img src={avatar.src} alt="" /> : <span aria-hidden="true">&#129528;</span>}
                    </div>
                    <div>
                      <h2>{child.name}</h2>
                      <p className="pp-grade">{child.grade}</p>
                    </div>
                  </div>

                  <div className="pp-overall-card">
                    <div
                      className="pp-circle"
                      style={{
                        background: `conic-gradient(#6fce86 0 ${Math.round(child.overall)}%, #e4dff2 ${Math.round(child.overall)}% 100%)`,
                      }}
                      role="img"
                      aria-label={`${child.name} overall progress ${Math.round(child.overall)} percent`}
                    >
                      <span>{Math.round(child.overall)}%</span>
                    </div>
                    <p className="pp-overall-label">Overall</p>
                  </div>
                </button>
              );
            })}
            {!children.length && (
              <p className="pp-empty-state">No connected child was found for this parent account.</p>
            )}
          </section>

          {selectedChild && <>
          <section className="pp-grid">
            {subjects.map((sub) => {
              const score = safeProgress[sub.key] || 0;
              const status = getStatus(score);
              const statusTone =
                status === "Excellent" ? "excellent" : status === "Good" ? "good" : status === "Needs Practice" ? "practice" : "start";
              return (
                <div key={sub.key} className={`pp-subject-card pp-subject-card--${sub.key}`}>
                  <div className="pp-subject-header">
                    <span className="pp-subject-icon">{sub.icon}</span>
                    <h3>{sub.label}</h3>
                    <span className="pp-percent">{score}%</span>
                  </div>

                  <div
                    className="pp-bar"
                    role="progressbar"
                    aria-valuenow={score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${sub.label} progress`}
                  >
                    <div className="pp-fill" style={{ width: `${score}%` }}></div>
                  </div>

                  <p className={`pp-status pp-status--${statusTone}`}>{status}</p>
                </div>
              );
            })}
          </section>

          <section className="pp-recommended">
            <div className="pp-recommended-title">
              <span>&#11088;</span>
              <h2>
                RECOMMENDED FOR <span>{childName.toUpperCase()}</span>
              </h2>
            </div>

            <p className="pp-recommended-sub">
              Based on her recent activity, here are the best ways to help her improve.
            </p>

            {subjects.map((sub) => {
              const score = safeProgress[sub.key] || 0;
              const status = getStatus(score);
              const statusTone =
                status === "Excellent" ? "excellent" : status === "Good" ? "good" : status === "Needs Practice" ? "practice" : "start";
              const rec = buildRecommendationForSubject(sub.key, score);
              const cardClass = `pp-recommend-card pp-recommend-card--${sub.key}`;

              return (
                <div key={sub.key} className={cardClass}>
                  <div className="pp-tag">{rec.title || `${sub.label.toUpperCase()} FOCUS`}</div>
                  <h3 className={`pp-rec-status pp-rec-status--${statusTone}`}>
                    <span className="pp-rec-emoji" aria-hidden="true">{sub.icon}</span>
                    {rec.status}
                  </h3>
                  <p className="pp-rec-intro">{rec.intro}</p>

                  <div className="pp-recommend-actions">
                    <div className="pp-recommend-box pp-recommend-box--screen">
                      <p className="pp-mini-title">&#128241; {rec.onlineTitle}</p>
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

                    <div className="pp-recommend-box pp-recommend-box--home">
                      <p className="pp-mini-title">&#127968; {rec.offlineTitle}</p>
                      <div className="pp-parent-activity-track" aria-label={`${sub.label} parent activities`}>
                        {[
                          { title: rec.offlineAction, description: rec.offlineDesc },
                          { title: rec.offlineExtra, description: rec.offlineExtraDesc },
                          { title: rec.offlineThird, description: rec.offlineThirdDesc },
                        ].filter((activity) => activity.title).map((activity, activityIndex) => {
                          const checked = ((parentDone[sub.key] ?? 0) & (1 << activityIndex)) !== 0;
                          return (
                            <article
                              key={`${sub.key}-${activityIndex}`}
                              className={`pp-parent-activity-card${checked ? " is-checked" : ""}`}
                              aria-label={`${activity.title}, ${checked ? "done" : "not done"}`}
                            >
                              <div className="pp-parent-activity-status">
                                <span className="pp-parent-activity-check" aria-hidden="true">{checked ? "✓" : ""}</span>
                                <span>{checked ? "DONE" : "NOT DONE"}</span>
                              </div>
                              <h4>{activity.title}</h4>
                              <p>{activity.description}</p>
                              <button
                                type="button"
                                aria-pressed={checked}
                                onClick={() => toggleParentActivity(sub.key, activityIndex)}
                              >
                                {checked ? "Mark as not done" : "Mark as done"}
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
          </>}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
