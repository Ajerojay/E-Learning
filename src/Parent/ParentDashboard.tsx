import React from "react";
import "./ParentDashboard.css";
import { useNavigate } from "react-router-dom";
import logo from "../../images/learnease logo-no bg.png";

export default function ParentDashboard() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(true);

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
                Sofia: <span className="pd-progress-percent">45%</span> Progress
              </p>
              <div className="pd-progress-bar">
                <div className="pd-progress-fill" style={{ width: "45%" }}></div>
              </div>
            </div>

            <div className="pd-divider" />

            <div className="pd-card-header pd-activity-header">
              <span className="pd-icon">🎨</span>
              <h2>Recent Activity</h2>
            </div>
            <p className="pd-activity-text">
              Sofia completed <strong>"Colors"</strong>
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
