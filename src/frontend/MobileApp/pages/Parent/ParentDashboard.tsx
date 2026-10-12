import React from "react";
import ParentLayout from "./ParentLayout";
import {
  getChildDisplayFirstName,
  getChildDisplayName,
  getLocalUser,
  resolveActiveParentChild,
} from "../../../../backend/childProgress";
import { getChildCategoryProgress, getLatestChildAttempt, getParentAnnouncements, getParentChildren, type ParentAnnouncement, type SupabaseChild } from "../../../../backend/supabaseData";
import { getOfflineCategoryProgress, getOfflineChildrenFromSqlite, cacheOfflineCategoryProgress } from "../../../../backend/offlineSqlite";
import BearLoading from "../../BearLoading";

type ChildSummary = {
  id: string;
  name: string;
  progress: number;
  recent: string;
};

function linkedChildren(roster: SupabaseChild[]) {
  const active = roster.filter((child) => child.isActive !== false);
  const named = active.filter((child) => getChildDisplayName({
    child_name: child.childName,
    first_name: child.firstName,
    last_name: child.lastName,
  }) !== "Child");
  return named.length ? named : active;
}

function progressTone(progress: number) {
  if (progress >= 100) return "is-high";
  if (progress >= 67) return "is-mid";
  if (progress > 0) return "is-low";
  return "";
}

function progressLabel(progress: number) {
  if (progress >= 100) return "Excellent";
  if (progress >= 67) return "Good";
  if (progress > 0) return "Needs Practice";
  return "Getting Started";
}

function progressCacheKey(childId: string) {
  return `parentProgress:${childId}`;
}

function cachedChildProgress(childId: string) {
  const saved = Number(localStorage.getItem(progressCacheKey(childId)));
  return Number.isFinite(saved) ? Math.min(100, Math.max(0, Math.round(saved))) : 0;
}

function rememberChildProgress(childId: string, progress: number) {
  localStorage.setItem(progressCacheKey(childId), String(progress));
}

function recentLine(child: SupabaseChild, latest: { categoryCode: string; gameCode: string; finished: boolean } | null) {
  const categoryCode = latest?.categoryCode || latest?.gameCode.split(/[_-\s]/)[0] || "";
  if (!categoryCode) return "";
  const category = categoryCode.charAt(0).toUpperCase() + categoryCode.slice(1);
  const recentName = getChildDisplayFirstName({
    child_name: child.childName,
    first_name: child.firstName,
    last_name: child.lastName,
  });
  return latest?.finished ? `${recentName} completed "${category}"` : `${recentName} played "${category}"`;
}

export default function ParentDashboard() {
  const [ready, setReady] = React.useState(false);
  const [children, setChildren] = React.useState<ChildSummary[]>([]);
  const [announcements, setAnnouncements] = React.useState<ParentAnnouncement[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async () => {
      try {
        const parentId = String(getLocalUser()?.id || "");
        let roster: SupabaseChild[] = [];
        if (parentId) {
          try {
            roster = linkedChildren(await getParentChildren(parentId));
          } catch {
            roster = [];
          }
        }
        if (!roster.length) {
          const active = await resolveActiveParentChild();
          if (active) roster = [active];
        }
        if (!roster.length || cancelled) return;

        if (!cancelled) {
          setChildren(roster.map((child) => ({
            id: child.id,
            name: getChildDisplayName({ child_name: child.childName, first_name: child.firstName, last_name: child.lastName }),
            progress: cachedChildProgress(child.id),
            recent: "",
          })));
          setReady(true);
        }

        const summaries = await Promise.all(roster.map(async (child): Promise<ChildSummary> => {
          try {
            const [latest, categories] = await Promise.all([
              getLatestChildAttempt(child.id),
              getChildCategoryProgress(child.id),
            ]);
            await cacheOfflineCategoryProgress(child.id, categories.map(row => ({ categoryCode: row.category_code, categoryScore: row.category_score })));
            const overall = categories.length
              ? Math.round(categories.reduce((sum, row) => sum + row.category_score, 0) / categories.length)
              : 0;
            rememberChildProgress(child.id, overall);
            return {
              id: child.id,
              name: getChildDisplayName({ child_name: child.childName, first_name: child.firstName, last_name: child.lastName }),
              progress: overall,
              recent: recentLine(child, latest),
            };
          } catch {
            const cachedChild = (await getOfflineChildrenFromSqlite()).find(row => row.id === child.id);
            const cachedProgress = await getOfflineCategoryProgress(child.id);
            const nameSource = cachedChild
              ? { child_name: cachedChild.child_name, first_name: cachedChild.first_name, last_name: cachedChild.last_name }
              : { child_name: child.childName, first_name: child.firstName, last_name: child.lastName };
            return {
              id: child.id,
              name: getChildDisplayName(nameSource),
              progress: cachedProgress.length ? Math.round(cachedProgress.reduce((sum, row) => sum + row.category_score, 0) / cachedProgress.length) : 0,
              recent: "",
            };
          }
        }));

        if (cancelled) return;
        setChildren(summaries);

        try {
          const posts = await getParentAnnouncements(parentId, roster[0]?.id);
          if (!cancelled) setAnnouncements(posts);
        } catch {
          if (!cancelled) setAnnouncements([]);
        }
      } finally {
        if (!cancelled) setReady(true);
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

  if (!ready) return <BearLoading overlay />;

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

        <div className="pd-progress-list">
          {(children.length ? children : [{ id: "placeholder", name: "Child", progress: 0, recent: "" }]).map((child) => (
            <div className="pd-progress-item" key={child.id}>
              <div className="pd-progress-meta">
                <p className="pd-child-name">{child.name}</p>
                <span className={`pd-progress-percent ${progressTone(child.progress)}`.trim()}>{child.progress}%</span>
              </div>
              <div className="pd-meter">
                <div
                  className="pd-progress-bar"
                  role="progressbar"
                  aria-valuenow={child.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${child.name} progress`}
                >
                  <div
                    className={`pd-progress-fill ${progressTone(child.progress)}`.trim()}
                    style={{ width: `${child.progress}%` }}
                  />
                </div>
                <span
                  className={`pd-progress-knob ${progressTone(child.progress)}`.trim()}
                  style={{ left: `calc(14px + (100% - 28px) * ${child.progress} / 100)` }}
                  aria-hidden="true"
                >
                  &#9733;
                </span>
              </div>
              <p className="pd-progress-caption">{progressLabel(child.progress)}</p>
            </div>
          ))}
        </div>

        <div className="pd-divider" />

        <div className="pd-card-header pd-activity-header">
          <span className="pd-icon">&#127912;</span>
          <h2>Recent Activity</h2>
        </div>
        {children.some((child) => child.recent) ? (
          <ul className="pd-activity-list">
            {children.filter((child) => child.recent).map((child) => (
              <li key={child.id}>{child.recent}</li>
            ))}
          </ul>
        ) : (
          <p className="pd-activity-empty">No activity yet</p>
        )}
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

