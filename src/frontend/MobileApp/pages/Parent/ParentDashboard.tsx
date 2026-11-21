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
import { formatPhMobileDisplay, getParentPhone, isValidPhMobile, parentSmsToast, saveParentPhone } from "../../../../backend/parentPhone";
import { sendTeacherSmsMessage } from "../../../../backend/parentTeacherMessages";

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

function cachedChildSummaries(parentId: string): ChildSummary[] {
  if (!parentId) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(`learnease-child-roster:${parentId}`) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((child: { id?: unknown }) => child && typeof child.id === "string")
      .map((child: { id: string; childName?: string; firstName?: string; lastName?: string }) => ({
        id: child.id,
        name: getChildDisplayName({
          child_name: child.childName,
          first_name: child.firstName,
          last_name: child.lastName,
        }),
        progress: cachedChildProgress(child.id),
        recent: "",
      }));
  } catch {
    return [];
  }
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

type ContactNotice = { kind: "ok" | "err"; title: string; detail: string };

function ContactAlert({ notice, onClose }: { notice: ContactNotice; onClose: () => void }) {
  return (
    <div className={`pd-contact-alert is-${notice.kind}`} role={notice.kind === "err" ? "alert" : "status"}>
      <span className="pd-contact-alert-mark" aria-hidden="true">{notice.kind === "ok" ? "✓" : "!"}</span>
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.detail}</p>
      </div>
      <button type="button" className="pd-contact-alert-close" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

function ParentContactCard({ parentId, learners }: { parentId: string; learners: ChildSummary[] }) {
  const [phone, setPhone] = React.useState("");
  const [savedPhone, setSavedPhone] = React.useState("");
  const [editingPhone, setEditingPhone] = React.useState(true);
  const [phoneNotice, setPhoneNotice] = React.useState<ContactNotice | null>(null);
  const [phoneSaving, setPhoneSaving] = React.useState(false);
  const [sms, setSms] = React.useState("");
  const [smsNotice, setSmsNotice] = React.useState<ContactNotice | null>(null);
  const [smsSending, setSmsSending] = React.useState(false);

  React.useEffect(() => {
    if (!parentId) return;
    let alive = true;
    void getParentPhone(parentId).then((saved) => {
      if (!alive || !saved) return;
      const display = formatPhMobileDisplay(saved);
      setPhone(display);
      setSavedPhone(display);
      setEditingPhone(false);
    });
    return () => { alive = false; };
  }, [parentId]);

  React.useEffect(() => {
    if (phoneNotice?.kind !== "ok") return;
    const timer = window.setTimeout(() => setPhoneNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [phoneNotice]);

  React.useEffect(() => {
    if (smsNotice?.kind !== "ok") return;
    const timer = window.setTimeout(() => setSmsNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [smsNotice]);

  const savePhone = async () => {
    if (!parentId || phoneSaving) return;
    if (!isValidPhMobile(phone)) {
      setPhoneNotice({
        kind: "err",
        title: "Check the number",
        detail: "Use a Philippine mobile number, like 0917 123 4567.",
      });
      return;
    }
    setPhoneSaving(true);
    setPhoneNotice(null);
    try {
      const saved = await saveParentPhone(parentId, phone);
      const stored = await getParentPhone(parentId);
      const display = formatPhMobileDisplay(stored || saved);
      setPhone(display);
      setSavedPhone(display);
      setEditingPhone(false);
      setPhoneNotice({
        kind: "ok",
        title: "Phone number saved",
        detail: "This is now on your parent account. Tap Edit to change it.",
      });
    } catch (error) {
      setPhoneNotice({
        kind: "err",
        title: "Could not save",
        detail: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setPhoneSaving(false);
    }
  };

  const sendSms = async () => {
    if (!parentId || smsSending) return;
    setSmsSending(true);
    setSmsNotice(null);
    try {
      const child = learners[0];
      const result = await sendTeacherSmsMessage({
        parentId,
        childId: child?.id,
        childName: child?.name,
        message: sms,
      });
      const smsLine = parentSmsToast(result.status, result.phone, "teacher");
      setSms("");
      setSmsNotice({
        kind: "ok",
        title: "Message sent",
        detail: smsLine ? `Teacher was notified. ${smsLine}.` : "Teacher was notified in the web app.",
      });
    } catch (error) {
      setSmsNotice({
        kind: "err",
        title: "Could not send",
        detail: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSmsSending(false);
    }
  };

  return (
    <section className="pd-card pd-contact-card" aria-label="Contact the teacher">
      <div className="pd-card-header pd-contact-head">
        <span className="pd-icon pd-contact-icon" aria-hidden="true">&#128241;</span>
        <div className="pd-contact-heading">
          <p className="pd-contact-kicker">Stay in touch</p>
          <h2>Contact teacher</h2>
        </div>
      </div>
      <p className="pd-contact-copy">Save your number for SMS alerts, then send a short note.</p>

      <div className="pd-contact-panel">
        <div className="pd-contact-field">
          <span className="pd-contact-label">Your phone number</span>
          <small>Used for attendance and allergy SMS.</small>
          {savedPhone && !editingPhone ? (
            <div className="pd-contact-detail">
              <input type="text" readOnly value={savedPhone} aria-label="Saved phone number" />
              <button
                type="button"
                className="pd-contact-edit"
                onClick={() => {
                  setEditingPhone(true);
                  setPhone(savedPhone);
                }}
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="pd-contact-row">
              <input
                type="text"
                inputMode="tel"
                autoComplete="tel"
                placeholder="09XX XXX XXXX"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  if (phoneNotice) setPhoneNotice(null);
                }}
              />
              <button type="button" disabled={phoneSaving || !parentId} onClick={() => void savePhone()}>
                {phoneSaving ? "Saving…" : "Save"}
              </button>
              {savedPhone ? (
                <button
                  type="button"
                  className="pd-contact-edit"
                  onClick={() => {
                    setPhone(savedPhone);
                    setEditingPhone(false);
                    setPhoneNotice(null);
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          )}
        </div>
        {phoneNotice ? <ContactAlert notice={phoneNotice} onClose={() => setPhoneNotice(null)} /> : null}
      </div>

      <div className="pd-contact-panel pd-contact-panel-sms">
        <label className="pd-contact-field">
          <span className="pd-contact-label">Message the teacher</span>
          <small>Sent as SMS to the teacher’s saved number.</small>
          <textarea
            rows={3}
            maxLength={320}
            placeholder="Write a short message for the teacher…"
            value={sms}
            onChange={(event) => {
              setSms(event.target.value);
              if (smsNotice) setSmsNotice(null);
            }}
          />
          <span className="pd-contact-count">{sms.length}/320</span>
          <button type="button" className="pd-contact-full" disabled={smsSending || !sms.trim() || !parentId} onClick={() => void sendSms()}>
            {smsSending ? "Sending…" : "Send SMS to teacher"}
          </button>
        </label>
        {smsNotice ? <ContactAlert notice={smsNotice} onClose={() => setSmsNotice(null)} /> : null}
      </div>
    </section>
  );
}

export default function ParentDashboard() {
  const parentId = String(getLocalUser()?.id || "");
  const [children, setChildren] = React.useState<ChildSummary[]>(() => cachedChildSummaries(parentId));
  const [announcements, setAnnouncements] = React.useState<ParentAnnouncement[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async () => {
      try {
        const signedInParentId = String(getLocalUser()?.id || "");
        let roster: SupabaseChild[] = [];
        if (signedInParentId) {
          try {
            roster = linkedChildren(await getParentChildren(signedInParentId));
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
          const posts = await getParentAnnouncements(signedInParentId);
          if (!cancelled) setAnnouncements(posts.filter(item => item.kind === "classroom"));
        } catch {
          if (!cancelled) setAnnouncements([]);
        }
      } finally {
        /* Homepage stays visible while live scores finish loading. */
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

      <ParentContactCard parentId={parentId} learners={children} />

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
                  <span className="pd-announcement-pin">📌 Pinned</span>
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
