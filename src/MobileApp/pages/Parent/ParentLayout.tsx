import React from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../../../images/learnease logo-no bg.png";
import "./ParentDashboard.css";

export type ParentNavId = "home" | "child" | "progress";

const sidebarIcons = import.meta.glob("../../../../images/sidebar/*", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function getSidebarIconSrc(id: string) {
  const idKey = id.toLowerCase().replace(/[^a-z]/g, "");
  const match = Object.entries(sidebarIcons).find(([path]) => {
    const file = path.split("/").pop()?.toLowerCase() || "";
    const base = file.replace(/\.[^/.]+$/, "");
    const baseKey = base.replace(/[^a-z]/g, "");
    return baseKey === idKey;
  });
  return match?.[1];
}

type ParentLayoutProps = {
  activeNav: ParentNavId;
  children: React.ReactNode;
};

export default function ParentLayout({ activeNav, children }: ParentLayoutProps) {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(true);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");

    const syncMobileNav = () => {
      if (mediaQuery.matches) {
        setSidebarCollapsed(true);
      }
    };

    syncMobileNav();
    mediaQuery.addEventListener("change", syncMobileNav);

    return () => mediaQuery.removeEventListener("change", syncMobileNav);
  }, []);

  const navClass = (id: ParentNavId) =>
    `pd-nav-item${activeNav === id ? " pd-active" : ""}`;

  const isMobileLayout = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;

  return (
    <div className="pd-wrapper pd-mobile-parent">
      <aside
        className="pd-sidebar"
        data-collapsed={sidebarCollapsed ? "true" : "false"}
        onMouseEnter={() => {
          if (!isMobileLayout()) setSidebarCollapsed(false);
        }}
        onMouseLeave={() => {
          if (!isMobileLayout()) setSidebarCollapsed(true);
        }}
      >
        <nav className="pd-nav">
          <button
            type="button"
            className={navClass("home")}
            title="Homepage"
            onClick={() => navigate("/parent-dashboard")}
          >
            <span className="pd-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("home") ? (
                <img className="pd-nav-img" src={getSidebarIconSrc("home")} alt="" />
              ) : (
                "\u{1F3E0}"
              )}
            </span>
            <span className="pd-nav-label">HOMEPAGE</span>
          </button>

          <button
            type="button"
            className={navClass("child")}
            title="Your child"
            onClick={() => navigate("/parent-children")}
          >
            <span className="pd-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("child") ? (
                <img className="pd-nav-img" src={getSidebarIconSrc("child")} alt="" />
              ) : (
                "\u{1F476}"
              )}
            </span>
            <span className="pd-nav-label">YOUR CHILD</span>
          </button>

          <button
            type="button"
            className={navClass("progress")}
            title="Progress"
            onClick={() => navigate("/parent-progress")}
          >
            <span className="pd-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("progress") ? (
                <img className="pd-nav-img" src={getSidebarIconSrc("progress")} alt="" />
              ) : (
                "\u{1F4C8}"
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
              localStorage.removeItem("user");
              localStorage.removeItem("activeChildId");
              localStorage.removeItem("studentPin");
              navigate("/");
            }}
          >
            <span className="pd-nav-icon" aria-hidden="true">
              {getSidebarIconSrc("logout") ? (
                <img className="pd-nav-img" src={getSidebarIconSrc("logout")} alt="" />
              ) : (
                "\u{1F6AA}"
              )}
            </span>
            <span className="pd-nav-label">LOGOUT</span>
          </button>
        </nav>
      </aside>

      <div className="pd-main">
        <header className="pd-top-header">
          <div className="pd-brand">
            <img src={logo} alt="LearnEase Kids logo" className="pd-logo" />
            <span className="pd-brand-text">LearnEase Kids</span>
          </div>
          <button type="button" className="pd-bell-icon" aria-label="Notifications">
            &#128276;
          </button>
        </header>

        <main className="pd-content">{children}</main>
      </div>
    </div>
  );
}

