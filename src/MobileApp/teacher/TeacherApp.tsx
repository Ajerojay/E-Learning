import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, Award, BarChart3, Bell, BookOpen, CalendarDays, Camera,
  Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, FilePlus2,
  HeartPulse, Home, LogOut, Mail, Menu, MoreHorizontal,
  Pencil, Plus, Search, Settings, ShieldCheck, Star, Trash2, Upload,
  UserRound, Users, Video, X, Send, Trophy,
} from "lucide-react";
import logo from "../../../images/learnease logo-no bg.png";
import { supabase } from "../../lib/supabase";
import { buildChildAchievements, type ChildActivityRow, type ChildCategoryProgressRow } from "../../lib/childProgress";
import { SUBJECT_KEYS, type SubjectKey } from "../../lib/childProgress";
import { getStudentGameAccess, saveStudentGameAccess } from "../../lib/studentGameAccess";
import { getActivityConfig, saveActivityConfig, type ActivityConfig } from "../../lib/activityConfig";
import { createOfflineLessonUrl, getOfflineLessons, removeOfflineLesson, saveOfflineLesson } from "../../lib/offlineLessonStore";
import { cacheOfflineLessons, cacheOfflineChild, getOfflineChildrenFromSqlite, getOfflineLessonsFromSqlite } from "../../lib/offlineSqlite";
import { getAttendanceRecords, localDateKey, saveAttendanceRecords } from "../../lib/attendance";
import { getRecentClassActivity, sendParentAnnouncement } from "../../lib/supabaseData";

type PageKey = "dashboard" | "students" | "lessons" | "activities" | "attendance" | "announcements" | "health" | "rewards" | "settings";
type Notify = (text: string) => void;

const navItems = [
  { key: "dashboard", label: "Dashboard", icon: Home },
  { key: "students", label: "Students", icon: Users },
  { key: "lessons", label: "Lessons & Videos", icon: Video },
  { key: "activities", label: "Activities & Quizzes", icon: Activity },
  { key: "attendance", label: "Attendance", icon: CalendarDays },
  { key: "announcements", label: "Announcements", icon: Mail },
  { key: "health", label: "Health Monitoring", icon: HeartPulse },
  { key: "rewards", label: "Rewards", icon: Award },
  { key: "settings", label: "Profile & Settings", icon: Settings },
] as const;

const lessonCategories = ["Colors", "Shapes", "Letters", "Numbers", "Phonics", "Logic"] as const;
const lessonIcons: Record<string, string> = { Colors: "🎨", Shapes: "🔷", Letters: "🔤", Numbers: "🔢", Phonics: "🔊", Logic: "🧩", Others: "📚" };
const categoryToDb = (category: string) => category === "Letters" ? "Alphabets" : category;
const categoryFromDb = (category: string) => category === "Alphabets" ? "Letters" : category;

type LessonRecord = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  video_path: string;
  is_published: boolean;
  offlineUrl?: string;
  offlineStatus?: "queued";
};

type RecentGameActivity = {
  id: string;
  childName: string;
  category: string;
  gameTitle: string;
  score: number;
  finished: boolean;
  opened: boolean;
  createdAt: string;
};

function teacherIdentity() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const name = user.full_name || user.teacher_name || user.name || user.username || "Teacher";
    return {
      name: String(name),
      firstName: String(name).trim().split(/\s+/)[0] || "Teacher",
      email: String(user.email || ""),
      section: String(user.section || user.handled_section || user.grade_level || ""),
      id: String(user.id || user.teacher_id || ""),
      role: String(user.position || user.title || "Teacher"),
    };
  } catch { return { name: "Teacher", firstName: "Teacher", email: "", section: "", id: "", role: "Teacher" }; }
}

function relativeActivityTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function activityBadge(category: string) {
  const badges: Record<string, string> = { colors: "🎨", shapes: "🔷", letters: "🔤", numbers: "🔢", phonics: "🔊", logic: "🧩" };
  return badges[category.toLowerCase()] ?? "⭐";
}

function readPresentCount(childIds: string[], today = localDateKey()) {
  let history: Record<string, Record<string, string>> = {};
  try { history = JSON.parse(localStorage.getItem("learnease.attendanceHistory") || "{}"); } catch { /* ignore invalid cache */ }
  return childIds.filter(id => history[id]?.[today] === "Present").length;
}

function useClassSummary() {
  const [summary, setSummary] = useState<{ total: number; present: number; loading: boolean; recent: RecentGameActivity[] }>({ total: 0, present: 0, loading: true, recent: [] });
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [{ data: initialStudents, error: initialStudentError }, activityRows] = await Promise.all([
        supabase.from("children_accounts").select("id, child_name, first_name, last_name, is_active, last_active_at"),
        getRecentClassActivity(25),
      ]);
      let students = initialStudents;
      let studentError = initialStudentError;
      if (studentError && /last_active_at/i.test(studentError.message)) {
        const fallback = await supabase.from("children_accounts").select("id, child_name, first_name, last_name, is_active");
        students = fallback.data?.map(row => ({ ...row, last_active_at: null })) ?? null;
        studentError = fallback.error;
      }
      if (!active) return;
      if (studentError) {
        const cachedStudents = await getOfflineChildrenFromSqlite();
        const enrolled = cachedStudents.filter(row => row.is_active !== 0);
        setSummary({ total: enrolled.length, present: readPresentCount(enrolled.map(row => String(row.id))), loading: false, recent: [] });
        return;
      }
      await Promise.all((students ?? []).map(row => cacheOfflineChild({
        id: String(row.id),
        childName: row.child_name,
        firstName: row.first_name,
        lastName: row.last_name,
        isActive: row.is_active,
      })));
      const rows = students ?? [];
      const enrolledRows = rows.filter(row => row.is_active !== false);
      const enrolledIds = enrolledRows.map(row => String(row.id));
      const today = localDateKey();
      const remoteRecords = await getAttendanceRecords(enrolledIds);
      if (remoteRecords.length) {
        let history: Record<string, Record<string, string>> = {};
        try { history = JSON.parse(localStorage.getItem("learnease.attendanceHistory") || "{}"); } catch { history = {}; }
        remoteRecords.forEach(record => {
          history[record.child_id] ||= {};
          history[record.child_id][record.attendance_date] = record.status;
        });
        localStorage.setItem("learnease.attendanceHistory", JSON.stringify(history));
      }
      const names = new Map(rows.map(row => {
        const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
        return [String(row.id), row.child_name?.trim() || fullName || "Unnamed learner"];
      }));
      const recent = activityRows.map(row => ({
        id: row.id,
        childName: names.get(row.childId) ?? "Student",
        category: row.categoryCode || "activity",
        gameTitle: row.gameTitle.trim() || `${String(row.categoryCode || "Learning").replace(/^./, letter => letter.toUpperCase())} Quest`,
        score: Math.round(row.score || 0),
        finished: row.finished,
        opened: !row.finished && row.score <= 0,
        createdAt: row.createdAt,
      }));
      if (!active) return;
      setSummary({ total: enrolledRows.length, present: readPresentCount(enrolledIds, today), loading: false, recent });
    };
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return summary;
}

function Heading({ eyebrow, title, detail, children }: { eyebrow: string; title: string; detail: string; children?: React.ReactNode }) {
  return <div className="ta-heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div><div className="ta-heading-actions">{children}</div></div>;
}

function Dashboard({ go, notify }: { go: (key: PageKey) => void; notify: Notify }) {
  const classSummary = useClassSummary();
  const teacher = teacherIdentity();
  const date = new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const quickAccess = navItems.filter(item => item.key !== "dashboard");
  const metrics = [
    ["Total Students", classSummary.loading ? "…" : String(classSummary.total), `${classSummary.total} enrolled`, Users, "blue", "students"],
    ["Students Present", classSummary.loading ? "…" : String(classSummary.present), `${classSummary.present} present · ${Math.max(0, classSummary.total - classSummary.present)} not yet`, CalendarDays, "green", "attendance"],
    ["Active Learning Quests", String(SUBJECT_KEYS.filter(key => getActivityConfig(key).open).length), "Modules open", Activity, "pink", "activities"],
    ["Recorded Activities", String(classSummary.recent.length), "Recent attempts", Star, "purple", "activities"],
  ] as const;
  return <>
    <section className="ta-reference-greeting">
      <img src={logo} alt="LearnEase" />
      <div><h1>Good Morning,<br />{teacher.firstName}!</h1><p>{date}</p></div>
      <button aria-label="Open notifications" onClick={() => notify("No new notifications")}><Bell /></button>
      <button aria-label="Open help" onClick={() => notify("Teacher help center opened")}><CircleAlert /></button>
    </section>
    <section className="ta-summary-card">
      <small>Today's Summary</small><h2>Class attendance and learning overview</h2>
      <div>
        <button onClick={() => go("students")}><strong>{classSummary.loading ? "…" : classSummary.total}</strong><span>Students</span></button>
        <button onClick={() => go("attendance")}><strong>{classSummary.loading ? "…" : classSummary.present}</strong><span>Present</span></button>
        <button onClick={() => go("activities")}><strong>{SUBJECT_KEYS.filter(key => getActivityConfig(key).open).length}</strong><span>Active Quests</span></button>
        <button onClick={() => go("activities")}><strong>{classSummary.recent.length}</strong><span>Recent Attempts</span></button>
      </div>
    </section>
    <section className="ta-quick-section">
      <header><div><h2>Quick Access</h2><p>Open a teacher management page</p></div><span>{quickAccess.length} tools</span></header>
      <div className="ta-quick-grid">{quickAccess.map(({ key, label, icon: Icon }, index) => <button onClick={() => go(key)} key={key}><i className={`tone-${index % 4}`}><Icon /></i><span><b>{label}</b><small>Open page</small></span><strong>›</strong></button>)}</div>
    </section>
    <section className="ta-hero"><div><span>{teacher.section ? teacher.section.toUpperCase() : "TEACHER PORTAL"}</span><h1>Good Morning, {teacher.firstName}! 👋</h1><p>Here’s the latest information recorded for your classroom.</p><small><CalendarDays />{date}</small></div><div>🌈<i>☁️</i></div></section>
    <section className="ta-metrics">{metrics.map(([title, value, sub, Icon, tone, target]) => <button className={tone} onClick={() => go(target)} key={title}><i><Icon /></i><span><small>{title}</small><strong>{value}</strong><em>{sub}</em></span><b>View details →</b></button>)}</section>
    <section className="ta-card ta-recent-wide"><header><span className="purple"><Activity /></span><div><h2>Recent Student Activity</h2><p>{classSummary.loading ? "Loading game activity…" : `${classSummary.recent.length} recent game ${classSummary.recent.length === 1 ? "activity" : "activities"}`}</p></div><b className="ta-live"><i /> Live</b></header><div className="ta-feed">{!classSummary.loading && classSummary.recent.length === 0 && <div className="ta-feed-empty"><Activity /><b>No game activity yet</b><small>When a learner opens or finishes a game, it appears here.</small></div>}{classSummary.recent.map(item => { const action = item.finished ? "completed" : item.opened ? "opened" : "played"; const text = `${item.childName} ${action} ${item.gameTitle}`; return <button onClick={() => notify(`${text}${item.opened ? "" : ` · Score ${item.score}%`}`)} key={item.id}><i>🧒</i><span><b>{text}</b><small>{relativeActivityTime(item.createdAt)}{item.opened ? " · Opened a game" : ` · Score ${item.score}%`}</small></span><em>{activityBadge(item.category)}</em></button>; })}</div></section>
  </>;
}

type DatabaseStudent = {
  id: string;
  parentId: string | null;
  name: string;
  age: number | null;
  section: string;
  stars: number;
  rate: number;
  status: "Online" | "Offline" | "Unenrolled";
  avatar: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: string | null;
  pinCode: string | null;
  enrolled: boolean;
  lastActiveAt: string | null;
};

function getPresenceStatus(enrolled: boolean, lastActiveAt: string | null): DatabaseStudent["status"] {
  if (!enrolled) return "Unenrolled";
  if (!lastActiveAt) return "Offline";
  return Date.now() - new Date(lastActiveAt).getTime() < 2 * 60 * 1000 ? "Online" : "Offline";
}

function studentPresenceLabel(student: DatabaseStudent) {
  if (!student.enrolled) return "Unenrolled";
  if (student.status === "Online") return "Online now";
  return "Enrolled";
}

function getStudentAge(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const birthday = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birthday.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  const beforeBirthday = today.getMonth() < birthday.getMonth() ||
    (today.getMonth() === birthday.getMonth() && today.getDate() < birthday.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

function getSavedAttendanceRate(studentId: string) {
  try {
    const history = JSON.parse(localStorage.getItem("learnease.attendanceHistory") || "{}") as Record<string, Record<string, string>>;
    const statuses = Object.values(history[studentId] || {});
    if (!statuses.length) return 0;
    const attended = statuses.filter(status => status === "Present" || status === "Late").length;
    return Math.round((attended / statuses.length) * 100);
  } catch { return 0; }
}

function Students({ notify }: { notify: Notify }) {
  const [students, setStudents] = useState<DatabaseStudent[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [profile, setProfile] = useState<DatabaseStudent | null>(null);
  const [achievementStudent, setAchievementStudent] = useState<DatabaseStudent | null>(null);
  const [achievements, setAchievements] = useState<{ id: string; icon: string; text: string }[]>([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [studentMenu, setStudentMenu] = useState<string | null>(null);
  const [enrollmentPrompt, setEnrollmentPrompt] = useState<{ student: DatabaseStudent; enroll: boolean } | null>(null);
  const [enrollmentSaving, setEnrollmentSaving] = useState(false);
  const [attendanceStudent, setAttendanceStudent] = useState<DatabaseStudent | null>(null);
  const [healthStudent, setHealthStudent] = useState<DatabaseStudent | null>(null);
  const [healthTitle, setHealthTitle] = useState("Health update");
  const [healthMessage, setHealthMessage] = useState("");
  const [, setHealthReady] = useState(false);
  const [healthSending, setHealthSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    const loadStudents = async () => {
      setLoading(true);
      setLoadError("");
      let { data, error } = await supabase
        .from("children_accounts")
        .select("id, parent_id, child_name, first_name, last_name, date_of_birth, sex, grade_level, pin_code, is_active, last_active_at")
        .order("created_at", { ascending: false });

      if (error && /last_active_at/i.test(error.message)) {
        const fallback = await supabase.from("children_accounts").select("id, parent_id, child_name, first_name, last_name, date_of_birth, sex, grade_level, pin_code, is_active").order("created_at", { ascending: false });
        data = fallback.data?.map(row => ({ ...row, last_active_at: null })) ?? null;
        error = fallback.error;
      }

      if (!active) return;
      if (error) {
        const cachedStudents = await getOfflineChildrenFromSqlite();
        if (cachedStudents.length) {
          setStudents(cachedStudents.map((row, index) => {
            const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
            return {
              id: String(row.id), parentId: row.parent_id ? String(row.parent_id) : null, name: row.child_name?.trim() || fullName || "Unnamed learner", age: null,
              section: "Preschool", stars: 0, rate: 0, status: row.is_active ? "Offline" : "Unenrolled",
              avatar: index % 2 === 0 ? "🧒" : "👧", firstName: row.first_name?.trim() || "", lastName: row.last_name?.trim() || "",
              dateOfBirth: null, sex: null, pinCode: row.pin_code, enrolled: row.is_active !== 0, lastActiveAt: null,
            };
          }));
        } else {
          console.error("Teacher student roster error:", error.message);
          setStudents([]);
          setLoadError("Unable to load student records. Please try again.");
        }
      } else {
        await Promise.all((data ?? []).map(row => cacheOfflineChild({
          id: String(row.id),
          childName: row.child_name,
          firstName: row.first_name,
          lastName: row.last_name,
          pinCode: row.pin_code,
          isActive: row.is_active,
        })));
        setStudents((data ?? []).map((row, index) => {
          const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
          return {
            id: String(row.id),
            parentId: row.parent_id ? String(row.parent_id) : null,
            name: row.child_name?.trim() || fullName || "Unnamed learner",
            age: getStudentAge(row.date_of_birth),
            section: row.grade_level?.trim() || "Preschool",
            stars: 0,
            rate: 0,
            status: getPresenceStatus(row.is_active !== false, row.last_active_at),
            avatar: index % 2 === 0 ? "🧒" : "👧",
            firstName: row.first_name?.trim() || "",
            lastName: row.last_name?.trim() || "",
            dateOfBirth: row.date_of_birth,
            sex: row.sex,
            pinCode: row.pin_code,
            enrolled: row.is_active !== false,
            lastActiveAt: row.last_active_at,
          };
        }));
      }
      setLoading(false);
    };
    void loadStudents();
    return () => { active = false; };
  }, []);

  const shown = students.filter(student =>
    student.name.toLowerCase().includes(query.toLowerCase()) &&
    (filter === "All" || (filter === "Enrolled" ? student.enrolled : !student.enrolled))
  );

  const openAchievements = async (student: DatabaseStudent) => {
    setAchievementStudent(student); setAchievements([]); setAchievementsLoading(true);
    const [{ data: activity }, { data: categories }] = await Promise.all([
      supabase.from("v_child_recent_activity").select("category_code,game_code,game_title,score,finished,created_at").eq("child_id", student.id).order("created_at", { ascending: false }),
      supabase.from("v_child_category_progress").select("category_code,category_label,category_score,total_games_in_category,played_games_in_category,completed_games_in_category").eq("child_id", student.id),
    ]);
    setAchievements(buildChildAchievements((activity ?? []) as ChildActivityRow[], (categories ?? []) as ChildCategoryProgressRow[]));
    setAchievementsLoading(false);
  };

  const setEnrollment = async (student: DatabaseStudent, enrolled: boolean) => {
    setEnrollmentSaving(true);
    const { error } = await supabase.from("children_accounts").update({ is_active: enrolled }).eq("id", student.id);
    if (error) { notify(error.message); setEnrollmentSaving(false); return; }
    setStudents(current => current.map(item => item.id === student.id ? { ...item, enrolled, status: getPresenceStatus(enrolled, item.lastActiveAt) } : item));
    setStudentMenu(null);
    setEnrollmentPrompt(null);
    setEnrollmentSaving(false);
    notify(enrolled ? `${student.name} restored to the class` : `${student.name} has been unenrolled`);
  };

  const attendanceHistory = useMemo(() => {
    if (!attendanceStudent) return [] as Array<[string, string]>;
    try {
      const history = JSON.parse(localStorage.getItem("learnease.attendanceHistory") || "{}") as Record<string, Record<string, string>>;
      return Object.entries(history[attendanceStudent.id] || {}).sort(([a], [b]) => b.localeCompare(a));
    } catch { return [] as Array<[string, string]>; }
  }, [attendanceStudent]);

  const openHealthAnnouncement = (student: DatabaseStudent) => {
    setHealthStudent(student);
    setHealthReady(false);
    try {
      const drafts = JSON.parse(localStorage.getItem("learnease.healthAnnouncements") || "{}") as Record<string, { title?: string; message?: string; ready?: boolean }>;
      setHealthTitle(drafts[student.id]?.title || `Health update for ${student.name}`);
      setHealthMessage(drafts[student.id]?.message || `Good day! This is a health update regarding ${student.name}. `);
      setHealthReady(Boolean(drafts[student.id]?.ready));
    } catch {
      setHealthTitle(`Health update for ${student.name}`);
      setHealthMessage(`Good day! This is a health update regarding ${student.name}. `);
    }
  };

  const sendHealthToParent = async () => {
    if (!healthStudent || !healthMessage.trim() || healthSending) return;
    if (!healthStudent.parentId) {
      notify("This learner has no linked parent account.");
      return;
    }
    setHealthSending(true);
    try {
      await sendParentAnnouncement({
        title: healthTitle.trim() || `Health update for ${healthStudent.name}`,
        message: healthMessage.trim(),
        kind: "health",
        parentId: healthStudent.parentId,
        childId: healthStudent.id,
      });
      setHealthStudent(null);
      notify(`Pinned on ${healthStudent.name}'s parent announcements`);
    } catch (error) {
      notify(`Announcement was not sent: ${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setHealthSending(false);
    }
  };

  return <><Heading eyebrow="CLASSROOM ROSTER" title="Students Management" detail="Manage learner profiles, enrollment, and classroom activity."/>
    <section className="ta-card ta-tools"><label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search learner by name…" /></label><div>{["All", "Enrolled", "Unenrolled"].map(value => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div></section>
    {loading && <section className="ta-student-state"><span className="ta-loader"/><h3>Loading student records…</h3><p>Retrieving the latest class information.</p></section>}
    {!loading && loadError && <section className="ta-student-state error"><CircleAlert/><h3>Unable to load roster</h3><p>{loadError}</p></section>}
    {!loading && !loadError && shown.length === 0 && <section className="ta-student-state"><Users/><h3>No student accounts found</h3><p>Students registered by parents will appear here automatically.</p></section>}
    {!loading && !loadError && <section className="ta-students">{shown.map(student => { const attendanceRate = getSavedAttendanceRate(student.id); return <article key={student.id}><div className="ta-pupil-head"><i>{student.avatar}</i><span className={student.status.toLowerCase()}>{student.status === "Offline" ? studentPresenceLabel(student) : student.status}</span><button className="ta-student-more" aria-label={`More actions for ${student.name}`} onClick={() => setStudentMenu(studentMenu === student.id ? null : student.id)}><MoreHorizontal /></button>{studentMenu === student.id && <div className="ta-student-menu"><button onClick={() => { setProfile(student); setStudentMenu(null); }}><UserRound/> View details</button><button onClick={() => { void openAchievements(student); setStudentMenu(null); }}><Trophy/> Achievements</button><button onClick={() => { setEnrollmentPrompt({ student, enroll: !student.enrolled }); setStudentMenu(null); }} className={student.enrolled ? "danger" : "restore"}>{student.enrolled ? <Trash2/> : <Check/>}{student.enrolled ? "Unenroll student" : "Restore enrollment"}</button></div>}</div><h3>{student.name}</h3><p>{student.age === null ? "Age not provided" : `Age ${student.age}`} · {student.section}</p><div className="ta-pupil-stats"><button className="ta-stars-stat" onClick={() => void openAchievements(student)} aria-label={`View ${student.name}'s stars and achievements`}><Star /><b>{student.stars}</b><small>Total Stars · Tap to view</small></button><button className="ta-attendance-stat" onClick={() => setAttendanceStudent(student)} aria-label={`View ${student.name}'s attendance history`}><CalendarDays /><b>{attendanceRate}%</b><small>Attendance · Tap to view</small></button></div><div className="ta-progress"><i style={{ width: `${attendanceRate}%` }} /></div><footer className="ta-student-actions"><button onClick={() => setProfile(student)}><UserRound /> Profile</button><button onClick={() => notify(`Reward panel opened for ${student.name}`)}><Award /> Reward</button><button onClick={() => void openAchievements(student)}><Trophy /> Child's Achievements</button><button className="health" onClick={() => openHealthAnnouncement(student)}><HeartPulse/> Health Monitoring</button></footer></article>; })}</section>}
    {profile && <div className="ta-overlay" onMouseDown={() => setProfile(null)}><section className="ta-modal ta-child-profile" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setProfile(null)}><X /></button><div className="ta-avatar">{profile.avatar}</div><h2>{profile.name}</h2><p>Child details provided by the parent</p><dl><div><dt>First name</dt><dd>{profile.firstName || "Not provided"}</dd></div><div><dt>Last name</dt><dd>{profile.lastName || "Not provided"}</dd></div><div><dt>Date of birth</dt><dd>{profile.dateOfBirth ? new Date(`${profile.dateOfBirth}T00:00:00`).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "Not provided"}</dd></div><div><dt>Age</dt><dd>{profile.age === null ? "Not provided" : `${profile.age} years old`}</dd></div><div><dt>Sex</dt><dd>{profile.sex || "Not provided"}</dd></div><div><dt>Grade level</dt><dd>{profile.section}</dd></div><div><dt>Student PIN</dt><dd>{profile.pinCode || "Not provided"}</dd></div></dl><small>Student ID: {profile.id}</small><button className="ta-primary ta-full" onClick={() => setProfile(null)}>Close Profile</button></section></div>}
    {achievementStudent && <div className="ta-overlay" onMouseDown={() => setAchievementStudent(null)}><section className="ta-modal ta-achievements-modal" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setAchievementStudent(null)}><X /></button><div className="ta-avatar"><Trophy /></div><h2>{achievementStudent.name}'s Achievements</h2><p>Earned from completed learning games</p>{achievementsLoading ? <div className="ta-achievement-empty"><span className="ta-loader"/><b>Loading achievements…</b></div> : achievements.length ? <div className="ta-achievement-list">{achievements.map(item => <article key={item.id}><i>{item.icon}</i><span><b>{item.text}</b><small>Earned achievement</small></span></article>)}</div> : <div className="ta-achievement-empty"><Trophy/><b>No achievements yet</b><small>Achievements will appear after this student completes games.</small></div>}<button className="ta-primary ta-full" onClick={() => setAchievementStudent(null)}>Close Achievements</button></section></div>}
    {enrollmentPrompt && <div className="ta-overlay ta-enrollment-overlay" onMouseDown={() => !enrollmentSaving && setEnrollmentPrompt(null)}><section className={`ta-modal ta-enrollment-modal ${enrollmentPrompt.enroll ? "restore" : "unenroll"}`} onMouseDown={event => event.stopPropagation()} role="alertdialog" aria-modal="true"><div className="ta-enrollment-sparkles" aria-hidden="true"><i>⭐</i><i>🌈</i><i>✨</i></div><div className="ta-enrollment-avatar">{enrollmentPrompt.student.avatar}<span>{enrollmentPrompt.enroll ? "↩" : "👋"}</span></div><h2>{enrollmentPrompt.enroll ? "Welcome Back!" : "Pause Enrollment?"}</h2><p>{enrollmentPrompt.enroll ? <>Restore <b>{enrollmentPrompt.student.name}</b> to the class?</> : <>Are you sure you want to unenroll <b>{enrollmentPrompt.student.name}</b>?</>}</p><div className="ta-enrollment-note">{enrollmentPrompt.enroll ? <><Check/><span><b>Student access will return</b><small>They can sign in and continue their learning games.</small></span></> : <><ShieldCheck/><span><b>Their learning memories stay safe</b><small>Progress, stars, and achievements will not be deleted.</small></span></>}</div><div className="ta-enrollment-actions"><button disabled={enrollmentSaving} onClick={() => setEnrollmentPrompt(null)}><X/> Not now</button><button disabled={enrollmentSaving} onClick={() => void setEnrollment(enrollmentPrompt.student, enrollmentPrompt.enroll)}>{enrollmentSaving ? <span className="ta-button-loader"/> : enrollmentPrompt.enroll ? <Check/> : <Trash2/>}{enrollmentSaving ? "Saving…" : enrollmentPrompt.enroll ? "Restore Student" : "Yes, Unenroll"}</button></div></section></div>}
    {attendanceStudent && <div className="ta-overlay" onMouseDown={() => setAttendanceStudent(null)}><section className="ta-modal ta-student-attendance-view" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setAttendanceStudent(null)}><X/></button><div className="ta-quick-modal-title"><i><CalendarDays/></i><span><h2>{attendanceStudent.name}</h2><p>Complete attendance history</p></span></div>{attendanceHistory.length ? <div className="ta-student-attendance-list">{attendanceHistory.map(([date, status]) => <div key={date}><span><b>{new Intl.DateTimeFormat("en-PH", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T00:00:00`))}</b><small>{attendanceStudent.section}</small></span><em className={status.toLowerCase()}>{status}</em></div>)}</div> : <div className="ta-quick-empty"><CalendarDays/><b>No attendance record yet</b><small>Saved attendance for this learner will appear here.</small></div>}</section></div>}
    {healthStudent && <div className="ta-overlay" onMouseDown={() => setHealthStudent(null)}><section className="ta-modal ta-student-health-compose" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setHealthStudent(null)}><X/></button><div className="ta-quick-modal-title"><i><HeartPulse/></i><span><h2>Send Health Announcement</h2><p>Pin this only on {healthStudent.name}'s parent announcements.</p></span></div><div className={`ta-health-recipient ${healthStudent.parentId ? "linked" : "missing"}`}><UserRound/><span><small>Automatic recipient</small><b>{healthStudent.name}'s Parent</b><em>{healthStudent.parentId ? "Linked parent account" : "No linked parent account"}</em></span>{healthStudent.parentId ? <Check/> : <CircleAlert/>}</div><label>Sender<input value={teacherIdentity().name} readOnly/></label><label>Announcement title <small>Optional</small><input value={healthTitle} onChange={event => setHealthTitle(event.target.value)} placeholder="Health update"/></label><label>Message<textarea maxLength={300} value={healthMessage} onChange={event => setHealthMessage(event.target.value)} placeholder="Write the learner's health update…"/><small>{healthMessage.length}/300</small></label><div className="ta-student-health-templates"><header><b>Quick Health Templates</b><small>Tap to use</small></header><div>{[["Health Reminder", `Good day! Please remember to update us about ${healthStudent.name}'s current health condition.`],["Health Concern", `Good day! We observed a minor health concern for ${healthStudent.name} today. Please contact the teacher for details.`],["Wellness Check", `Good day! ${healthStudent.name}'s classroom wellness check has been recorded.`]].map(([title, message]) => <button type="button" key={title} onClick={() => { setHealthTitle(title); setHealthMessage(message); }}><b>{title}</b><span>{message}</span></button>)}</div></div><div className="ta-health-compose-actions ta-send-only"><button className="ta-primary" disabled={healthSending || !healthMessage.trim() || !healthStudent.parentId} onClick={() => void sendHealthToParent()}><Send/>{healthSending ? "Sending…" : "Pin to Parent"}</button></div><p className="ta-sms-note">Only this learner's parent will see it, pinned at the top of their Announcements.</p></section></div>}
  </>;
}

function Lessons({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState("All");
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [upload, setUpload] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<LessonRecord | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("Colors");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [preview, setPreview] = useState<{ lesson: LessonRecord; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const syncOfflineLessons = async () => {
    if (!navigator.onLine) return;
    const queued = await getOfflineLessons();
    for (const lesson of queued) {
      const videoPath = `Nursery/${lesson.category}/${Date.now()}-${lesson.videoName}`;
      const uploadResult = await supabase.storage.from("lesson-videos").upload(videoPath, lesson.video, { upsert: false });
      if (uploadResult.error) continue;
      const insertResult = await supabase.from("video_lessons").insert([{
        title: lesson.title,
        description: lesson.description,
        grade_level: lesson.gradeLevel,
        category: lesson.category,
        video_path: videoPath,
        is_published: true,
      }]);
      if (!insertResult.error) await removeOfflineLesson(lesson.id);
    }
  };

  const fetchLessons = async () => {
    setLoading(true); setLoadError("");
    const { data, error } = await supabase.from("video_lessons").select("id,title,description,category,video_path,is_published").eq("is_published", true).order("created_at", { ascending: false });
    const queued = await getOfflineLessons();
    const queuedLessons: LessonRecord[] = queued.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      category: lesson.category,
      video_path: "",
      is_published: true,
      offlineUrl: createOfflineLessonUrl(lesson),
      offlineStatus: "queued",
    }));
    if (error && !queuedLessons.length) {
      const cachedLessons = await getOfflineLessonsFromSqlite();
      if (cachedLessons.length) {
        setLessons([...queuedLessons, ...cachedLessons.map(lesson => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          category: lesson.category,
          video_path: lesson.video_path,
          is_published: true,
        }))]);
      } else {
        console.error("Teacher lessons error:", error.message);
        setLoadError("Unable to load video lessons. Please try again.");
        setLessons([]);
      }
    } else {
      await cacheOfflineLessons((data ?? []).map(lesson => ({ id: String(lesson.id), title: lesson.title, description: lesson.description, category: lesson.category, videoPath: lesson.video_path, isPublished: lesson.is_published })));
      setLessons([...queuedLessons, ...((data ?? []) as LessonRecord[])]);
    }
    setLoading(false);
  };
  useEffect(() => {
    const refresh = () => { void syncOfflineLessons().then(fetchLessons); };
    void refresh();
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, []);

  const closeForm = () => { setUpload(false); setEditing(null); setTitle(""); setCategory("Colors"); setDescription(""); setFile(null); setVideoUrl(""); };
  const openNew = () => {
    const used = new Set(lessons.map(item => categoryFromDb(item.category)));
    const available = lessonCategories.find(item => !used.has(item));
    if (!available) { notify("Maximum of 6 lessons reached. Edit an existing lesson to replace its video."); return; }
    setCategory(available); setUpload(true);
  };
  const openEdit = (lesson: LessonRecord) => { setEditing(lesson); setTitle(lesson.title); setCategory(categoryFromDb(lesson.category)); setDescription(lesson.description ?? ""); setFile(null); setVideoUrl(/^https?:\/\//i.test(lesson.video_path) ? lesson.video_path : ""); setUpload(true); };
  const saveLesson = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanUrl = videoUrl.trim();
    if (!title.trim() || (!editing && !file && !cleanUrl)) { notify("Choose a video file or enter a direct video URL."); return; }
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) { notify("Enter a complete video URL starting with http:// or https://."); return; }
    const duplicate = lessons.some(item => item.id !== editing?.id && categoryFromDb(item.category) === category);
    if (duplicate) { notify(`${category} already has a lesson. Edit that lesson instead.`); return; }
    const configuredCategories = new Set(lessons.map(item => categoryFromDb(item.category)).filter(item => lessonCategories.includes(item as typeof lessonCategories[number])));
    if (!editing && configuredCategories.size >= lessonCategories.length) { notify("Maximum of 6 lessons reached."); return; }
    setSaving(true);
    try {
      if (!navigator.onLine && file && !editing) {
        await saveOfflineLesson({
          id: `offline-${Date.now()}-${file.name}`,
          title: title.trim(),
          description: description.trim() || `${category} lesson video`,
          category: categoryToDb(category),
          gradeLevel: "Nursery",
          videoName: file.name,
          videoType: file.type,
          video: file,
          createdAt: Date.now(),
        });
        closeForm();
        await fetchLessons();
        notify("Saved on this device. It will upload when internet returns.");
        return;
      }
      let videoPath = editing?.video_path ?? "";
      if (cleanUrl) {
        videoPath = cleanUrl;
      } else if (file) {
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        videoPath = `Nursery/${categoryToDb(category)}/${Date.now()}-${cleanName}`;
        const { error } = await supabase.storage.from("lesson-videos").upload(videoPath, file, { upsert: false });
        if (error) throw error;
      }
      const payload = { title: title.trim(), description: description.trim() || `${category} lesson video`, grade_level: "Nursery", category: categoryToDb(category), video_path: videoPath, is_published: true };
      const result = editing
        ? await supabase.from("video_lessons").update(payload).eq("id", editing.id)
        : await supabase.from("video_lessons").insert([payload]);
      if (result.error) throw result.error;
      closeForm(); await fetchLessons(); notify(editing ? "Lesson updated" : "New lesson uploaded");
    } catch (error) {
      console.error("Teacher lesson save error:", error);
      if (file && !editing) {
        await saveOfflineLesson({
          id: `offline-${Date.now()}-${file.name}`,
          title: title.trim(),
          description: description.trim() || `${category} lesson video`,
          category: categoryToDb(category),
          gradeLevel: "Nursery",
          videoName: file.name,
          videoType: file.type,
          video: file,
          createdAt: Date.now(),
        });
        closeForm();
        await fetchLessons();
        notify("Upload paused offline. It will retry automatically.");
      } else notify(error instanceof Error ? error.message : "Unable to save lesson");
    }
    finally { setSaving(false); }
  };
  const archiveLesson = async (lesson: LessonRecord) => {
    if (!window.confirm(`Remove “${lesson.title}” from published lessons?`)) return;
    const { error } = await supabase.from("video_lessons").update({ is_published: false }).eq("id", lesson.id);
    if (error) { notify(error.message); return; }
    setLessons(current => current.filter(item => item.id !== lesson.id)); notify("Lesson removed");
  };
  const previewLesson = async (lesson: LessonRecord) => {
    if (lesson.offlineUrl) {
      setPreview({ lesson, url: lesson.offlineUrl });
      return;
    }
    const rawPath = lesson.video_path?.trim();
    if (!rawPath) { notify("This lesson does not have a video file yet."); return; }
    setPreviewLoading(true);
    try {
      let url = rawPath;
      if (!/^https?:\/\//i.test(rawPath) && !rawPath.startsWith("blob:") && !rawPath.startsWith("data:")) {
        // Use the exact same public URL flow as the child Lesson page. The
        // lesson-videos bucket is public, so signing/rewriting a legacy path can
        // incorrectly return "Object not found" even while students can play it.
        const { data } = supabase.storage.from("lesson-videos").getPublicUrl(rawPath);
        if (!data.publicUrl) throw new Error("The video preview is unavailable.");
        url = data.publicUrl;
      }
      setPreview({ lesson, url });
    } catch (error) {
      console.error("Teacher video preview error:", error);
      notify(error instanceof Error ? error.message : "Video preview unavailable.");
    } finally { setPreviewLoading(false); }
  };
  const visible = lessons.filter(lesson => tab === "All" || categoryFromDb(lesson.category) === tab);

  return <><Heading eyebrow="CURRICULUM LIBRARY" title="Lessons & Videos" detail="Manage one lesson for each of the six learning games."><button className="ta-primary" onClick={openNew}><Upload /> Upload New Lesson</button></Heading>
    <div className="ta-tabs">{["All", ...lessonCategories].map(value => <button className={tab === value ? "active" : ""} onClick={() => setTab(value)} key={value}>{value}</button>)}</div>
    {loading && <section className="ta-student-state"><span className="ta-loader"/><h3>Loading video lessons…</h3><p>Retrieving the latest learning content.</p></section>}
    {!loading && loadError && <section className="ta-student-state error"><CircleAlert/><h3>Unable to load lessons</h3><p>{loadError}</p></section>}
    {!loading && !loadError && visible.length === 0 && <section className="ta-student-state"><Video/><h3>No video lessons yet</h3><p>Use Upload New Lesson to add the first lesson in this category.</p></section>}
    {!loading && !loadError && <section className="ta-lessons">{visible.map(lesson => { const uiCategory = categoryFromDb(lesson.category); return <article key={lesson.id}><div className="ta-thumb"><span>{lessonIcons[uiCategory] ?? lessonIcons.Others}</span><b>VIDEO</b><button disabled={previewLoading} onClick={() => void previewLesson(lesson)}>{previewLoading ? "…" : "▶"}</button></div><div><span><i>{uiCategory}</i><em>{lesson.offlineStatus === "queued" ? "Waiting to sync" : "Published"}</em></span><h3>{lesson.title}</h3><p>{lesson.description || `${uiCategory} lesson video`}</p><small><Activity /> Attached: {uiCategory === "Others" ? "Custom lesson" : `${uiCategory} Quest`}</small><footer>{lesson.offlineStatus === "queued" ? <button onClick={() => void previewLesson(lesson)}><Video /> Preview</button> : <><button onClick={() => openEdit(lesson)}><Pencil /> Edit</button><button onClick={() => void archiveLesson(lesson)}><Trash2 /> Delete</button></>}</footer></div></article>; })}</section>}
    {preview && <div className="ta-overlay" onMouseDown={() => setPreview(null)}><section className="ta-modal ta-video-modal" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setPreview(null)}><X /></button><div className="ta-video-heading"><i>{lessonIcons[categoryFromDb(preview.lesson.category)] ?? lessonIcons.Others}</i><span><small>{categoryFromDb(preview.lesson.category)} VIDEO LESSON</small><h2>{preview.lesson.title}</h2></span></div><video src={preview.url} controls autoPlay playsInline onError={() => { setPreview(null); notify("This video could not be played. Please upload the video again."); }}>Your device does not support video playback.</video><p>{preview.lesson.description || "Watch this learning video."}</p></section></div>}
    {upload && <div className="ta-overlay" onMouseDown={closeForm}><form className="ta-modal ta-form" onMouseDown={event => event.stopPropagation()} onSubmit={saveLesson}><button type="button" className="ta-close" onClick={closeForm}><X /></button><h2>{editing ? "Edit Video Lesson" : "Upload New Video Lesson"}</h2><p>Choose one of the six lesson categories and provide either a file or a direct video URL.</p><label>Lesson title<select value={category} onChange={event => setCategory(event.target.value)}>{lessonCategories.map(value => <option disabled={lessons.some(item => item.id !== editing?.id && categoryFromDb(item.category) === value)} key={value}>{value}</option>)}</select></label><label>Video title<input required value={title} onChange={event => setTitle(event.target.value)} placeholder="Enter video title" /></label><label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Enter lesson description" /></label><div className="ta-video-source"><label>{editing ? "Replace with video file (optional)" : "Video file"}<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => { setFile(event.target.files?.[0] ?? null); if (event.target.files?.[0]) setVideoUrl(""); }} /></label><span>OR</span><label>{editing ? "Replace with direct video URL (optional)" : "Direct video URL"}<input type="url" value={videoUrl} onChange={event => { setVideoUrl(event.target.value); if (event.target.value) setFile(null); }} placeholder="https://example.com/lesson.mp4" /><small>Use a direct MP4, WebM, or hosted video-file link.</small></label></div><button className="ta-primary ta-full" disabled={saving}>{saving ? "Saving…" : editing ? "Update Lesson" : "Upload Lesson"}</button></form></div>}
  </>;
}

function Activities({ notify }: { notify: Notify }) {
  const games = [
    ["\u{1F3A8}", "Sort the Colors", "Colors"],
    ["\u{1F520}", "Match the Letters", "Letters"],
    ["\u{1F9E9}", "What Comes Next?", "Logic"],
    ["\u{1F50A}", "Listen and Match", "Phonics"],
    ["\u{1F3E0}", "Build the House", "Shapes"],
    ["\u{1F522}", "Count the Raindrops", "Numbers"],
  ] as const;
  const [scores, setScores] = useState<Record<SubjectKey, number>>(() => Object.fromEntries(SUBJECT_KEYS.map(key => [key, 0])) as Record<SubjectKey, number>);
  useEffect(() => {
    let active = true;
    void supabase.from("v_child_category_progress").select("category_code, category_score").then(({ data, error }) => {
      if (!active || error) return;
      const grouped = Object.fromEntries(SUBJECT_KEYS.map(key => [key, [] as number[]])) as Record<SubjectKey, number[]>;
      for (const row of data ?? []) {
        const key = String(row.category_code || "").toLowerCase() as SubjectKey;
        if (grouped[key]) grouped[key].push(Number(row.category_score) || 0);
      }
      setScores(Object.fromEntries(SUBJECT_KEYS.map(key => [key, grouped[key].length ? Math.round(grouped[key].reduce((sum, value) => sum + value, 0) / grouped[key].length) : 0])) as Record<SubjectKey, number>);
    });
    return () => { active = false; };
  }, []);
  const [configs, setConfigs] = useState<Record<SubjectKey, ActivityConfig>>(() => Object.fromEntries(SUBJECT_KEYS.map(key => [key, getActivityConfig(key)])) as Record<SubjectKey, ActivityConfig>);
  const [previewGame, setPreviewGame] = useState<number | null>(null);
  const [configureGame, setConfigureGame] = useState<number | null>(null);
  const [draftConfig, setDraftConfig] = useState<ActivityConfig | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [allowed, setAllowed] = useState<SubjectKey[]>([...SUBJECT_KEYS]);
  const openStudentAccess = async () => {
    const { data, error } = await supabase.from("children_accounts").select("id, child_name, first_name, last_name").eq("is_active", true).order("created_at", { ascending: false });
    if (error) { notify("Unable to load students"); return; }
    const roster = (data ?? []).map(row => ({ id: String(row.id), name: row.child_name?.trim() || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Unnamed learner" }));
    setStudents(roster);
    const firstId = roster[0]?.id || "";
    setSelectedStudent(firstId);
    setAllowed(firstId ? getStudentGameAccess(firstId) : []);
    setAccessOpen(true);
  };
  const chooseStudent = (id: string) => { setSelectedStudent(id); setAllowed(getStudentGameAccess(id)); };
  const toggleAllowed = (key: SubjectKey) => setAllowed(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  const toggleGlobal = (key: SubjectKey) => {
    const next = { ...configs[key], open: !configs[key].open };
    saveActivityConfig(key, next);
    setConfigs(current => ({ ...current, [key]: next }));
  };
  const openConfigure = (index: number, key: SubjectKey) => { setConfigureGame(index); setDraftConfig({ ...configs[key], levels: [...configs[key].levels] }); };
  const saveConfigure = (key: SubjectKey) => {
    if (!draftConfig) return;
    saveActivityConfig(key, draftConfig);
    setConfigs(current => ({ ...current, [key]: draftConfig }));
    setConfigureGame(null); setDraftConfig(null); notify("Activity settings saved");
  };
  return <><Heading eyebrow="GAMIFIED LEARNING" title="Activities & Quizzes" detail="Manage the six learning games, rewards, scores, and availability."/>
    <section className="ta-activity-summary"><div><Activity/><span><b>6 Learning Games</b><small>Colors, Letters, Logic, Phonics, Shapes, and Numbers</small></span></div><button className="ta-secondary" onClick={() => void openStudentAccess()}><Users/> Manage Student Access</button></section>
    <section className="ta-quests">{games.map(([icon, name, category], index) => { const key = category.toLowerCase() as SubjectKey; const config = configs[key]; const rate = scores[key]; return <article key={name}><i>{icon}</i><div className="ta-quest-name"><span>{category} · {config.levels.length} Levels</span><h3>{name}</h3><small>{config.levels.join(", ") || "No levels enabled"}</small></div><button aria-label={`${config.open ? "Close" : "Open"} ${name}`} className={`ta-toggle ${config.open ? "on" : ""}`} onClick={() => toggleGlobal(key)}><i /></button><div className="ta-completion"><span>Class completion <b>{rate}%</b></span><i><em style={{ width: `${rate}%` }} /></i></div><div className="ta-quest-data"><span>Passing score<b>{config.passingScore}%</b></span><span>Star reward<b>⭐ {config.starReward}</b></span><span>Status<b>{config.open ? "Open" : "Closed"}</b></span></div><footer><button onClick={() => setPreviewGame(index)}>Preview</button><button onClick={() => openConfigure(index, key)}><Settings /> Configure</button></footer></article>; })}</section>
    <div className="ta-grid-2 ta-page-summary"><section className="ta-card ta-chart"><header><span><BarChart3 /></span><div><h2>Average Quiz Scores</h2><p>Calculated from recorded student activity</p></div><b>{Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / SUBJECT_KEYS.length)}% average</b></header><div>{games.map(([, , category]) => { const key = category.toLowerCase() as SubjectKey; const value = scores[key]; return <span key={category}><b>{value}%</b><i><em style={{ height: `${value}%` }}/></i><small>{category}</small></span>; })}</div></section><section className="ta-card ta-donut-card"><header><span className="purple"><Activity /></span><div><h2>Module Completion</h2><p>Based on recorded class progress</p></div></header><div className="ta-donut"><b>{Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / SUBJECT_KEYS.length)}%</b><small>Average</small></div>{Object.values(scores).every(value => value === 0) && <div className="ta-feed-empty"><Activity/><b>No activity data yet</b><small>Results will appear after students play.</small></div>}</section></div>
    {accessOpen && <div className="ta-overlay" onMouseDown={() => setAccessOpen(false)}><section className="ta-modal ta-access-modal" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setAccessOpen(false)}><X/></button><div className="ta-access-title"><i><Users/></i><span><h2>Student Game Access</h2><p>Choose which activities this learner can open.</p></span></div>{students.length === 0 ? <div className="ta-access-empty">No enrolled students found.</div> : <><label className="ta-access-student">Student<select value={selectedStudent} onChange={event => chooseStudent(event.target.value)}>{students.map(student => <option value={student.id} key={student.id}>{student.name}</option>)}</select></label><div className="ta-access-games">{games.map(([icon, name, category]) => { const key = category.toLowerCase() as SubjectKey; const enabled = allowed.includes(key); return <button className={enabled ? "enabled" : ""} onClick={() => toggleAllowed(key)} key={key}><i>{icon}</i><span><b>{category}</b><small>{name}</small></span><em>{enabled ? "Allowed" : "Locked"}</em></button>; })}</div><button className="ta-primary ta-full" onClick={() => { saveStudentGameAccess(selectedStudent, allowed); setAccessOpen(false); notify("Student game access saved"); }}><ShieldCheck/> Save Student Access</button></>}</section></div>}
    {previewGame !== null && (() => { const [icon, name, category] = games[previewGame]; const config = configs[category.toLowerCase() as SubjectKey]; return <div className="ta-overlay" onMouseDown={() => setPreviewGame(null)}><section className="ta-modal ta-game-preview" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setPreviewGame(null)}><X/></button><i>{icon}</i><small>ACTIVITY PREVIEW</small><h2>{name}</h2><p>{config.instructions}</p><div><span><b>{config.passingScore}%</b>Passing score</span><span><b>⭐ {config.starReward}</b>Reward</span><span><b>{config.timeLimit ? `${config.timeLimit} min` : "No limit"}</b>Time</span></div><h3>Available Levels</h3><ul>{config.levels.map(level => <li key={level}><Check/> {level}</li>)}</ul></section></div>; })()}
    {configureGame !== null && draftConfig && (() => { const [, name, category] = games[configureGame]; const key = category.toLowerCase() as SubjectKey; return <div className="ta-overlay" onMouseDown={() => setConfigureGame(null)}><form className="ta-modal ta-config-form" onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); saveConfigure(key); }}><button type="button" className="ta-close" onClick={() => setConfigureGame(null)}><X/></button><h2>Configure {name}</h2><p>These settings apply to the whole class.</p><div className="ta-config-pair"><label>Passing score<input type="number" min="1" max="100" value={draftConfig.passingScore} onChange={event => setDraftConfig({ ...draftConfig, passingScore: Number(event.target.value) })}/></label><label>Star reward<input type="number" min="0" max="999" value={draftConfig.starReward} onChange={event => setDraftConfig({ ...draftConfig, starReward: Number(event.target.value) })}/></label></div><label>Time limit (minutes)<input type="number" min="0" max="180" value={draftConfig.timeLimit} onChange={event => setDraftConfig({ ...draftConfig, timeLimit: Number(event.target.value) })}/><small>Use 0 for no time limit.</small></label><label>Instructions<textarea value={draftConfig.instructions} onChange={event => setDraftConfig({ ...draftConfig, instructions: event.target.value })}/></label><fieldset><legend>Available levels</legend>{["Easy", "Medium", "Hard"].map(level => <label key={level}><input type="checkbox" checked={draftConfig.levels.includes(level)} onChange={() => setDraftConfig({ ...draftConfig, levels: draftConfig.levels.includes(level) ? draftConfig.levels.filter(item => item !== level) : [...draftConfig.levels, level] })}/>{level}</label>)}</fieldset><label className="ta-config-open"><input type="checkbox" checked={draftConfig.open} onChange={event => setDraftConfig({ ...draftConfig, open: event.target.checked })}/><span><b>Activity open</b><small>Students can launch this game.</small></span></label><button className="ta-primary ta-full" type="submit"><ShieldCheck/> Save Configuration</button></form></div>; })()}
  </>;
}

function Attendance({ notify }: { notify: Notify }) {
  type AttendanceStatus = "Present" | "Late" | "Absent" | "Excused" | "Unmarked";
  type AttendanceRow = { id: string; name: string; section: string; avatar: string; rate: number; today: AttendanceStatus };
  const ATTENDANCE_KEY = "learnease.attendanceHistory";
  const todayKey = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
  const readHistory = (): Record<string, Record<string, Exclude<AttendanceStatus, "Unmarked">>> => {
    try { return JSON.parse(localStorage.getItem(ATTENDANCE_KEY) || "{}"); } catch { return {}; }
  };
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [calendarStudent, setCalendarStudent] = useState<AttendanceRow | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [classCalendarOpen, setClassCalendarOpen] = useState(false);
  const [classCalendarMonth, setClassCalendarMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [editingAttendance, setEditingAttendance] = useState(true);
  useEffect(() => {
    let active = true;
    const loadAttendanceRoster = async () => {
      setLoading(true);
      setLoadError("");
      const { data, error } = await supabase.from("children_accounts").select("id, child_name, first_name, last_name, grade_level, is_active").order("created_at", { ascending: false });
      if (!active) return;
      if (error) {
        console.error("Teacher attendance roster error:", error.message);
        setRows([]);
        setLoadError("Unable to load the student roster. Please try again.");
      } else {
        const loadedRows = (data ?? []).map((student, index) => {
          const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
          const id = String(student.id);
          return { id, name: student.child_name?.trim() || fullName || "Unnamed learner", section: student.grade_level?.trim() || "Preschool", avatar: index % 2 === 0 ? "🧒" : "👧", rate: 0, today: readHistory()[id]?.[selectedDate] || "Unmarked" } as AttendanceRow;
        });
        const remoteRecords = await getAttendanceRecords(loadedRows.map(row => row.id));
        const history = readHistory();
        remoteRecords.forEach(record => {
          history[record.child_id] ||= {};
          history[record.child_id][record.attendance_date] = record.status;
        });
        localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(history));
        const syncedRows = loadedRows.map(row => ({ ...row, today: history[row.id]?.[selectedDate] || "Unmarked" }) as AttendanceRow);
        setRows(syncedRows);
        setEditingAttendance(!syncedRows.length || !syncedRows.every(row => row.today !== "Unmarked"));
      }
      setLoading(false);
    };
    void loadAttendanceRoster();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const history = readHistory();
    setRows(current => {
      const updated = current.map(row => ({ ...row, today: history[row.id]?.[selectedDate] || "Unmarked" }) as AttendanceRow);
      setEditingAttendance(!updated.length || !updated.every(row => row.today !== "Unmarked"));
      return updated;
    });
  }, [selectedDate]);
  const present = rows.filter(x => x.today === "Present").length;
  const attendanceRate = rows.length ? Math.round(present / rows.length * 100) : 0;
  const attendanceSubmitted = rows.length > 0 && rows.every(row => row.today !== "Unmarked") && !editingAttendance;
  const saveAttendance = async () => {
    const history = readHistory();
    for (const row of rows) {
      history[row.id] ||= {};
      if (row.today === "Unmarked") delete history[row.id][selectedDate];
      else history[row.id][selectedDate] = row.today;
    }
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(history));
    try {
      await saveAttendanceRecords(rows.filter(row => row.today !== "Unmarked").map(row => ({ childId: row.id, date: selectedDate, status: row.today as Exclude<AttendanceStatus, "Unmarked"> })));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Attendance could not sync online.");
      return;
    }
    setEditingAttendance(false);
    notify(`Attendance submitted for ${selectedDate}`);
  };
  const monthDays = calendarStudent ? (() => {
    const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth();
    const blanks = Array.from({ length: new Date(year, month, 1).getDay() }, () => null);
    const days = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1);
    return [...blanks, ...days];
  })() : [];
  const calendarStatus = (day: number) => {
    if (!calendarStudent) return undefined;
    const key = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return readHistory()[calendarStudent.id]?.[key];
  };
  const classMonthDays = (() => {
    const year = classCalendarMonth.getFullYear(); const month = classCalendarMonth.getMonth();
    return [...Array.from({ length: new Date(year, month, 1).getDay() }, () => null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1)];
  })();
  const classDateKey = (day: number) => `${classCalendarMonth.getFullYear()}-${String(classCalendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const classDateRecorded = (day: number) => rows.some(row => readHistory()[row.id]?.[classDateKey(day)] === "Present");
  const openClassDate = (day: number) => { setSelectedDate(classDateKey(day)); setClassCalendarOpen(false); };
  return <><Heading eyebrow="AUTOMATIC DAILY ATTENDANCE" title="Attendance" detail="A learner is marked Present once per day after a successful PIN login."><div className="ta-heading-actions"><button className="ta-class-date" onClick={() => { const date = new Date(`${selectedDate}T00:00:00`); setClassCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1)); setClassCalendarOpen(true); }}><CalendarDays /><span><small>View attendance date</small><b>{new Intl.DateTimeFormat("en-PH", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${selectedDate}T00:00:00`))}</b></span><ChevronDown/></button></div></Heading>
    {loading && <section className="ta-student-state"><CalendarDays/><h3>Loading attendance roster…</h3><p>Retrieving students from Student Management.</p></section>}
    {!loading && loadError && <section className="ta-student-state error"><CircleAlert/><h3>Unable to load attendance</h3><p>{loadError}</p></section>}
    {!loading && !loadError && rows.length === 0 && <section className="ta-student-state"><Users/><h3>No student accounts found</h3><p>Students added to Student Management will appear here automatically.</p></section>}
    {!loading && !loadError && rows.length > 0 && <><section className="ta-att-summary ta-auto-att-summary"><div className="ta-ring"><b>{attendanceRate}%</b></div><div><h2>{present} Present</h2><p>{present} of {rows.length} learners logged in with their PIN</p></div><span className="present"><b>{present}</b>Present</span></section><section className="ta-card ta-roll ta-auto-roll"><header><span><CalendarDays /></span><div><h2>Attendance List — {new Intl.DateTimeFormat("en-PH", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${selectedDate}T00:00:00`))}</h2><p>Attendance is recorded automatically from successful child PIN logins.</p></div></header>{rows.map(p => <div className="ta-roll-row" key={p.id}><i>{p.avatar}</i><button className="ta-att-student" onClick={() => { setCalendarStudent(p); const date = new Date(`${selectedDate}T00:00:00`); setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}><b>{p.name}</b><small>{p.section} · View attendance calendar</small></button><div className="ta-auto-status">{p.today === "Present" ? <span className="present"><Check/> Present</span> : <span className="no-login">No PIN login</span>}</div></div>)}</section></>}
    {classCalendarOpen && <div className="ta-overlay" onMouseDown={() => setClassCalendarOpen(false)}><section className="ta-modal ta-att-calendar ta-class-calendar" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setClassCalendarOpen(false)}><X/></button><div className="ta-calendar-child"><i><Users/></i><span><h2>Class Attendance Calendar</h2><p>Tap a date to view the PIN login attendance list.</p></span></div><div className="ta-calendar-nav"><button onClick={() => setClassCalendarMonth(new Date(classCalendarMonth.getFullYear(), classCalendarMonth.getMonth() - 1, 1))}><ChevronLeft/></button><b>{new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(classCalendarMonth)}</b><button onClick={() => setClassCalendarMonth(new Date(classCalendarMonth.getFullYear(), classCalendarMonth.getMonth() + 1, 1))}><ChevronRight/></button></div><div className="ta-calendar-week">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <b key={day}>{day}</b>)}</div><div className="ta-calendar-grid ta-class-calendar-grid">{classMonthDays.map((day, index) => day === null ? <span key={`blank-${index}`}/> : <button className={`${classDateRecorded(day) ? "recorded" : ""} ${classDateKey(day) === selectedDate ? "selected" : ""}`} onClick={() => openClassDate(day)} key={day}><b>{day}</b><small>{classDateRecorded(day) ? "Has login" : "View list"}</small></button>)}</div><p className="ta-class-calendar-note"><Check/> Green dates contain at least one successful child PIN login.</p></section></div>}
    {calendarStudent && <div className="ta-overlay" onMouseDown={() => setCalendarStudent(null)}><section className="ta-modal ta-att-calendar" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setCalendarStudent(null)}><X/></button><div className="ta-calendar-child"><i>{calendarStudent.avatar}</i><span><h2>{calendarStudent.name}</h2><p>{calendarStudent.section} · PIN login attendance</p></span></div><div className="ta-calendar-nav"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}><ChevronLeft/></button><b>{new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(calendarMonth)}</b><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}><ChevronRight/></button></div><div className="ta-calendar-week">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <b key={day}>{day}</b>)}</div><div className="ta-calendar-grid">{monthDays.map((day, index) => day === null ? <span key={`blank-${index}`}/> : <div className={calendarStatus(day) === "Present" ? "present" : "unmarked"} key={day}><b>{day}</b><small>{calendarStatus(day) === "Present" ? "Present" : "—"}</small></div>)}</div><div className="ta-calendar-legend"><span className="present"><i/>Present via PIN login</span></div></section></div>}
  </>;
}

function Announcements({ notify }: { notify: Notify }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!title.trim() || !message.trim() || sending) return;
    setSending(true);
    try {
      await sendParentAnnouncement({ title: title.trim(), message: message.trim(), kind: "classroom" });
      setTitle(""); setMessage("");
      notify("Announcement sent to all parent accounts");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Announcement was not sent.");
    } finally {
      setSending(false);
    }
  };
  return <><Heading eyebrow="PARENT COMMUNICATION" title="Announcements" detail="Send classroom updates to every linked parent. Health notices stay pinned for one parent only."/><section className="ta-card ta-announcement-compose"><header><span><Mail/></span><div><h2>New Parent Announcement</h2><p>This appears in every parent's Announcements feed.</p></div></header><div><label>Announcement title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Classroom update"/></label><label>Message<textarea maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder="Write your announcement…"/><small>{message.length}/500</small></label><button className="ta-primary" disabled={sending || !title.trim() || !message.trim()} onClick={() => void send()}><Send/>{sending ? "Sending…" : "Send to Parents"}</button></div></section></>;
}

function Health({ notify }: { notify: Notify }) {
  const [record, setRecord] = useState(false);
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>([]);
  const [studentId, setStudentId] = useState("");
  const [temperature, setTemperature] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [observation, setObservation] = useState("");
  const [records, setRecords] = useState<Array<{ id: string; studentId: string; studentName: string; temperature: string; height: string; weight: string; observation: string; createdAt: string }>>(() => {
    try { return JSON.parse(localStorage.getItem("learnease.healthRecords") || "[]"); } catch { return []; }
  });
  useEffect(() => {
    void supabase.from("children_accounts").select("id,child_name,first_name,last_name").eq("is_active", true).order("created_at", { ascending: false }).then(({ data }) => {
      const roster = (data || []).map(row => ({ id: String(row.id), name: row.child_name?.trim() || `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Unnamed learner" }));
      setStudents(roster);
      setStudentId(current => current || roster[0]?.id || "");
    });
  }, []);
  const save = () => {
    const student = students.find(item => item.id === studentId);
    if (!student) return;
    const next = [{ id: `${studentId}-${Date.now()}`, studentId, studentName: student.name, temperature, height, weight, observation, createdAt: new Date().toISOString() }, ...records];
    localStorage.setItem("learnease.healthRecords", JSON.stringify(next));
    setRecords(next); setRecord(false); setTemperature(""); setHeight(""); setWeight(""); setObservation("");
    notify(`Health check saved for ${student.name}`);
  };
  return <><Heading eyebrow="LEARNER WELLBEING" title="Health Monitoring" detail="Health records will appear after they are entered and saved."><button className="ta-primary" disabled={!students.length} onClick={() => setRecord(true)}><Plus /> Record Health Check</button></Heading>{records.length ? <section className="ta-card ta-health-records"><header><span><HeartPulse/></span><div><h2>Learner Health Records</h2><p>Latest recorded checks</p></div></header>{records.map(item => <article key={item.id}><span><b>{item.studentName}</b><small>{new Date(item.createdAt).toLocaleString("en-PH")}</small></span><em>{item.temperature ? `${item.temperature} °C` : "No temperature"}</em><small>{item.height ? `${item.height} cm` : "—"} · {item.weight ? `${item.weight} kg` : "—"}</small><p>{item.observation || "No observation"}</p></article>)}</section> : <section className="ta-student-state"><HeartPulse/><h3>No health records yet</h3><p>Add the first health check to begin the class health overview.</p></section>}{record && <div className="ta-overlay" onMouseDown={() => setRecord(false)}><form className="ta-modal ta-form" onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); save(); }}><button type="button" className="ta-close" onClick={() => setRecord(false)}><X/></button><h2>Record Health Check</h2><p>Select a learner from Student Management.</p><label>Learner<select required value={studentId} onChange={event => setStudentId(event.target.value)}>{students.map(student => <option value={student.id} key={student.id}>{student.name}</option>)}</select></label><label>Temperature (°C)<input type="number" step="0.1" value={temperature} onChange={event => setTemperature(event.target.value)} placeholder="Example: 36.5"/></label><label>Height (cm)<input type="number" step="0.1" value={height} onChange={event => setHeight(event.target.value)} placeholder="Enter height"/></label><label>Weight (kg)<input type="number" step="0.1" value={weight} onChange={event => setWeight(event.target.value)} placeholder="Enter weight"/></label><label>Teacher observation<textarea value={observation} onChange={event => setObservation(event.target.value)} placeholder="Enter observation"/></label><button className="ta-primary ta-full" disabled={!studentId}>Save Health Check</button></form></div>}</>;
}

function Rewards({ notify }: { notify: Notify }) {
  return <><Heading eyebrow="POSITIVE REINFORCEMENT" title="Rewards & Gamification" detail="Recorded rewards and achievements will appear here."/><section className="ta-student-state"><Award/><h3>No rewards recorded yet</h3><p>Reward history will appear after a reward is saved for a student.</p></section></>;
}

function ProfileSettings({ notify, logout }: { notify: Notify; logout: () => void }) {
  const teacher = teacherIdentity();
  const [edit, setEdit] = useState(false); const [toggles, setToggles] = useState([true,true,false]);
  return <><Heading eyebrow="YOUR ACCOUNT" title="Profile & Settings" detail="Information shown here comes from the signed-in teacher account."/><div className="ta-settings-grid"><section className="ta-card ta-profile"><div>👩🏻‍🏫<button><Camera /></button></div><h2>{teacher.name}</h2><p>{teacher.role}</p><span><i /> Signed-in faculty account</span><dl><dt>Handled Section</dt><dd>{teacher.section || "Not provided"}</dd><dt>Teacher ID</dt><dd>{teacher.id || "Not provided"}</dd></dl><button className="ta-primary ta-full" onClick={() => setEdit(true)}><Pencil /> Edit Profile</button></section><section className="ta-card ta-settings"><header><span className="purple"><Settings /></span><div><h2>Account Details</h2><p>Loaded from your login record</p></div></header><div className="ta-setting"><UserRound/><span><b>Full Name</b><small>{teacher.name}</small></span></div><div className="ta-setting"><Mail/><span><b>Email Address</b><small>{teacher.email || "Not provided"}</small></span></div><h3>Notification Preferences</h3>{[["Push notifications","Student activity and alerts"],["Email notifications","Account email updates"],["Weekly class summary","Summary notifications"]].map(([a,b],i) => <div className="ta-setting" key={a}><Bell/><span><b>{a}</b><small>{b}</small></span><button className={`ta-toggle ${toggles[i] ? "on" : ""}`} onClick={() => setToggles(toggles.map((x,j) => i===j?!x:x))}><i/></button></div>)}<button className="ta-danger" onClick={logout}><LogOut /> Logout of Teacher Account</button></section></div>{edit && <SimpleForm title="Edit Teacher Profile" close={() => setEdit(false)} submit={() => { setEdit(false); notify("Profile editing requires a teacher profile database update."); }} fields={["Full Name", "Email Address", "Handled Section"]}/>}</>;
}

function SimpleForm({ title, fields, close, submit }: { title: string; fields: string[]; close: () => void; submit: () => void }) {
  return <div className="ta-overlay" onMouseDown={close}><form className="ta-modal ta-form" onMouseDown={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); submit(); }}><button type="button" className="ta-close" onClick={close}><X /></button><h2>{title}</h2><p>Complete the details below.</p>{fields.map((f,i) => <label key={f}>{f}{f.toLowerCase().includes("description") || f.toLowerCase().includes("observation") ? <textarea placeholder={`Enter ${f.toLowerCase()}`}/> : <input required={i === 0} placeholder={`Enter ${f.toLowerCase()}`}/>}</label>)}<button className="ta-primary ta-full">Save</button></form></div>;
}

export default function TeacherApp() {
  const navigate = useNavigate(); const [page, setPage] = useState<PageKey>("dashboard"); const [menu, setMenu] = useState(false); const [profile, setProfile] = useState(false); const [alerts, setAlerts] = useState(false); const [toast, setToast] = useState("");
  const teacher = teacherIdentity();
  const current = useMemo(() => navItems.find(x => x.key === page)!, [page]);
  const CurrentIcon = current.icon;
  const notify: Notify = text => { setToast(text); window.setTimeout(() => setToast(""), 2400); };
  const go = (key: PageKey) => { setPage(key); setMenu(false); setProfile(false); setAlerts(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const logout = () => { localStorage.removeItem("user"); navigate("/"); };
  return <div className="teacher-app"><aside className={`ta-sidebar ${menu ? "open" : ""}`}><div className="ta-logo"><img src={logo}/><span><b>LearnEase</b><small>Teacher Portal</small></span><button onClick={() => setMenu(false)}><X/></button></div><nav>{navItems.map(({key,label,icon:Icon}) => <button className={page===key?"active":""} onClick={() => go(key)} key={key}><i><Icon/></i><b>{label}</b></button>)}</nav><div className="ta-side-profile"><i>👩🏻‍🏫</i><span><b>{teacher.name}</b><small>{teacher.role}</small></span><button onClick={logout}><LogOut/></button></div></aside>{menu && <button className="ta-backdrop" onClick={() => setMenu(false)}/>}<main><header className="ta-top"><button className="ta-menu" onClick={() => setMenu(true)}><Menu/></button><div className="ta-mobile-logo"><img src={logo}/><b>LearnEase Kids</b></div><span className="ta-current"><CurrentIcon/><b>{current.label}</b></span><div className="ta-top-actions"><div><button className="ta-bell" onClick={() => {setAlerts(!alerts);setProfile(false)}}><Bell/></button>{alerts && <section className="ta-pop ta-alert-pop"><h3>Notifications</h3><div className="ta-feed-empty"><Bell/><b>No notifications yet</b><small>Recorded alerts will appear here.</small></div></section>}</div><div><button className="ta-top-profile" onClick={() => {setProfile(!profile);setAlerts(false)}}><i>👩🏻‍🏫</i><span><b>{teacher.name}</b><small>{teacher.section || teacher.role}</small></span><ChevronDown/></button>{profile && <section className="ta-pop ta-profile-pop"><button onClick={() => go("settings")}><UserRound/> My Profile</button><button onClick={() => go("settings")}><Settings/> Settings</button><button onClick={logout}><LogOut/> Logout</button></section>}</div></div></header><div className="ta-content">{page === "dashboard" && <Dashboard go={go} notify={notify}/>} {page === "students" && <Students notify={notify}/>} {page === "lessons" && <Lessons notify={notify}/>} {page === "activities" && <Activities notify={notify}/>} {page === "attendance" && <Attendance notify={notify}/>} {page === "announcements" && <Announcements notify={notify}/>} {page === "health" && <Health notify={notify}/>} {page === "rewards" && <Rewards notify={notify}/>} {page === "settings" && <ProfileSettings notify={notify} logout={logout}/>}</div></main><nav className="ta-bottom">{navItems.slice(0,5).map(({key,label,icon:Icon}) => <button className={page===key?"active":""} onClick={() => go(key)} key={key}><Icon/><span>{label.split(" ")[0]}</span></button>)}<button onClick={() => setMenu(true)}><MoreHorizontal/><span>More</span></button></nav>{toast && <div className="ta-toast"><Check/>{toast}</div>}</div>;
}
