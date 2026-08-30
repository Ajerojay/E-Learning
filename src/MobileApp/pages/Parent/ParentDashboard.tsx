import React from "react";
import ParentLayout from "./ParentLayout";
import { supabase } from "../../../lib/supabase";
import {
  getChildDisplayFirstName,
  getChildDisplayName,
  getOrCreateActiveChildId,
} from "../../../lib/childProgress";

export default function ParentDashboard() {
  const [childName, setChildName] = React.useState("Child");
  const [overallProgress, setOverallProgress] = React.useState(0);
  const [recentActivity, setRecentActivity] = React.useState("No activity yet");

  React.useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async () => {
      const childId = await getOrCreateActiveChildId();
      if (!childId || cancelled) return;

      const [{ data: child }, { data: overall }, { data: latest }] = await Promise.all([
        supabase
          .from("children_accounts")
          .select("child_name, first_name, last_name")
          .eq("id", childId)
          .maybeSingle(),
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

      if (cancelled) return;

      if (child) {
        setChildName(getChildDisplayName(child));
      }

      if (overall?.overall_progress_percent != null) {
        setOverallProgress(Math.round(overall.overall_progress_percent));
      } else {
        setOverallProgress(0);
      }

      if (latest?.category_code) {
        const category =
          latest.category_code.charAt(0).toUpperCase() + latest.category_code.slice(1);
        const recentName = getChildDisplayFirstName(child);
        setRecentActivity(`${recentName} completed "${category}"`);
      } else {
        setRecentActivity("No activity yet");
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
          <span className="pd-icon">ðŸ“</span>
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
          <span className="pd-icon">ðŸŽ¨</span>
          <h2>Recent Activity</h2>
        </div>
        <p className="pd-activity-text">
          <strong>{recentActivity}</strong>
        </p>
      </section>
    </ParentLayout>
  );
}

