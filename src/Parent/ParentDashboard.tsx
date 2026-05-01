import React from "react";
import "./ParentDashboard.css";
import { useNavigate } from "react-router-dom";
import logo from "../../images/learnease logo-no bg.png";
import { supabase } from "../lib/supabase";
import { getOrCreateActiveChildId, getFirstName } from "../lib/childProgress";

export default function ParentDashboard() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(true);
  const [childName, setChildName] = React.useState("Child");
  const [overallProgress, setOverallProgress] = React.useState(0);
  const [recentActivity, setRecentActivity] = React.useState("No activity yet");

  const sidebarIcons = import.meta.glob("../../images/sidebar/*", {
    eager: true,
    import: "default",
  }) as Record<string, string>;

  const getSidebarIconSrc = (id: string) => {
    const idKey = id.toLowerCase().replace(/[^a-z]/g, "");
    const match = Object.entries(sidebarIcons).find(([path]) => {
      const file = path.split("/").pop()?.toLowerCase() || "";
      const base = file.replace(/\.[^/.]+$/, ""); // remove extension
      const baseKey = base.replace(/[^a-z]/g, ""); // strip spaces, digits, symbols
      return baseKey === idKey;
    });
    return match?.[1];
  };

  React.useEffect(() => {
    const loadDashboardData = async () => {
      const childId = await getOrCreateActiveChildId();
      if (!childId) return;

      const [{ data: child }, { data: overall }, { data: latest }] = await Promise.all([
        supabase.from("children_accounts").select("child_name").eq("id", childId).maybeSingle(),
        supabase
          .from("v_child_overall_progress")
          .select("overall_progress_percent")
          .eq("child_id", childId)
          .maybeSingle(),
        supabase
          .from("v_child_recent_activity")
          .select("category_code, game_title")
          .eq("child_id", childId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const fetchedChildName = child?.child_name || "Child";
      if (child?.child_name) {
        setChildName(child.child_name);
      }

      if (overall?.overall_progress_percent != null) {
        setOverallProgress(Math.round(overall.overall_progress_percent));
      }

      if (latest?.category_code) {
        const category = latest.category_code.charAt(0).toUpperCase() + latest.category_code.slice(1);
        const recentName = getFirstName(fetchedChildName);
        setRecentActivity(`${recentName} completed "${category}"`);
      }
    };

    void loadDashboardData();
  }, []);

  return (
    <div className="pd-wrapper">
      {/* LEFT SIDEBAR */}
      <aside
        className="pd-sidebar"
        data-collapsed={sidebarCollapsed ? "true" : "false"}
        onMouseEnter={() => setSidebarCollapsed(false)}
        onMouseLeave={() => setSidebarCollapsed(true)}
      >
        <nav className="pd-nav">
          <button type="button" className="pd-nav-item pd-active" title="Homepage">
            <span className="pd-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("home") ? (
                <img className="pd-nav-img" src={getSidebarIconSrc("home")} alt="" />
              ) : (
                "🏠"
              )}
            </span>
            <span className="pd-nav-label">HOMEPAGE</span>
          </button>

          <button type="button" className="pd-nav-item" title="Your child">
            <span className="pd-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("child") ? (
                <img className="pd-nav-img" src={getSidebarIconSrc("child")} alt="" />
              ) : (
                "🧑‍🤝‍🧑"
              )}
            </span>
            <span className="pd-nav-label">YOUR CHILD</span>
          </button>

          <button type="button" className="pd-nav-item" title="Progress" onClick={() => navigate("/parent-progress")}> 
            <span className="pd-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("progress") ? (
                <img className="pd-nav-img" src={getSidebarIconSrc("progress")} alt="" />
              ) : (
                "📈"
              )}
            </span>
            <span className="pd-nav-label">PROGRESS</span>
          </button>

          <button
            type="button"
            className="pd-nav-item pd-logout"
            title="Logout"
            onClick={() => {
              setSidebarCollapsed(true);
              navigate("/");
            }}
          >
            <span className="pd-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("logout") ? (
                <img className="pd-nav-img" src={getSidebarIconSrc("logout")} alt="" />
              ) : (
                "🚪"
              )}
            </span>
            <span className="pd-nav-label">LOGOUT</span>
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <div className="pd-main">
        {/* TOP HEADER */}
        <header className="pd-top-header">
          <div className="pd-brand">
            <img src={logo} alt="LearnEase Kids logo" className="pd-logo" />
            <span className="pd-brand-text">LearnEase Kids</span>
          </div>
          <button className="pd-bell-icon">🔔</button>
        </header>

        {/* CONTENT AREA */}
        <main className="pd-content">
          {/* WELCOME SECTION */}
          <section className="pd-welcome">
            <h1 className="pd-welcome-text">Welcome!</h1>
          </section>

          {/* SUMMARY + RECENT ACTIVITY CARD */}
          <section className="pd-card pd-summary">
            <div className="pd-card-header">
              <span className="pd-icon">📍</span>
              <h2>Quick Summary</h2>
            </div>

            <div className="pd-progress-item">
              <p className="pd-child-name">
                {childName}: <span className="pd-progress-percent">{overallProgress}%</span> Progress
              </p>
              <div className="pd-progress-bar">
                <div className="pd-progress-fill" style={{ width: `${overallProgress}%` }}></div>
              </div>
            </div>

            <div className="pd-divider" />

            <div className="pd-card-header pd-activity-header">
              <span className="pd-icon">🎨</span>
              <h2>Recent Activity</h2>
            </div>
            <p className="pd-activity-text">
              <strong>{recentActivity}</strong>
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
