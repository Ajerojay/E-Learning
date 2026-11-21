import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Eye, Paperclip, X } from "lucide-react";
import ParentLayout from "./ParentLayout";
import "./ParentChildren.css";
import BearLoading from "../../BearLoading";
import {
  buildChildAchievements,
  clearChildDeviceLabel,
  getChildAgeLabel,
  getChildDeviceLabel,
  getChildDisplayFirstName,
  getChildDisplayName,
  getLocalUser,
  getPlayfulNickname,
  formatChildBirthday,
  resolveActiveParentChild,
  type ChildActivityRow,
  type ChildCategoryProgressRow,
} from "../../../../backend/childProgress";
import {
  getChildCategoryProgress,
  getChildOverallProgress,
  getRecentChildAttempts,
  updateChild,
} from "../../../../backend/supabaseData";
import { cacheOfflineCategoryProgress, cacheOfflineChild, getOfflineCategoryProgress, getOfflineChildrenFromSqlite } from "../../../../backend/offlineSqlite";
import { CHILD_AVATAR_UPDATED_EVENT, getStoredChildAvatar, normalizeChildAvatar, rememberChildAvatar } from "../../../../backend/childAvatar";
import { childAvatarById } from "../Student/childAvatars";
import { earnedGameCertificates, GAME_CERTIFICATES, PROGRAM_STAR_MAX, certificateKindForGame, starsEarnedLine, summarizeLevelStars, type GameCertificate } from "../../../../backend/gameCertificates";
import { fetchQuestLevelResults, mergeQuestStars, readLocalQuestStars } from "../../../../backend/questLevelResults";
import { downloadCertificatePng } from "../Student/downloadCertificate";
import {
  loadChildAllergies,
  saveChildAllergies,
  type ChildAllergy,
} from "../../../../backend/childAllergies";
import { getAttendanceRecords } from "../../../../backend/attendance";
import {
  clearParentAllergyAlert,
  readParentAllergyAlert,
  type ParentAllergyAlert,
} from "../../../../backend/appNotifications";
import { useAppNotifications } from "../../notifications/useAppNotifications";
import {
  buildStudentMonth,
  currentMonth,
  isAfterCurrentMonth,
  downloadTextPdf,
  mergeAttendanceRecords,
  monthCounts,
  monthTitle,
  parseStudentMonthAttachment,
  shiftMonth,
  type MonthPoint,
} from "../../teacher/attendanceRecords";

type ChildRow = {
  id: string;
  child_name: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  grade_level: string | null;
  pin_code: string | null;
  nickname?: string | null;
  avatar?: string | null;
};

export default function ParentChildren() {
  const [searchParams, setSearchParams] = useSearchParams();
  const allergyAlertRef = useRef<HTMLDivElement | null>(null);
  const noticeRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [recordPreview, setRecordPreview] = useState<{ name: string; text: string } | null>(null);
  const [allergyAlert, setAllergyAlert] = useState<ParentAllergyAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<ChildRow | null>(null);
  const [overallProgress, setOverallProgress] = useState(0);
  const [activityRows, setActivityRows] = useState<ChildActivityRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<ChildCategoryProgressRow[]>([]);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [gameCertificates, setGameCertificates] = useState<GameCertificate[]>([]);
  const [questStars, setQuestStars] = useState<Record<string, number[]>>({});
  const [achievementTab, setAchievementTab] = useState<"achievements" | "certificates" | "attendance">("achievements");
  const [attendanceMonth, setAttendanceMonth] = useState<MonthPoint>(() => currentMonth());
  const [attendanceReady, setAttendanceReady] = useState(false);
  const [allergies, setAllergies] = useState<ChildAllergy[]>([]);
  const [allergyName, setAllergyName] = useState("");
  const [allergyDescription, setAllergyDescription] = useState("");
  const [allergyError, setAllergyError] = useState("");
  const [allergySaving, setAllergySaving] = useState(false);
  const parentId = String(getLocalUser()?.id || "");
  const { items: parentNotices } = useAppNotifications("parent", parentId);

  const loadChild = useCallback(async () => {
    console.log("loadChild: start");
    setLoading(true);
    const childProfile = await resolveActiveParentChild();
    const trimmedChildId = childProfile?.id?.trim();
    console.log("loadChild: resolved childId", { childId: childProfile?.id, trimmedChildId });

    if (!childProfile || !trimmedChildId) {
      console.log("loadChild: no active child id found", { childId: childProfile?.id });
      setGameCertificates([]);
      setQuestStars({});
      setLoading(false);
      return;
    }

    try {
      let childRow: ChildRow | null = {
        id: childProfile.id, child_name: childProfile.childName ?? null, first_name: childProfile.firstName ?? null,
        last_name: childProfile.lastName ?? null, date_of_birth: childProfile.dateOfBirth ?? null,
        grade_level: childProfile.gradeLevel ?? null, pin_code: childProfile.pinCode ?? null,
        nickname: childProfile.nickname ?? null, avatar: childProfile.avatar ?? null,
      };
      let overall = 0;
      let categories: ChildCategoryProgressRow[] = [];
      let activity: Array<{ categoryCode: string; gameCode: string; gameTitle: string | null; score: number; finished: boolean; created_at: string }> = [];
      try {
        const [remoteOverall, remoteCategories, remoteActivity] = await Promise.all([
          getChildOverallProgress(trimmedChildId),
          getChildCategoryProgress(trimmedChildId),
          getRecentChildAttempts(trimmedChildId),
        ]);
        childRow = {
          id: childProfile.id, child_name: childProfile.childName ?? null, first_name: childProfile.firstName ?? null,
          last_name: childProfile.lastName ?? null, date_of_birth: childProfile.dateOfBirth ?? null,
          grade_level: childProfile.gradeLevel ?? null, pin_code: childProfile.pinCode ?? null, nickname: childProfile.nickname ?? null,
          avatar: childProfile.avatar ?? null,
        };
        if (childProfile.avatar) rememberChildAvatar(childProfile.id, childProfile.avatar);
        overall = remoteOverall;
        categories = (remoteCategories ?? []) as ChildCategoryProgressRow[];
        activity = remoteActivity.map(row => ({ ...row, gameTitle: row.gameTitle ?? null }));
        if (childRow) await cacheOfflineChild({
          id: childRow.id,
          parentId: childProfile.parentId,
          childName: childRow.child_name,
          firstName: childRow.first_name,
          lastName: childRow.last_name,
          pinCode: childRow.pin_code,
          isActive: childProfile.isActive,
        });
        await cacheOfflineCategoryProgress(trimmedChildId, categories.map(row => ({ categoryCode: row.category_code, categoryScore: row.category_score })));
      } catch (offlineError) {
        console.error("loadChild: using offline cache", offlineError);
        const cachedChild = (await getOfflineChildrenFromSqlite()).find(row => row.id === trimmedChildId);
        const cachedProgress = await getOfflineCategoryProgress(trimmedChildId);
        if (!childRow && cachedChild) childRow = { id: cachedChild.id, child_name: cachedChild.child_name, first_name: cachedChild.first_name, last_name: cachedChild.last_name, date_of_birth: null, grade_level: null, pin_code: cachedChild.pin_code, nickname: null };
        categories = cachedProgress as ChildCategoryProgressRow[];
        overall = categories.length ? Math.round(categories.reduce((sum, row) => sum + row.category_score, 0) / categories.length) : 0;
      }

      console.log("loadChild: query results", { childRow, overall, categories, activity });

      if (childRow) {
        setChild(childRow as ChildRow);
      }

      setOverallProgress(overall);

      setCategoryRows((categories ?? []) as ChildCategoryProgressRow[]);
      setActivityRows(activity.map(row => ({
        category_code: row.categoryCode,
        game_code: row.gameCode,
        game_title: row.gameTitle ?? null,
        score: row.score,
        finished: row.finished,
        created_at: row.created_at,
      })) as ChildActivityRow[]);
      setDeviceLabel(getChildDeviceLabel(trimmedChildId));
      const localStars = readLocalQuestStars(trimmedChildId);
      const remoteStars = await fetchQuestLevelResults(trimmedChildId);
      const mergedStars = mergeQuestStars([localStars, remoteStars]);
      setQuestStars(mergedStars);
      setGameCertificates(earnedGameCertificates(mergedStars));
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
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadChild();
    };
    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ childId?: string; avatarId?: string }>).detail;
      if (!detail?.childId || !detail.avatarId) return;
      setChild(current => {
        if (!current || current.id !== detail.childId) return current;
        return { ...current, avatar: detail.avatarId! };
      });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(CHILD_AVATAR_UPDATED_EVENT, onAvatarUpdated);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(CHILD_AVATAR_UPDATED_EVENT, onAvatarUpdated);
    };
  }, [loadChild]);

  useEffect(() => {
    if (!child?.id) {
      setAllergies([]);
      setAttendanceReady(false);
      return;
    }
    let alive = true;
    void loadChildAllergies(child.id).then((items) => {
      if (alive) setAllergies(items);
    });
    void getAttendanceRecords([child.id]).then((rows) => {
      if (!alive) return;
      mergeAttendanceRecords(rows);
      setAttendanceReady(true);
    });
    return () => {
      alive = false;
    };
  }, [child?.id]);

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (focus === "allergy") {
      const stored = readParentAllergyAlert();
      setAllergyAlert(stored ?? { childId: child?.id ?? null, names: [], title: "", body: "", emergency: false });
    }
    if (focus === "attendance") setAchievementTab("attendance");
  }, [searchParams, child?.id]);

  useEffect(() => {
    if (achievementTab !== "attendance") return;
    const noticeId = searchParams.get("notice");
    if (!noticeId) return;
    const jump = () => {
      const node = noticeRefs.current[noticeId];
      if (!node) return false;
      const scroller = node.closest(".pd-main");
      const nav = document.querySelector(".pd-mobile-parent .pd-sidebar");
      const offset = ((nav instanceof HTMLElement ? nav.getBoundingClientRect().height : 88) + 16);
      if (scroller instanceof HTMLElement) {
        const top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
        scroller.scrollTo({ top: Math.max(0, top), behavior: "auto" });
      } else {
        node.scrollIntoView({ behavior: "auto", block: "start" });
      }
      return true;
    };
    if (jump()) return;
    const frames: number[] = [];
    let tries = 0;
    const retry = () => {
      if (jump() || tries++ > 12) return;
      frames.push(window.requestAnimationFrame(retry));
    };
    frames.push(window.requestAnimationFrame(retry));
    return () => frames.forEach(id => window.cancelAnimationFrame(id));
  }, [achievementTab, searchParams, parentNotices, attendanceReady]);

  const previewRecord = recordPreview ? parseStudentMonthAttachment(recordPreview.text) : null;
  const attendanceCount = (status: string) => Number(
    previewRecord?.totals.match(new RegExp(`(\\d+)\\s+${status}`, "i"))?.[1] ?? 0,
  );
  useEffect(() => {
    if (!allergyAlert) return;
    allergyAlertRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [allergyAlert, allergies]);

  const dismissAllergyAlert = () => {
    clearParentAllergyAlert();
    setAllergyAlert(null);
    if (searchParams.get("focus") === "allergy") {
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      setSearchParams(next, { replace: true });
    }
  };

  const addAllergy = async () => {
    if (!child?.id || allergySaving) return;
    const name = allergyName.trim();
    const description = allergyDescription.trim();
    if (!name) {
      setAllergyError("Enter the allergy name.");
      return;
    }
    setAllergyError("");
    setAllergySaving(true);
    const next = [...allergies, { id: `${Date.now()}`, name, description }];
    const saved = await saveChildAllergies(child.id, next);
    setAllergies(next);
    if (!saved.remote) {
      setAllergyError("Saved on this device only. Teachers cannot see it until the allergy table is added in Supabase.");
    }
    setAllergyName("");
    setAllergyDescription("");
    setAllergySaving(false);
  };

  const removeAllergy = async (allergyId: string) => {
    if (!child?.id) return;
    const next = allergies.filter((item) => item.id !== allergyId);
    setAllergies(next);
    await saveChildAllergies(child.id, next);
  };

  const displayName = getChildDisplayName(child);
  const firstName = getChildDisplayFirstName(child);
  const nickname = getPlayfulNickname(firstName, child?.nickname);
  const grade = child?.grade_level ?? "Kinder";
  const birthdayText = formatChildBirthday(child?.date_of_birth);
  const ageText = getChildAgeLabel(child?.date_of_birth);
  const avatar = childAvatarById(normalizeChildAvatar(child?.avatar) || getStoredChildAvatar(child?.id));

  const achievements = useMemo(
    () => buildChildAchievements(activityRows, categoryRows),
    [activityRows, categoryRows]
  );
  const attendanceDays = useMemo(
    () => (child?.id ? buildStudentMonth(child.id, attendanceMonth) : []),
    [child?.id, attendanceMonth, attendanceReady],
  );
  const attendanceSummary = useMemo(() => monthCounts(attendanceDays), [attendanceDays]);
  const attendanceHasMarks = useMemo(
    () => attendanceDays.some((day) => day.status),
    [attendanceDays],
  );
  const focusedNoticeId = searchParams.get("notice");
  const attendanceNotices = useMemo(() => {
    const rows = parentNotices.filter((item) => (
      item.kind === "attendance"
      && (!item.childId || !child?.id || item.childId === child.id)
    ));
    const focused = focusedNoticeId ? rows.find((item) => item.id === focusedNoticeId) : null;
    const rest = rows.filter((item) => item.id !== focusedNoticeId).slice(0, 8);
    return focused ? [focused, ...rest] : rest;
  }, [parentNotices, child?.id, focusedNoticeId]);
  const activeAllergyNames = useMemo(() => {
    const fromAlert = new Set((allergyAlert?.names || []).map((name) => name.trim().toLowerCase()).filter(Boolean));
    if (fromAlert.size) return fromAlert;
    if (allergyAlert) return new Set(allergies.map((item) => item.name.trim().toLowerCase()));
    return new Set<string>();
  }, [allergyAlert, allergies]);
  const highlightedAllergies = useMemo(() => {
    if (!allergyAlert) return [];
    if (allergyAlert.names.length) {
      return allergyAlert.names.map((name) => {
        const match = allergies.find((item) => item.name.trim().toLowerCase() === name.trim().toLowerCase());
        return { id: match?.id || name, name: match?.name || name, description: match?.description || "" };
      });
    }
    return allergies;
  }, [allergyAlert, allergies]);
  const graduation = useMemo(() => {
    if (gameCertificates.length < GAME_CERTIFICATES.length) return null;
    const starTotal = GAME_CERTIFICATES.reduce(
      (sum, game) => sum + summarizeLevelStars(questStars[game.key] ?? []).starTotal,
      0
    );
    return { starTotal, starMax: PROGRAM_STAR_MAX, starsLine: starsEarnedLine(starTotal, PROGRAM_STAR_MAX) };
  }, [gameCertificates.length, questStars]);

  const handleRemoveDevice = () => {
    if (!child?.id) return;
    clearChildDeviceLabel(child.id);
    setDeviceLabel(null);
  };

  const handleSavePin = async () => {
    setPinError("");
    const current = oldPin.replace(/\D/g, "");
    const pin = newPin.replace(/\D/g, "");
    const confirm = confirmPin.replace(/\D/g, "");
    const storedPin = (child?.pin_code ?? "").replace(/\D/g, "");

    if (storedPin && current.length !== 4) {
      setPinError("Enter the current 4-digit PIN first.");
      return;
    }
    if (storedPin && current !== storedPin) {
      setPinError("Current PIN is incorrect.");
      return;
    }
    if (pin.length !== 4 || confirm.length !== 4) {
      setPinError("Both new PIN fields must be exactly 4 digits.");
      return;
    }
    if (pin !== confirm) {
      setPinError("PINs do not match. Please confirm the same PIN twice.");
      return;
    }
    if (storedPin && pin === storedPin) {
      setPinError("Choose a new PIN that is different from the current PIN.");
      return;
    }
    if (!child?.id) return;

    setPinSaving(true);
    try {
      await updateChild(child.id, { pinCode: pin });
    } catch (error) {
      console.error("Could not update PIN:", error);
      setPinSaving(false);
      setPinError("Could not update PIN. Please try again.");
      return;
    }
    setPinSaving(false);

    localStorage.setItem("studentPin", pin);
    setChild((prev) => (prev ? { ...prev, pin_code: pin } : prev));
    setPinModalOpen(false);
    setOldPin("");
    setNewPin("");
    setConfirmPin("");
  };

  if (loading) {
    return (
      <ParentLayout activeNav="child" hideHeader>
        <BearLoading compact />
      </ParentLayout>
    );
  }

  return (
    <ParentLayout activeNav="child">
      <section className="pc-page-title">
        <h1>Your Children</h1>
      </section>

      <div className="pc-top-row pc-hero">
        <article className="pc-profile-card">
          <div className="pc-avatar">
            {avatar ? <img src={avatar.src} alt="" /> : <span aria-hidden="true">&#129528;</span>}
          </div>
          <div className="pc-profile-copy">
            <h2 className="pc-profile-name">{displayName}</h2>
            <p className="pc-profile-grade">{grade}</p>
          </div>
        </article>

        <article className="pc-summary-card">
          <div className="pc-nickname-block">
            <span className="pc-kicker">Nickname</span>
            <strong>{nickname}</strong>
          </div>
          <div className="pc-overall">
            <div className="pc-overall-head">
              <span className="pc-star" aria-hidden="true">
                &#11088;
              </span>
              <span>Overall</span>
              <span className="pc-progress-value">{overallProgress}%</span>
            </div>
            <div
              className="pc-progress-track"
              role="progressbar"
              aria-valuenow={overallProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Overall progress"
            >
              <div
                className={`pc-progress-fill ${
                  overallProgress >= 80 ? "is-high" : overallProgress >= 40 ? "is-mid" : overallProgress > 0 ? "is-low" : ""
                }`.trim()}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        </article>
      </div>

      {allergyAlert ? (
        <div
          ref={allergyAlertRef}
          className={`pc-allergy-alert${allergyAlert.emergency ? " is-emergency" : ""}`}
          role="status"
          aria-label="Active allergy alert"
        >
          <div className="pc-allergy-heading">
            <span className="pc-allergy-kicker">{allergyAlert.emergency ? "Emergency" : "Active now"}</span>
            <p>
              {allergyAlert.emergency
                ? `The teacher sent an emergency notice. Watch ${firstName}'s listed allergies.`
                : `The teacher marked an allergy reaction in class. This is what to expect for ${firstName}.`}
            </p>
          </div>
          {highlightedAllergies.length ? (
            <ul className="pc-allergy-list">
              {highlightedAllergies.map((item) => (
                <li key={item.id} className="is-active">
                  <span>
                    <b>{item.name}</b>
                    {item.description ? <small>{item.description}</small> : <small>Keep this allergen away and contact the teacher if symptoms start.</small>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pc-allergy-empty">No allergy list yet. Add the allergens below so you and the teacher know what to watch for.</p>
          )}
          <button type="button" className="pc-allergy-dismiss" onClick={dismissAllergyAlert}>
            Got it
          </button>
        </div>
      ) : null}

      {child?.id ? (
      <section className={`pc-allergy-card${allergyAlert ? " is-watching" : ""}`} aria-label="Allergy card">
        <div className="pc-allergy-heading">
          <span className="pc-allergy-kicker">Allergy</span>
          <p>List {firstName}&apos;s allergies.</p>
        </div>
        <form
          className="pc-allergy-form"
          onSubmit={(event) => {
            event.preventDefault();
            void addAllergy();
          }}
        >
          <label>
            Allergy
            <input
              value={allergyName}
              maxLength={80}
              placeholder="Example: Peanuts"
              onChange={(event) => setAllergyName(event.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              value={allergyDescription}
              maxLength={280}
              placeholder="What happens, and what to avoid or do"
              onChange={(event) => setAllergyDescription(event.target.value)}
            />
          </label>
          {allergyError ? <p className="pc-allergy-error">{allergyError}</p> : null}
          <button type="submit" disabled={allergySaving || !allergyName.trim()}>
            {allergySaving ? "Saving…" : "Add allergy"}
          </button>
        </form>
        {allergies.length ? (
          <ul className="pc-allergy-list">
            {allergies.map((item) => (
              <li key={item.id} className={activeAllergyNames.has(item.name.trim().toLowerCase()) ? "is-active" : undefined}>
                <span>
                  <b>{item.name}</b>
                  {item.description ? <small>{item.description}</small> : null}
                </span>
                <button type="button" onClick={() => void removeAllergy(item.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pc-allergy-empty">No allergies listed yet.</p>
        )}
      </section>
      ) : null}

      <section className="pc-main-card" aria-label="Child profile and settings">
        <div className="pc-section">
          <h2 className="pc-section-heading">Child Details</h2>
          <ul className="pc-detail-grid">
            <li className="pc-detail-tile">
              <span className="pc-detail-icon" aria-hidden="true">
                &#127881;
              </span>
              <span className="pc-detail-copy">
                <span className="pc-kicker">Birthday</span>
                <strong>{birthdayText}</strong>
              </span>
            </li>
            <li className="pc-detail-tile">
              <span className="pc-detail-icon" aria-hidden="true">
                &#9203;
              </span>
              <span className="pc-detail-copy">
                <span className="pc-kicker">Age</span>
                <strong>{ageText}</strong>
              </span>
            </li>
          </ul>
        </div>

        <hr className="pc-section-divider" />

        <div className="pc-section">
          <div className="pc-progress-tabs" role="tablist" aria-label="Child achievements, certificates, and attendance">
            <button
              type="button"
              id="pc-achievements-tab"
              role="tab"
              aria-selected={achievementTab === "achievements"}
              aria-controls="pc-achievements-panel"
              className={`pc-section-heading${achievementTab === "achievements" ? " is-active" : ""}`}
              onClick={() => setAchievementTab("achievements")}
            >
              Achievements
            </button>
            <button
              type="button"
              id="pc-certificates-tab"
              role="tab"
              aria-selected={achievementTab === "certificates"}
              aria-controls="pc-certificates-panel"
              className={`pc-section-heading${achievementTab === "certificates" ? " is-active" : ""}`}
              onClick={() => setAchievementTab("certificates")}
            >
              Certificates
            </button>
            <button
              type="button"
              id="pc-attendance-tab"
              role="tab"
              aria-selected={achievementTab === "attendance"}
              aria-controls="pc-attendance-panel"
              className={`pc-section-heading${achievementTab === "attendance" ? " is-active" : ""}`}
              onClick={() => setAchievementTab("attendance")}
            >
              Attendance
            </button>
          </div>
          {achievementTab === "achievements" ? (
            <div id="pc-achievements-panel" role="tabpanel" aria-labelledby="pc-achievements-tab">
              {achievements.length > 0 ? (
                <ul className="pc-achievement-list">
                  {achievements.map((item) => (
                    <li key={item.id} className="pc-achievement-item">
                      <span className="pc-achievement-icon" aria-hidden="true">{item.icon}</span>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pc-achievements-empty">
                  No achievements yet. Play a lesson to earn the first one.
                </p>
              )}
            </div>
          ) : achievementTab === "certificates" ? (
            <div id="pc-certificates-panel" role="tabpanel" aria-labelledby="pc-certificates-tab">
              {gameCertificates.length > 0 ? (
                <ul className="pc-achievement-list pc-certificate-list">
                  {graduation && (
                    <li className="pc-achievement-item">
                      <span className="pc-achievement-icon" aria-hidden="true">🎓</span>
                      <span className="pc-achievement-copy">
                        <b>Certificate of Graduation</b>
                        <small>{graduation.starsLine}</small>
                      </span>
                      <button
                        type="button"
                        className="pc-action-link"
                        onClick={() => {
                          void downloadCertificatePng({
                            childName: displayName,
                            certificateId: `${child?.id}:graduation`,
                            title: "Completed every game",
                            subtitle: "Completed every game",
                            kind: "graduation",
                            starsLine: graduation.starsLine,
                            starTotal: graduation.starTotal,
                            starMax: graduation.starMax,
                          });
                        }}
                      >
                        <Download size={14} aria-hidden="true" />
                        Download
                      </button>
                    </li>
                  )}
                  {gameCertificates.map((item) => {
                    const stars = summarizeLevelStars(questStars[item.key] ?? []);
                    return (
                    <li key={item.key} className="pc-achievement-item">
                      <span className="pc-achievement-icon" aria-hidden="true">📜</span>
                      <span className="pc-achievement-copy">
                        <b>{item.title}</b>
                        <small>{item.subject} · {stars.starsLine}</small>
                      </span>
                      <button
                        type="button"
                        className="pc-action-link"
                        onClick={() => {
                          void downloadCertificatePng({
                            childName: displayName,
                            certificateId: `${child?.id}:${item.key}`,
                            title: item.title,
                            subtitle: `${item.subject} · Completed all 3 levels`,
                            kind: certificateKindForGame(stars.perfect),
                            starsLine: stars.starsLine,
                            starTotal: stars.starTotal,
                            starMax: stars.starMax,
                          });
                        }}
                      >
                        <Download size={14} aria-hidden="true" />
                        Download
                      </button>
                    </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="pc-achievements-empty">
                  No certificates yet. Complete all levels of a game to earn one.
                </p>
              )}
            </div>
          ) : (
            <div id="pc-attendance-panel" role="tabpanel" aria-labelledby="pc-attendance-tab">
              {attendanceNotices.length > 0 && (
                <ul className="pc-attendance-notices">
                  {attendanceNotices.map((item) => (
                    <li
                      key={item.id}
                      id={`pc-attendance-notice-${item.id}`}
                      ref={(node) => { noticeRefs.current[item.id] = node; }}
                      className={`pc-attendance-notice${focusedNoticeId === item.id ? " is-focused" : ""}`}
                    >
                      <small>Teacher notice</small>
                      <b>{item.title}</b>
                      {item.body ? <p>{item.body}</p> : null}
                      {item.attachment?.text ? (
                        <div className="pc-attendance-file">
                          <Paperclip />
                          <span>
                            <b>{item.attachment.name}</b>
                            <small>PDF attachment</small>
                          </span>
                          <button
                            type="button"
                            onClick={() => setRecordPreview({ name: item.attachment!.name, text: item.attachment!.text })}
                          >
                            <Eye /> View
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadTextPdf(item.attachment!.name, item.attachment!.text)}
                          >
                            <Download /> Save
                          </button>
                        </div>
                      ) : null}
                      <em>{new Date(item.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</em>
                    </li>
                  ))}
                </ul>
              )}
              <div className="pc-attendance-month">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setAttendanceMonth((current) => shiftMonth(current, -1))}
                >
                  ‹
                </button>
                <b>{monthTitle(attendanceMonth)}</b>
                <button
                  type="button"
                  aria-label="Next month"
                  disabled={isAfterCurrentMonth(shiftMonth(attendanceMonth, 1))}
                  onClick={() => setAttendanceMonth((current) => shiftMonth(current, 1))}
                >
                  ›
                </button>
              </div>
              {attendanceHasMarks ? (
                <>
                  <ul className="pc-attendance-summary">
                    {(["Present", "Late", "Absent", "Excused"] as const).map((status) => (
                      <li key={status} className={`pc-attendance-${status.toLowerCase()}`}>
                        <b>{attendanceSummary[status]}</b>
                        <small>{status}</small>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="pc-achievements-empty">
                  No attendance recorded for {monthTitle(attendanceMonth)}.
                </p>
              )}
            </div>
          )}
        </div>

        <hr className="pc-section-divider" />

        <div className="pc-section">
          <h2 className="pc-section-heading">Login &amp; Access Settings</h2>

          <div className="pc-settings-stack">
            <div className="pc-settings-row">
              <span className="pc-settings-label">PIN Login</span>
              <span className="pc-pin-dots" aria-label="PIN hidden">
                &#9679; &#9679; &#9679; &#9679;
              </span>
              <button
                type="button"
                className="pc-manage-pin-button"
                aria-label="Edit child PIN"
                onClick={() => {
                  setPinError("");
                  setOldPin("");
                  setNewPin("");
                  setConfirmPin("");
                  setShowPin(false);
                  setPinModalOpen(true);
                }}
              >
                Manage PIN
              </button>
            </div>

            <div className="pc-settings-row">
              <span className="pc-settings-label">Assigned Device</span>
              <span className="pc-settings-value">{deviceLabel ?? "No device linked yet"}</span>
              {deviceLabel && (
                <button type="button" className="pc-action-link" onClick={handleRemoveDevice}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {pinModalOpen && (
        <div className="pc-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pin-modal-title">
          <div className="pc-modal">
            <h3 id="pin-modal-title">Edit child PIN</h3>
            <p>Enter the current PIN, then set a new 4-digit PIN for {firstName} to use on the student login screen.</p>
            {pinError && <p className="pc-modal-error">{pinError}</p>}
            <div className="pc-pin-field">
              <input
                className="pc-modal-input"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                placeholder="Old PIN"
                value={oldPin}
                onChange={(e) => setOldPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
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
                {pinSaving ? "Saving\u2026" : "Save PIN"}
              </button>
            </div>
          </div>
        </div>
      )}
      {recordPreview && previewRecord && (
        <div className="pc-pdf-overlay" onMouseDown={() => setRecordPreview(null)}>
          <section className="pc-pdf-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <span><small>ATTENDANCE RECORD</small><b>{recordPreview.name}</b></span>
              <button type="button" aria-label="Close attachment" onClick={() => setRecordPreview(null)}>
                <X />
              </button>
            </header>
            <div className="pc-pdf-record">
              <section className="pc-pdf-summary">
                <div className="pc-pdf-summary-heading">
                  <small>MONTHLY SUMMARY</small>
                  <h3>{previewRecord.title.replace(/^Monthly attendance record\s*/i, "").replace(/^\(|\)$/g, "") || previewRecord.title}</h3>
                  {previewRecord.learner && <p>{previewRecord.learner}{previewRecord.section ? ` · ${previewRecord.section}` : ""}</p>}
                </div>
                {previewRecord.preparedBy && <p className="pc-pdf-prepared">Prepared by <b>{previewRecord.preparedBy}</b></p>}
                {previewRecord.totals && (
                  <div className="pc-pdf-counts" aria-label="Attendance totals">
                    {(["Present", "Late", "Absent", "Excused"] as const).map((status) => (
                      <div className={`pc-pdf-count pc-pdf-count--${status.toLowerCase()}`} key={status}>
                        <b>{attendanceCount(status)}</b>
                        <span>{status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              {previewRecord.days.length ? (
                <div className="pc-attendance-table-wrap">
                  <table className="pc-attendance-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Day</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRecord.days.map((day) => (
                        <tr key={`${day.day}-${day.weekday}`}>
                          <td className="pc-attendance-date">{day.day}</td>
                          <td><span className="pc-attendance-weekday">{day.weekday}</span></td>
                          <td><span className={`pc-attendance-status ${day.status !== "—" ? day.status.toLowerCase() : "unmarked"}`}>{day.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre>{recordPreview.text}</pre>
              )}
            </div>
            <button
              type="button"
              className="pc-pdf-download"
              onClick={() => downloadTextPdf(recordPreview.name, recordPreview.text)}
            >
              <Download /> Download PDF
            </button>
          </section>
        </div>
      )}
    </ParentLayout>
  );
}
