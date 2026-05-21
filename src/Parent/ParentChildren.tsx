import { useCallback, useEffect, useMemo, useState } from "react";
import ParentLayout from "./ParentLayout";
import "./ParentChildren.css";
import { supabase } from "../lib/supabase";
import {
  buildChildAchievements,
  clearChildDeviceLabel,
  getChildAgeLabel,
  getChildDeviceLabel,
  getChildDisplayFirstName,
  getChildDisplayName,
  getOrCreateActiveChildId,
  getPlayfulNickname,
  formatChildBirthday,
  type ChildActivityRow,
  type ChildCategoryProgressRow,
} from "../lib/childProgress";

type ChildRow = {
  id: string;
  child_name: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  grade_level: string | null;
  pin_code: string | null;
  nickname?: string | null;
};

export default function ParentChildren() {
  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<ChildRow | null>(null);
  const [overallProgress, setOverallProgress] = useState(0);
  const [activityRows, setActivityRows] = useState<ChildActivityRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<ChildCategoryProgressRow[]>([]);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  const loadChild = useCallback(async () => {
    console.log("loadChild: start");
    setLoading(true);
    const childId = await getOrCreateActiveChildId();
    const trimmedChildId = childId?.trim();
    console.log("loadChild: resolved childId", { childId, trimmedChildId });

    if (!trimmedChildId) {
      console.log("loadChild: no active child id found", { childId });
      setLoading(false);
      return;
    }

    try {
      const [{ data: childRow }, { data: overall }, { data: categories }, { data: activity }] =
        await Promise.all([
          supabase
            .from("children_accounts")
            .select(
              "id, child_name, first_name, last_name, date_of_birth, grade_level, pin_code, nickname"
            )
            .eq("id", trimmedChildId)
            .maybeSingle(),
          supabase
            .from("v_child_overall_progress")
            .select("overall_progress_percent")
            .eq("child_id", trimmedChildId)
            .maybeSingle(),
          supabase
            .from("v_child_category_progress")
            .select(
              "category_code, category_label, category_score, total_games_in_category, played_games_in_category, completed_games_in_category"
            )
            .eq("child_id", trimmedChildId),
          supabase
            .from("v_child_recent_activity")
            .select(
              "category_code, game_code, game_title, score, finished, created_at"
            )
            .eq("child_id", trimmedChildId)
            .order("created_at", { ascending: true }),
        ]);

      console.log("loadChild: query results", { childRow, overall, categories, activity });

      if (childRow) {
        setChild(childRow as ChildRow);
      }

      setOverallProgress(
        overall?.overall_progress_percent != null
          ? Math.round(overall.overall_progress_percent)
          : 0
      );

      setCategoryRows((categories ?? []) as ChildCategoryProgressRow[]);
      setActivityRows((activity ?? []) as ChildActivityRow[]);
      setDeviceLabel(getChildDeviceLabel(trimmedChildId));
    } catch (err) {
      console.error("loadChild: error fetching child data", err);
    } finally {
      setLoading(false);
      console.log("loadChild: finished, loading=false");
    }
  }, []);

  useEffect(() => {
    void loadChild();
    const onFocus = () => void loadChild();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadChild]);

  const displayName = getChildDisplayName(child);
  const firstName = getChildDisplayFirstName(child);
  const nickname = getPlayfulNickname(firstName, child?.nickname);
  const grade = child?.grade_level ?? "Kinder";
  const birthdayText = formatChildBirthday(child?.date_of_birth);
  const ageText = getChildAgeLabel(child?.date_of_birth);

  const achievements = useMemo(
    () => buildChildAchievements(activityRows, categoryRows),
    [activityRows, categoryRows]
  );

  const handleRemoveDevice = () => {
    if (!child?.id) return;
    clearChildDeviceLabel(child.id);
    setDeviceLabel(null);
  };

  const handleSavePin = async () => {
    setPinError("");
    const pin = newPin.replace(/\D/g, "");
    const confirm = confirmPin.replace(/\D/g, "");
    if (pin.length !== 4 || confirm.length !== 4) {
      setPinError("Both PIN fields must be exactly 4 digits.");
      return;
    }
    if (pin !== confirm) {
      setPinError("PINs do not match. Please confirm the same PIN twice.");
      return;
    }
    if (!child?.id) return;

    setPinSaving(true);
    const { error } = await supabase
      .from("children_accounts")
      .update({ pin_code: pin })
      .eq("id", child.id);

    setPinSaving(false);
    if (error) {
      setPinError("Could not update PIN. Please try again.");
      return;
    }

    localStorage.setItem("studentPin", pin);
    setChild((prev) => (prev ? { ...prev, pin_code: pin } : prev));
    setPinModalOpen(false);
    setNewPin("");
    setConfirmPin("");
  };

  if (loading) {
    return (
      <ParentLayout activeNav="child">
        <p className="pc-loading">Loading your child&apos;s profile…</p>
      </ParentLayout>
    );
  }

  return (
    <ParentLayout activeNav="child">
      <section className="pc-page-title">
        <h1>Your Children</h1>
      </section>

      <div className="pc-top-row">
        <article className="pc-profile-card">
          <div className="pc-avatar" aria-hidden="true">
            🦄
          </div>
          <div>
            <h2 className="pc-profile-name">{displayName}</h2>
            <p className="pc-profile-grade">{grade}</p>
          </div>
        </article>

        <article className="pc-summary-card">
          <p className="pc-summary-line">
            Nickname: <strong>{nickname}</strong>
          </p>
          <p className="pc-summary-line pc-summary-line--progress">
            <span className="pc-star" aria-hidden="true">
              ⭐
            </span>
            Overall Progress:{" "}
            <span className="pc-progress-value">{overallProgress}%</span>
          </p>
        </article>
      </div>

      <section className="pc-main-card" aria-label="Child profile and settings">
        <div className="pc-section">
          <h2 className="pc-section-heading">Child Details</h2>
          <ul className="pc-detail-list">
            <li className="pc-detail-item">
              <span className="pc-detail-icon" aria-hidden="true">
                🎉
              </span>
              Birthday: {birthdayText}
            </li>
            <li className="pc-detail-item">
              <span className="pc-detail-icon" aria-hidden="true">
                ⏳
              </span>
              Age: {ageText}
            </li>
          </ul>
        </div>

        <hr className="pc-section-divider" />

        <div className="pc-section">
          <h2 className="pc-section-heading">Achievements</h2>
          {achievements.length > 0 ? (
            <ul className="pc-achievement-list">
              {achievements.map((item) => (
                <li key={item.id} className="pc-achievement-item">
                  <span aria-hidden="true">{item.icon}</span>
                  {item.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="pc-achievements-empty">
              No achievements yet — play a lesson to earn the first one!
            </p>
          )}
        </div>

        <hr className="pc-section-divider" />

        <div className="pc-section">
          <h2 className="pc-section-heading">Login &amp; Access Settings</h2>

          <p className="pc-settings-row">
            <span className="pc-settings-label">PIN Login:</span>
            <span className="pc-pin-dots" aria-label="PIN hidden">
              ● ● ● ●
            </span>
            <button
              type="button"
              className="pc-manage-pin-button"
              aria-label="Edit child PIN"
              onClick={() => {
                setPinError("");
                setNewPin("");
                setConfirmPin("");
                setShowPin(false);
                setPinModalOpen(true);
              }}
            >
              Manage PIN
            </button>
          </p>

          <p className="pc-settings-row">
            <span className="pc-settings-label">Assigned Device:</span>
            <span>{deviceLabel ?? "No device linked yet"}</span>
            {deviceLabel && (
              <button type="button" className="pc-action-link" onClick={handleRemoveDevice}>
                [ Remove ]
              </button>
            )}
          </p>
        </div>
      </section>

      {pinModalOpen && (
        <div className="pc-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pin-modal-title">
          <div className="pc-modal">
            <h3 id="pin-modal-title">Edit child PIN</h3>
            <p>Set a new 4-digit PIN for {firstName} to use on the student login screen.</p>
            {pinError && <p className="pc-modal-error">{pinError}</p>}
            <div className="pc-pin-field">
              <input
                className="pc-modal-input"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                placeholder="New PIN"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
              <button
                type="button"
                className="pc-toggle-pin-visibility"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
                title={showPin ? "Hide PIN" : "Show PIN"}
                onClick={() => setShowPin((prev) => !prev)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M1 12C1 12 5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {!showPin && (
                    <path
                      d="M4 4l16 16"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </button>
            </div>
            <div className="pc-pin-field">
              <input
                className="pc-modal-input"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                placeholder="Confirm PIN"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
              <button
                type="button"
                className="pc-toggle-pin-visibility"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
                title={showPin ? "Hide PIN" : "Show PIN"}
                onClick={() => setShowPin((prev) => !prev)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M1 12C1 12 5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {!showPin && (
                    <path
                      d="M4 4l16 16"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </button>
            </div>
            <div className="pc-modal-actions">
              <button
                type="button"
                className="pc-modal-btn pc-modal-btn--ghost"
                onClick={() => setPinModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pc-modal-btn pc-modal-btn--primary"
                disabled={pinSaving}
                onClick={() => void handleSavePin()}
              >
                {pinSaving ? "Saving…" : "Save PIN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ParentLayout>
  );
}
