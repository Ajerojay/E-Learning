import React from "react";
import ParentLayout from "./ParentLayout";
import {
  getChildDisplayFirstName,
  getChildDisplayName,
  getOrCreateActiveChildId,
} from "../../../lib/childProgress";
import { getActiveChild, getChildCategoryProgress, getChildOverallProgress, getLatestChildAttempt, getParentAnnouncements, type ParentAnnouncement } from "../../../lib/supabaseData";
import { getOfflineCategoryProgress, getOfflineChildrenFromSqlite, cacheOfflineCategoryProgress } from "../../../lib/offlineSqlite";

export default function ParentDashboard() {
  const [childName, setChildName] = React.useState("Child");
  const [overallProgress, setOverallProgress] = React.useState(0);
  const [recentActivity, setRecentActivity] = React.useState("No activity yet");
  const [announcements, setAnnouncements] = React.useState<ParentAnnouncement[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async () => {
      const childId = await getOrCreateActiveChildId();
      if (!childId || cancelled) return;

      let child = null;
      let overall = 0;
      let latest = null;
      try {
        [child, overall, latest] = await Promise.all([
          getActiveChild(childId),
          getChildOverallProgress(childId),
          getLatestChildAttempt(childId),
        ]);
        const categories = await getChildCategoryProgress(childId);
        await cacheOfflineCategoryProgress(childId, categories.map(row => ({ categoryCode: row.category_code, categoryScore: row.category_score })));
      } catch {
        const cachedChild = (await getOfflineChildrenFromSqlite()).find(row => row.id === childId);
        const cachedProgress = await getOfflineCategoryProgress(childId);
        child = cachedChild ? { childName: cachedChild.child_name, firstName: cachedChild.first_name, lastName: cachedChild.last_name } : null;
        overall = cachedProgress.length ? Math.round(cachedProgress.reduce((sum, row) => sum + row.category_score, 0) / cachedProgress.length) : 0;
      }

      if (cancelled) return;

      if (child) {
        setChildName(getChildDisplayName({ child_name: child.childName, first_name: child.firstName, last_name: child.lastName }));
      }

      setOverallProgress(overall);

      if (latest?.categoryCode) {
        const category =
          latest.categoryCode.charAt(0).toUpperCase() + latest.categoryCode.slice(1);
        const recentName = getChildDisplayFirstName(child ? { child_name: child.childName, first_name: child.firstName, last_name: child.lastName } : null);
        setRecentActivity(`${recentName} completed "${category}"`);
      } else {
        setRecentActivity("No activity yet");
      }

      try {
        let parentId = "";
        try { parentId = String(JSON.parse(localStorage.getItem("user") || "{}").id || ""); } catch { /* no active parent id */ }
        const posts = await getParentAnnouncements(parentId, childId);
        if (!cancelled) setAnnouncements(posts);
      } catch {
        if (!cancelled) setAnnouncements([]);
      }
    };

    void loadDashboardData();
    const onFocus = () => void loadDashboardData();
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadDashboardData();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <ParentLayout activeNav="home">
      <section className="pd-welcome">
        <h1 className="pd-welcome-text">Welcome!</h1>
      </section>

      <section className="pd-card pd-summary">
        <div className="pd-card-header">
          <span className="pd-icon">&#128205;</span>
          <h2>Quick Summary</h2>
        </div>

        <div className="pd-progress-item">
          <p className="pd-child-name">
            {childName}: <span className="pd-progress-percent">{overallProgress}%</span>{" "}
            Progress
          </p>
          <div className="pd-progress-bar">
            <div
              className="pd-progress-fill"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        <div className="pd-divider" />

        <div className="pd-card-header pd-activity-header">
          <span className="pd-icon">&#127912;</span>
          <h2>Recent Activity</h2>
        </div>
        <p className="pd-activity-text">
          <strong>{recentActivity}</strong>
        </p>
      </section>

      <section className="pd-card pd-announcements" aria-label="Announcements">
        <div className="pd-card-header">
          <span className="pd-icon" aria-hidden="true">&#128227;</span>
          <h2>Announcements</h2>
        </div>

        {announcements.length === 0 ? (
          <p className="pd-announcement-empty">No announcements yet</p>
        ) : (
          <ul className="pd-announcement-list">
            {announcements.map((item) => (
              <li key={item.id} className={`pd-announcement-item${item.pinned ? " pd-announcement-pinned" : ""}`}>
                {item.pinned ? (
                  <span className="pd-announcement-pin">📌 Pinned · Health</span>
                ) : null}
                <h3>{item.title}</h3>
                {item.createdAt && (
                  <p className="pd-announcement-date">
                    {new Date(item.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
                {item.body ? <p>{item.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </ParentLayout>
  );
}

