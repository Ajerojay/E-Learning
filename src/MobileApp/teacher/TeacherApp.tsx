import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, Award, BarChart3, Bell, BookOpen, CalendarDays, Camera,
  Check, ChevronDown, CircleAlert, FilePlus2,
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

type PageKey = "dashboard" | "students" | "lessons" | "activities" | "attendance" | "health" | "rewards" | "settings";
type Notify = (text: string) => void;

const navItems = [
  { key: "dashboard", label: "Dashboard", icon: Home },
  { key: "students", label: "Students", icon: Users },
  { key: "lessons", label: "Lessons & Videos", icon: Video },
  { key: "activities", label: "Activities & Quizzes", icon: Activity },
  { key: "attendance", label: "Attendance", icon: CalendarDays },
  { key: "health", label: "Health Monitoring", icon: HeartPulse },
  { key: "rewards", label: "Rewards", icon: Award },
  { key: "settings", label: "Profile & Settings", icon: Settings },
] as const;

const pupils = [
  { name: "Sofia Reyes", age: 5, stars: 128, rate: 96, status: "Active", avatar: "👧🏻" },
  { name: "Liam Cruz", age: 5, stars: 116, rate: 92, status: "Active", avatar: "👦🏻" },
  { name: "Emma Santos", age: 4, stars: 104, rate: 88, status: "Needs Attention", avatar: "👧🏽" },
  { name: "Noah Garcia", age: 5, stars: 97, rate: 94, status: "Active", avatar: "👦🏽" },
  { name: "Mia Flores", age: 4, stars: 91, rate: 84, status: "Needs Attention", avatar: "👧" },
  { name: "Lucas Lim", age: 5, stars: 86, rate: 90, status: "Inactive", avatar: "👦" },
];

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
};

type RecentGameActivity = {
  id: string;
  childName: string;
  category: string;
  gameTitle: string;
  score: number;
  finished: boolean;
  createdAt: string;
};

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

function useClassSummary() {
  const [summary, setSummary] = useState<{ total: number; present: number; loading: boolean; recent: RecentGameActivity[] }>({ total: 0, present: 0, loading: true, recent: [] });
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [{ data: initialStudents, error: initialStudentError }, { data: activity, error: activityError }] = await Promise.all([
        supabase.from("children_accounts").select("id, child_name, first_name, last_name, is_active, last_active_at"),
        supabase.from("v_child_recent_activity").select("child_id, category_code, game_code, game_title, score, finished, created_at").order("created_at", { ascending: false }).limit(8),
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
        console.error("Teacher dashboard summary error:", studentError.message);
        setSummary({ total: 0, present: 0, loading: false, recent: [] });
        return;
      }
      if (activityError) console.error("Teacher recent activity error:", activityError.message);
      const rows = students ?? [];
      const enrolledRows = rows.filter(row => row.is_active !== false);
      const names = new Map(rows.map(row => {
        const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
        return [String(row.id), row.child_name?.trim() || fullName || "Unnamed learner"];
      }));
      const recent = (activity ?? []).map((row, index) => ({
        id: `${row.game_code}-${row.child_id}-${row.created_at}-${index}`,
        childName: names.get(String(row.child_id)) ?? "Student",
        category: row.category_code || "activity",
        gameTitle: row.game_title?.trim() || `${String(row.category_code || "Learning").replace(/^./, letter => letter.toUpperCase())} Quest`,
        score: Math.round(Number(row.score) || 0),
        finished: Boolean(row.finished),
        createdAt: row.created_at,
      }));
      setSummary({ total: enrolledRows.length, present: enrolledRows.filter(row => row.last_active_at && Date.now() - new Date(row.last_active_at).getTime() < 2 * 60 * 1000).length, loading: false, recent });
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

function HealthSmsLauncher() {
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const templates = [
    ["Health Reminder", "Good day! Please remember to update us about your child's current health condition."],
    ["Health Concern", "Good day! We observed a minor health concern today. Please contact the teacher for details."],
    ["Wellness Check", "Good day! Your child's classroom wellness check has been recorded."],
  ];
  return <><button className="ta-secondary" onClick={() => setShow(true)}><Send /> Send Health SMS</button>{show && <div className="ta-overlay" onMouseDown={() => setShow(false)}><form className="ta-modal ta-sms-form" onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); setShow(false); }}><button type="button" className="ta-close" onClick={() => setShow(false)}><X /></button><div className="ta-sms-title"><i><Send /></i><span><h2>Send Health Announcement</h2><p>Notify registered parent contacts by SMS.</p></span></div><label>Recipients<select><option>All parents in Sunflower</option><option>Parents with health alerts</option><option>Select individual learner</option></select></label><label>Sender<input defaultValue="Teacher Maria" required /></label><label>Announcement title <small>Optional</small><input placeholder="Health update" /></label><label>Message<textarea maxLength={300} required value={message} onChange={event => setMessage(event.target.value)} placeholder="Write your health announcement..."/><em>{message.length}/300</em></label><div className="ta-sms-templates"><header><b>Quick Health Templates</b><small>Tap to use</small></header><div>{templates.map(([title, text]) => <button type="button" key={title} onClick={() => setMessage(text)}><b>{title}</b><span>{text}</span></button>)}</div></div><button className="ta-primary ta-full" type="submit"><Send /> Send Announcement via SMS</button><p className="ta-sms-note">Messages will be sent to the registered parent contact numbers.</p></form></div>}</>;
}

function Heading({ eyebrow, title, detail, children }: { eyebrow: string; title: string; detail: string; children?: React.ReactNode }) {
  return <div className="ta-heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div><div className="ta-heading-actions">{title === "Health Monitoring" && <HealthSmsLauncher />}{children}</div></div>;
}

function Dashboard({ go, notify }: { go: (key: PageKey) => void; notify: Notify }) {
  const classSummary = useClassSummary();
  const date = new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const quickAccess = navItems.filter(item => item.key !== "dashboard");
  const metrics = [
    ["Total Students", classSummary.loading ? "…" : String(classSummary.total), `${classSummary.total} enrolled`, Users, "blue", "students"],
    ["Students Online", classSummary.loading ? "…" : String(classSummary.present), `${classSummary.present} online · ${Math.max(0, classSummary.total - classSummary.present)} offline`, CalendarDays, "green", "attendance"],
    ["Active Learning Quests", "6", "Modules open", Activity, "pink", "activities"],
    ["Stars & Badges Awarded", "450", "Total given", Star, "purple", "rewards"],
  ] as const;
  return <>
    <section className="ta-reference-greeting">
      <img src={logo} alt="LearnEase" />
      <div><h1>Good Morning,<br />Teacher Maria!</h1><p>{date}</p></div>
      <button aria-label="Open notifications" onClick={() => notify("You have 3 pending notifications")}><Bell /></button>
      <button aria-label="Open help" onClick={() => notify("Teacher help center opened")}><CircleAlert /></button>
    </section>
    <section className="ta-summary-card">
      <small>Today's Summary</small><h2>Class attendance and learning overview</h2>
      <div>
        <button onClick={() => go("students")}><strong>{classSummary.loading ? "…" : classSummary.total}</strong><span>Students</span></button>
        <button onClick={() => go("students")}><strong>{classSummary.loading ? "…" : classSummary.present}</strong><span>Online</span></button>
        <button onClick={() => go("activities")}><strong>6</strong><span>Active Quests</span></button>
        <button onClick={() => go("rewards")}><strong>450</strong><span>Stars Given</span></button>
      </div>
    </section>
    <section className="ta-quick-section">
      <header><div><h2>Quick Access</h2><p>Open a teacher management page</p></div><span>{quickAccess.length} tools</span></header>
      <div className="ta-quick-grid">{quickAccess.map(({ key, label, icon: Icon }, index) => <button onClick={() => go(key)} key={key}><i className={`tone-${index % 4}`}><Icon /></i><span><b>{label}</b><small>Open page</small></span><strong>›</strong></button>)}</div>
    </section>
    <section className="ta-hero"><div><span>KINDERGARTEN · SUNFLOWER</span><h1>Good Morning, Teacher Maria! 👋</h1><p>Here’s what’s happening in your classroom today.</p><small><CalendarDays />{date}<b><i /> Class is active</b></small></div><div>🌈<i>☁️</i></div></section>
    <section className="ta-metrics">{metrics.map(([title, value, sub, Icon, tone, target]) => <button className={tone} onClick={() => go(target)} key={title}><i><Icon /></i><span><small>{title}</small><strong>{value}</strong><em>{sub}</em></span><b>View details →</b></button>)}</section>
    <section className="ta-card ta-recent-wide"><header><span className="purple"><Activity /></span><div><h2>Recent Student Activity</h2><p>{classSummary.loading ? "Loading game activity…" : `${classSummary.recent.length} recent game ${classSummary.recent.length === 1 ? "activity" : "activities"}`}</p></div><b className="ta-live"><i /> Live</b></header><div className="ta-feed">{!classSummary.loading && classSummary.recent.length === 0 && <div className="ta-feed-empty"><Activity /><b>No game activity yet</b><small>Completed student games will appear here automatically.</small></div>}{classSummary.recent.map(item => { const action = item.finished ? "completed" : "played"; const text = `${item.childName} ${action} ${item.gameTitle}`; return <button onClick={() => notify(`${text} · Score ${item.score}%`)} key={item.id}><i>🧒</i><span><b>{text}</b><small>{relativeActivityTime(item.createdAt)} · Score {item.score}%</small></span><em>{activityBadge(item.category)}</em></button>; })}</div></section>
  </>;
}

function LegacyStudents({ notify }: { notify: Notify }) {
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState("All"); const [profile, setProfile] = useState<typeof pupils[number] | null>(null);
  const shown = pupils.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) && (filter === "All" || p.status === filter));
  return <><Heading eyebrow="CLASSROOM ROSTER" title="Students Management" detail="Monitor every learner’s progress, attendance, and wellbeing."><button className="ta-primary"><Plus /> Add Student</button></Heading>
    <section className="ta-card ta-tools"><label><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search learner by name…" /></label><div>{["All", "Active", "Needs Attention", "Inactive"].map(x => <button className={filter === x ? "active" : ""} onClick={() => setFilter(x)} key={x}>{x}</button>)}</div></section>
    <section className="ta-students">{shown.map(p => <article key={p.name}><div className="ta-pupil-head"><i>{p.avatar}</i><span className={p.status.replace(" ", "-").toLowerCase()}>{p.status}</span><MoreHorizontal /></div><h3>{p.name}</h3><p>Age {p.age} · Sunflower</p><div className="ta-pupil-stats"><span><Star /><b>{p.stars}</b><small>Total Stars</small></span><span><CalendarDays /><b>{p.rate}%</b><small>Attendance</small></span></div><div className="ta-progress"><i style={{ width: `${p.rate}%` }} /></div><footer><button onClick={() => setProfile(p)}><UserRound /> Profile</button><button onClick={() => notify(`Reward awarded to ${p.name}`)}><Award /> Reward</button><button><Trophy /></button></footer></article>)}</section>
    {profile && <div className="ta-overlay" onMouseDown={() => setProfile(null)}><section className="ta-modal" onMouseDown={e => e.stopPropagation()}><button className="ta-close" onClick={() => setProfile(null)}><X /></button><div className="ta-avatar">{profile.avatar}</div><h2>{profile.name}</h2><p>Age {profile.age} · Sunflower Section</p><div className="ta-profile-numbers"><span><b>{profile.stars}</b> Stars</span><span><b>{profile.rate}%</b> Attendance</span></div><h3>Module Progress</h3>{[["Colors", 92], ["Numbers", 76], ["Phonics", 84], ["Shapes", 68]].map(([n, v]) => <div className="ta-module" key={n}><span>{n}<b>{v}%</b></span><i><em style={{ width: `${v}%` }} /></i></div>)}<button className="ta-primary ta-full">View Attendance History</button></section></div>}
  </>;
}

type DatabaseStudent = {
  id: string;
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
  return student.lastActiveAt ? `Last active ${relativeActivityTime(student.lastActiveAt).toLowerCase()}` : "Not active yet";
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    const loadStudents = async () => {
      setLoading(true);
      setLoadError("");
      let { data, error } = await supabase
        .from("children_accounts")
        .select("id, child_name, first_name, last_name, date_of_birth, sex, grade_level, pin_code, is_active, last_active_at")
        .order("created_at", { ascending: false });

      if (error && /last_active_at/i.test(error.message)) {
        const fallback = await supabase.from("children_accounts").select("id, child_name, first_name, last_name, date_of_birth, sex, grade_level, pin_code, is_active").order("created_at", { ascending: false });
        data = fallback.data?.map(row => ({ ...row, last_active_at: null })) ?? null;
        error = fallback.error;
      }

      if (!active) return;
      if (error) {
        console.error("Teacher student roster error:", error.message);
        setStudents([]);
        setLoadError("Unable to load student records. Please try again.");
      } else {
        setStudents((data ?? []).map((row, index) => {
          const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
          return {
            id: String(row.id),
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
    (filter === "All" || student.status === filter)
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

  return <><Heading eyebrow="CLASSROOM ROSTER" title="Students Management" detail="Manage learner profiles, enrollment, and classroom activity."/>
    <section className="ta-card ta-tools"><label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search learner by name…" /></label><div>{["All", "Online", "Offline", "Unenrolled"].map(value => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div></section>
    {loading && <section className="ta-student-state"><span className="ta-loader"/><h3>Loading student records…</h3><p>Retrieving the latest class information.</p></section>}
    {!loading && loadError && <section className="ta-student-state error"><CircleAlert/><h3>Unable to load roster</h3><p>{loadError}</p></section>}
    {!loading && !loadError && shown.length === 0 && <section className="ta-student-state"><Users/><h3>No student accounts found</h3><p>Students registered by parents will appear here automatically.</p></section>}
    {!loading && !loadError && <section className="ta-students">{shown.map(student => <article key={student.id}><div className="ta-pupil-head"><i>{student.avatar}</i><span className={student.status.toLowerCase()}>{student.status === "Offline" ? studentPresenceLabel(student) : student.status}</span><button className="ta-student-more" aria-label={`More actions for ${student.name}`} onClick={() => setStudentMenu(studentMenu === student.id ? null : student.id)}><MoreHorizontal /></button>{studentMenu === student.id && <div className="ta-student-menu"><button onClick={() => { setProfile(student); setStudentMenu(null); }}><UserRound/> View details</button><button onClick={() => { void openAchievements(student); setStudentMenu(null); }}><Trophy/> Achievements</button><button onClick={() => { setEnrollmentPrompt({ student, enroll: !student.enrolled }); setStudentMenu(null); }} className={student.enrolled ? "danger" : "restore"}>{student.enrolled ? <Trash2/> : <Check/>}{student.enrolled ? "Unenroll student" : "Restore enrollment"}</button></div>}</div><h3>{student.name}</h3><p>{student.age === null ? "Age not provided" : `Age ${student.age}`} · {student.section}</p><div className="ta-pupil-stats"><span><Star /><b>{student.stars}</b><small>Total Stars</small></span><span><CalendarDays /><b>{student.rate}%</b><small>Attendance</small></span></div><div className="ta-progress"><i style={{ width: `${student.rate}%` }} /></div><footer><button onClick={() => setProfile(student)}><UserRound /> Profile</button><button onClick={() => notify(`Reward panel opened for ${student.name}`)}><Award /> Reward</button><button aria-label={`View ${student.name} achievements`} title="Achievements" onClick={() => void openAchievements(student)}><Trophy /></button></footer></article>)}</section>}
    {profile && <div className="ta-overlay" onMouseDown={() => setProfile(null)}><section className="ta-modal ta-child-profile" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setProfile(null)}><X /></button><div className="ta-avatar">{profile.avatar}</div><h2>{profile.name}</h2><p>Child details provided by the parent</p><dl><div><dt>First name</dt><dd>{profile.firstName || "Not provided"}</dd></div><div><dt>Last name</dt><dd>{profile.lastName || "Not provided"}</dd></div><div><dt>Date of birth</dt><dd>{profile.dateOfBirth ? new Date(`${profile.dateOfBirth}T00:00:00`).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "Not provided"}</dd></div><div><dt>Age</dt><dd>{profile.age === null ? "Not provided" : `${profile.age} years old`}</dd></div><div><dt>Sex</dt><dd>{profile.sex || "Not provided"}</dd></div><div><dt>Grade level</dt><dd>{profile.section}</dd></div><div><dt>Student PIN</dt><dd>{profile.pinCode || "Not provided"}</dd></div><div><dt>Account status</dt><dd>{profile.status}</dd></div></dl><small>Student ID: {profile.id}</small><button className="ta-primary ta-full" onClick={() => setProfile(null)}>Close Profile</button></section></div>}
    {achievementStudent && <div className="ta-overlay" onMouseDown={() => setAchievementStudent(null)}><section className="ta-modal ta-achievements-modal" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setAchievementStudent(null)}><X /></button><div className="ta-avatar"><Trophy /></div><h2>{achievementStudent.name}'s Achievements</h2><p>Earned from completed learning games</p>{achievementsLoading ? <div className="ta-achievement-empty"><span className="ta-loader"/><b>Loading achievements…</b></div> : achievements.length ? <div className="ta-achievement-list">{achievements.map(item => <article key={item.id}><i>{item.icon}</i><span><b>{item.text}</b><small>Earned achievement</small></span></article>)}</div> : <div className="ta-achievement-empty"><Trophy/><b>No achievements yet</b><small>Achievements will appear after this student completes games.</small></div>}<button className="ta-primary ta-full" onClick={() => setAchievementStudent(null)}>Close Achievements</button></section></div>}
    {enrollmentPrompt && <div className="ta-overlay ta-enrollment-overlay" onMouseDown={() => !enrollmentSaving && setEnrollmentPrompt(null)}><section className={`ta-modal ta-enrollment-modal ${enrollmentPrompt.enroll ? "restore" : "unenroll"}`} onMouseDown={event => event.stopPropagation()} role="alertdialog" aria-modal="true"><div className="ta-enrollment-sparkles" aria-hidden="true"><i>⭐</i><i>🌈</i><i>✨</i></div><div className="ta-enrollment-avatar">{enrollmentPrompt.student.avatar}<span>{enrollmentPrompt.enroll ? "↩" : "👋"}</span></div><h2>{enrollmentPrompt.enroll ? "Welcome Back!" : "Pause Enrollment?"}</h2><p>{enrollmentPrompt.enroll ? <>Restore <b>{enrollmentPrompt.student.name}</b> to the class?</> : <>Are you sure you want to unenroll <b>{enrollmentPrompt.student.name}</b>?</>}</p><div className="ta-enrollment-note">{enrollmentPrompt.enroll ? <><Check/><span><b>Student access will return</b><small>They can sign in and continue their learning games.</small></span></> : <><ShieldCheck/><span><b>Their learning memories stay safe</b><small>Progress, stars, and achievements will not be deleted.</small></span></>}</div><div className="ta-enrollment-actions"><button disabled={enrollmentSaving} onClick={() => setEnrollmentPrompt(null)}><X/> Not now</button><button disabled={enrollmentSaving} onClick={() => void setEnrollment(enrollmentPrompt.student, enrollmentPrompt.enroll)}>{enrollmentSaving ? <span className="ta-button-loader"/> : enrollmentPrompt.enroll ? <Check/> : <Trash2/>}{enrollmentSaving ? "Saving…" : enrollmentPrompt.enroll ? "Restore Student" : "Yes, Unenroll"}</button></div></section></div>}
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

  const fetchLessons = async () => {
    setLoading(true); setLoadError("");
    const { data, error } = await supabase.from("video_lessons").select("id,title,description,category,video_path,is_published").eq("is_published", true).order("created_at", { ascending: false });
    if (error) { console.error("Teacher lessons error:", error.message); setLoadError("Unable to load video lessons. Please try again."); setLessons([]); }
    else setLessons((data ?? []) as LessonRecord[]);
    setLoading(false);
  };
  useEffect(() => { void fetchLessons(); }, []);

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
    } catch (error) { console.error("Teacher lesson save error:", error); notify(error instanceof Error ? error.message : "Unable to save lesson"); }
    finally { setSaving(false); }
  };
  const archiveLesson = async (lesson: LessonRecord) => {
    if (!window.confirm(`Remove “${lesson.title}” from published lessons?`)) return;
    const { error } = await supabase.from("video_lessons").update({ is_published: false }).eq("id", lesson.id);
    if (error) { notify(error.message); return; }
    setLessons(current => current.filter(item => item.id !== lesson.id)); notify("Lesson removed");
  };
  const previewLesson = async (lesson: LessonRecord) => {
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
    {!loading && !loadError && <section className="ta-lessons">{visible.map(lesson => { const uiCategory = categoryFromDb(lesson.category); return <article key={lesson.id}><div className="ta-thumb"><span>{lessonIcons[uiCategory] ?? lessonIcons.Others}</span><b>VIDEO</b><button disabled={previewLoading} onClick={() => void previewLesson(lesson)}>{previewLoading ? "…" : "▶"}</button></div><div><span><i>{uiCategory}</i><em>Published</em></span><h3>{lesson.title}</h3><p>{lesson.description || `${uiCategory} lesson video`}</p><small><Activity /> Attached: {uiCategory === "Others" ? "Custom lesson" : `${uiCategory} Quest`}</small><footer><button onClick={() => openEdit(lesson)}><Pencil /> Edit</button><button onClick={() => void archiveLesson(lesson)}><Trash2 /> Delete</button></footer></div></article>; })}</section>}
    {preview && <div className="ta-overlay" onMouseDown={() => setPreview(null)}><section className="ta-modal ta-video-modal" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setPreview(null)}><X /></button><div className="ta-video-heading"><i>{lessonIcons[categoryFromDb(preview.lesson.category)] ?? lessonIcons.Others}</i><span><small>{categoryFromDb(preview.lesson.category)} VIDEO LESSON</small><h2>{preview.lesson.title}</h2></span></div><video src={preview.url} controls autoPlay playsInline onError={() => { setPreview(null); notify("This video could not be played. Please upload the video again."); }}>Your device does not support video playback.</video><p>{preview.lesson.description || "Watch this learning video."}</p></section></div>}
    {upload && <div className="ta-overlay" onMouseDown={closeForm}><form className="ta-modal ta-form" onMouseDown={event => event.stopPropagation()} onSubmit={saveLesson}><button type="button" className="ta-close" onClick={closeForm}><X /></button><h2>{editing ? "Edit Video Lesson" : "Upload New Video Lesson"}</h2><p>Choose one of the six lesson categories and provide either a file or a direct video URL.</p><label>Lesson title<select value={category} onChange={event => setCategory(event.target.value)}>{lessonCategories.map(value => <option disabled={lessons.some(item => item.id !== editing?.id && categoryFromDb(item.category) === value)} key={value}>{value}</option>)}</select></label><label>Video title<input required value={title} onChange={event => setTitle(event.target.value)} placeholder="Enter video title" /></label><label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Enter lesson description" /></label><div className="ta-video-source"><label>{editing ? "Replace with video file (optional)" : "Video file"}<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => { setFile(event.target.files?.[0] ?? null); if (event.target.files?.[0]) setVideoUrl(""); }} /></label><span>OR</span><label>{editing ? "Replace with direct video URL (optional)" : "Direct video URL"}<input type="url" value={videoUrl} onChange={event => { setVideoUrl(event.target.value); if (event.target.value) setFile(null); }} placeholder="https://example.com/lesson.mp4" /><small>Use a direct MP4, WebM, or hosted video-file link.</small></label></div><button className="ta-primary ta-full" disabled={saving}>{saving ? "Saving…" : editing ? "Update Lesson" : "Upload Lesson"}</button></form></div>}
  </>;
}

function Activities({ notify }: { notify: Notify }) {
  const games = [
    ["\u{1F3A8}", "Sort the Colors", "Colors", 92],
    ["\u{1F520}", "Match the Letters", "Letters", 86],
    ["\u{1F9E9}", "What Comes Next?", "Logic", 74],
    ["\u{1F50A}", "Listen and Match", "Phonics", 79],
    ["\u{1F3E0}", "Build the House", "Shapes", 88],
    ["\u{1F522}", "Count the Raindrops", "Numbers", 81],
  ] as const;
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
    <section className="ta-quests">{games.map(([icon, name, category, rate], index) => { const key = category.toLowerCase() as SubjectKey; const config = configs[key]; return <article key={name}><i>{icon}</i><div className="ta-quest-name"><span>{category} · {config.levels.length} Levels</span><h3>{name}</h3><small>{config.levels.join(", ") || "No levels enabled"}</small></div><button aria-label={`${config.open ? "Close" : "Open"} ${name}`} className={`ta-toggle ${config.open ? "on" : ""}`} onClick={() => toggleGlobal(key)}><i /></button><div className="ta-completion"><span>Class completion <b>{rate}%</b></span><i><em style={{ width: `${rate}%` }} /></i></div><div className="ta-quest-data"><span>Passing score<b>{config.passingScore}%</b></span><span>Star reward<b>⭐ {config.starReward}</b></span><span>Status<b>{config.open ? "Open" : "Closed"}</b></span></div><footer><button onClick={() => setPreviewGame(index)}>Preview</button><button onClick={() => openConfigure(index, key)}><Settings /> Configure</button></footer></article>; })}</section>
    <div className="ta-grid-2 ta-page-summary"><section className="ta-card ta-chart"><header><span><BarChart3 /></span><div><h2>Average Quiz Scores</h2><p>By learning module</p></div><b>84% average</b></header><div>{[["Colors",92],["Shapes",78],["Letters",86],["Numbers",81],["Phonics",88],["Logic",74]].map(([n,v]) => <span key={n}><b>{v}%</b><i><em style={{ height: `${v}%` }}/></i><small>{n}</small></span>)}</div></section><section className="ta-card ta-donut-card"><header><span className="purple"><Activity /></span><div><h2>Module Completion</h2><p>Whole-class progress</p></div></header><div className="ta-donut"><b>76%</b><small>Completed</small></div><ul><li>🟣 Completed <b>76%</b></li><li>🔵 In progress <b>18%</b></li><li>⚪ Not started <b>6%</b></li></ul></section></div>
    {accessOpen && <div className="ta-overlay" onMouseDown={() => setAccessOpen(false)}><section className="ta-modal ta-access-modal" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setAccessOpen(false)}><X/></button><div className="ta-access-title"><i><Users/></i><span><h2>Student Game Access</h2><p>Choose which activities this learner can open.</p></span></div>{students.length === 0 ? <div className="ta-access-empty">No enrolled students found.</div> : <><label className="ta-access-student">Student<select value={selectedStudent} onChange={event => chooseStudent(event.target.value)}>{students.map(student => <option value={student.id} key={student.id}>{student.name}</option>)}</select></label><div className="ta-access-games">{games.map(([icon, name, category]) => { const key = category.toLowerCase() as SubjectKey; const enabled = allowed.includes(key); return <button className={enabled ? "enabled" : ""} onClick={() => toggleAllowed(key)} key={key}><i>{icon}</i><span><b>{category}</b><small>{name}</small></span><em>{enabled ? "Allowed" : "Locked"}</em></button>; })}</div><button className="ta-primary ta-full" onClick={() => { saveStudentGameAccess(selectedStudent, allowed); setAccessOpen(false); notify("Student game access saved"); }}><ShieldCheck/> Save Student Access</button></>}</section></div>}
    {previewGame !== null && (() => { const [icon, name, category] = games[previewGame]; const config = configs[category.toLowerCase() as SubjectKey]; return <div className="ta-overlay" onMouseDown={() => setPreviewGame(null)}><section className="ta-modal ta-game-preview" onMouseDown={event => event.stopPropagation()}><button className="ta-close" onClick={() => setPreviewGame(null)}><X/></button><i>{icon}</i><small>ACTIVITY PREVIEW</small><h2>{name}</h2><p>{config.instructions}</p><div><span><b>{config.passingScore}%</b>Passing score</span><span><b>⭐ {config.starReward}</b>Reward</span><span><b>{config.timeLimit ? `${config.timeLimit} min` : "No limit"}</b>Time</span></div><h3>Available Levels</h3><ul>{config.levels.map(level => <li key={level}><Check/> {level}</li>)}</ul></section></div>; })()}
    {configureGame !== null && draftConfig && (() => { const [, name, category] = games[configureGame]; const key = category.toLowerCase() as SubjectKey; return <div className="ta-overlay" onMouseDown={() => setConfigureGame(null)}><form className="ta-modal ta-config-form" onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); saveConfigure(key); }}><button type="button" className="ta-close" onClick={() => setConfigureGame(null)}><X/></button><h2>Configure {name}</h2><p>These settings apply to the whole class.</p><div className="ta-config-pair"><label>Passing score<input type="number" min="1" max="100" value={draftConfig.passingScore} onChange={event => setDraftConfig({ ...draftConfig, passingScore: Number(event.target.value) })}/></label><label>Star reward<input type="number" min="0" max="999" value={draftConfig.starReward} onChange={event => setDraftConfig({ ...draftConfig, starReward: Number(event.target.value) })}/></label></div><label>Time limit (minutes)<input type="number" min="0" max="180" value={draftConfig.timeLimit} onChange={event => setDraftConfig({ ...draftConfig, timeLimit: Number(event.target.value) })}/><small>Use 0 for no time limit.</small></label><label>Instructions<textarea value={draftConfig.instructions} onChange={event => setDraftConfig({ ...draftConfig, instructions: event.target.value })}/></label><fieldset><legend>Available levels</legend>{["Easy", "Medium", "Hard"].map(level => <label key={level}><input type="checkbox" checked={draftConfig.levels.includes(level)} onChange={() => setDraftConfig({ ...draftConfig, levels: draftConfig.levels.includes(level) ? draftConfig.levels.filter(item => item !== level) : [...draftConfig.levels, level] })}/>{level}</label>)}</fieldset><label className="ta-config-open"><input type="checkbox" checked={draftConfig.open} onChange={event => setDraftConfig({ ...draftConfig, open: event.target.checked })}/><span><b>Activity open</b><small>Students can launch this game.</small></span></label><button className="ta-primary ta-full" type="submit"><ShieldCheck/> Save Configuration</button></form></div>; })()}
  </>;
}

function Attendance({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<Array<{ id: string; name: string; section: string; avatar: string; rate: number; today: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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
        setRows((data ?? []).map((student, index) => {
          const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
          return { id: String(student.id), name: student.child_name?.trim() || fullName || "Unnamed learner", section: student.grade_level?.trim() || "Preschool", avatar: index % 2 === 0 ? "🧒" : "👧", rate: 0, today: "Present" };
        }));
      }
      setLoading(false);
    };
    void loadAttendanceRoster();
    return () => { active = false; };
  }, []);
  const present = rows.filter(x => x.today === "Present").length;
  const attendanceRate = rows.length ? Math.round(present / rows.length * 100) : 0;
  return <><Heading eyebrow="DAILY ROLL CALL" title="Attendance" detail="Record attendance and review the class attendance summary in one place."><div className="ta-heading-actions"><label><CalendarDays /><input type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><button className="ta-secondary" disabled={loading || rows.length === 0} onClick={() => setRows(rows.map(x => ({ ...x, today: "Present" })))}><Check /> Mark All Present</button></div></Heading>
    {loading && <section className="ta-student-state"><CalendarDays/><h3>Loading attendance roster…</h3><p>Retrieving students from Student Management.</p></section>}
    {!loading && loadError && <section className="ta-student-state error"><CircleAlert/><h3>Unable to load attendance</h3><p>{loadError}</p></section>}
    {!loading && !loadError && rows.length === 0 && <section className="ta-student-state"><Users/><h3>No student accounts found</h3><p>Students added to Student Management will appear here automatically.</p></section>}
    {!loading && !loadError && rows.length > 0 && <><section className="ta-att-summary"><div className="ta-ring"><b>{attendanceRate}%</b></div><div><h2>Present Today</h2><p>{present} of {rows.length} learners checked in</p></div>{["Present", "Late", "Absent", "Excused"].map(s => <span className={s.toLowerCase()} key={s}><b>{rows.filter(x => x.today === s).length}</b>{s}</span>)}</section><div className="ta-grid-att"><section className="ta-card ta-roll"><header><span><CalendarDays /></span><div><h2>Class Attendance List</h2><p>Tap a status to update</p></div></header>{rows.map((p, index) => <div className="ta-roll-row" key={p.id}><i>{p.avatar}</i><span><b>{p.name}</b><small>{p.section}</small></span><div>{["Present", "Late", "Absent", "Excused"].map(s => <button className={`${s.toLowerCase()} ${p.today === s ? "active" : ""}`} onClick={() => setRows(rows.map((x, i) => i === index ? { ...x, today: s } : x))} key={s}>{s}</button>)}</div></div>)}<button className="ta-primary ta-save" onClick={() => notify("Attendance saved and submitted")}><ShieldCheck /> Save & Submit Attendance</button></section><aside className="ta-card ta-alerts"><header><span className="orange"><CircleAlert /></span><div><h2>Attendance Alerts</h2><p>Learners needing follow-up</p></div></header><div className="ta-alert-empty"><Check/><span><b>No attendance alerts yet</b><small>Alerts will appear after attendance history is recorded.</small></span></div></aside></div><section className="ta-card ta-trend"><header><span className="green"><CalendarDays /></span><div><h2>Attendance Trend</h2><p>Last 7 school days</p></div></header><svg viewBox="0 0 700 170" preserveAspectRatio="none"><path d="M0 130 L110 92 L220 105 L330 58 L440 72 L550 36 L700 48 L700 170 L0 170Z"/><polyline points="0,130 110,92 220,105 330,58 440,72 550,36 700,48"/></svg></section></>}
  </>;
}

function Health({ notify }: { notify: Notify }) {
  const [record, setRecord] = useState(false);
  return <><Heading eyebrow="LEARNER WELLBEING" title="Health Monitoring" detail="Keep daily health observations organized and visible."><button className="ta-primary" onClick={() => setRecord(true)}><Plus /> Record Health Check</button></Heading><section className="ta-health-stats">{[["25", "Learners checked", "👥"], ["36.7°C", "Average temperature", "🌡️"], ["2", "Health observations", "📝"], ["0", "Urgent concerns", "🛡️"]].map(([v, l, i]) => <article key={l}><i>{i}</i><span><b>{v}</b><small>{l}</small></span></article>)}</section><div className="ta-grid-2"><section className="ta-card ta-health-table"><header><span><HeartPulse /></span><div><h2>Class Health Overview</h2><p>Latest measurements</p></div></header><div className="head"><span>Learner</span><span>Temp</span><span>Height</span><span>Weight</span><span>BMI</span></div>{pupils.slice(0,5).map((p, i) => <div key={p.name}><span><i>{p.avatar}</i><b>{p.name}</b></span><span>{(36.5 + i / 10).toFixed(1)}°C</span><span>{104 + i * 2} cm</span><span>{17 + i} kg</span><span><em>{i === 4 ? "Monitor" : "Normal"}</em></span></div>)}</section><section className="ta-card ta-observations"><header><span className="orange"><CircleAlert /></span><div><h2>Health Concerns</h2><p>Recent teacher observations</p></div></header>{[["👦🏻", "Liam has a mild cough", "Temperature normal. Observe during class."], ["👧🏽", "Emma — peanut allergy", "Avoid peanuts during class snack."]].map(([a,t,d]) => <article key={t}><i>{a}</i><span><b>{t}</b><small>{d}</small></span><button onClick={() => notify("Health concern sent to parent")}><Mail /></button></article>)}</section></div>{record && <SimpleForm title="Record Health Check" close={() => setRecord(false)} submit={() => { setRecord(false); notify("Health check recorded"); }} fields={["Learner", "Temperature (°C)", "Height (cm)", "Weight (kg)", "Teacher observation"]} />}</>;
}

function Rewards({ notify }: { notify: Notify }) {
  const ranked = [...pupils].sort((a,b) => b.stars-a.stars).slice(0,5);
  return <><Heading eyebrow="POSITIVE REINFORCEMENT" title="Rewards & Gamification" detail="Celebrate effort through stars, badges, and certificates."><button className="ta-primary" onClick={() => notify("Custom badge creator opened")}><Plus /> Create Badge</button></Heading><div className="ta-grid-2"><section className="ta-card ta-ranking"><header><span className="yellow"><Award /></span><div><h2>Class Leaderboard</h2><p>Top stars this month</p></div></header>{ranked.map((p,i) => <div key={p.name}><strong>{i+1}</strong><i>{p.avatar}</i><span><b>{p.name}</b><small>Sunflower</small></span><em>⭐ {p.stars}</em><button onClick={() => notify(`Special star awarded to ${p.name}`)}><Plus /></button></div>)}</section><section className="ta-card ta-badges"><header><span className="purple"><Star /></span><div><h2>Badge Library</h2><p>Tap a badge to award it</p></div></header><div>{[["🎨","Color Master"],["🔢","Math Wizard"],["📅","Perfect Attendance"],["🧭","Super Explorer"],["📚","Reading Star"],["💛","Kind Helper"]].map(([i,n]) => <button onClick={() => notify(`${n} selected`)} key={n}><i>{i}</i><b>{n}</b><small>Tap to award</small></button>)}</div></section></div><section className="ta-card ta-reward-history"><header><span><Star /></span><div><h2>Star Distribution History</h2><p>Recent teacher-issued rewards</p></div><button className="ta-secondary" onClick={() => notify("Certificate creator opened")}><Award /> Issue Certificate</button></header>{[["Sofia Reyes", "+10", "Excellent reading"],["Liam Cruz", "+15", "Colors Quest Level 2"],["Noah Garcia", "+5", "Great participation"]].map(([n,s,r]) => <div key={n}><i>⭐</i><span><b>{n}</b><small>{r}</small></span><strong>{s} stars</strong><em>Today</em></div>)}</section></>;
}

function ProfileSettings({ notify, logout }: { notify: Notify; logout: () => void }) {
  const [edit, setEdit] = useState(false); const [toggles, setToggles] = useState([true,true,false]);
  return <><Heading eyebrow="YOUR ACCOUNT" title="Profile & Settings" detail="Manage teacher information and notification preferences."/><div className="ta-settings-grid"><section className="ta-card ta-profile"><div>👩🏻‍🏫<button><Camera /></button></div><h2>Maria Santos</h2><p>Kindergarten Teacher</p><span><i /> Active faculty account</span><dl><dt>Handled Section</dt><dd>Sunflower · Kindergarten</dd><dt>Teacher ID</dt><dd>TCH-2026-014</dd></dl><button className="ta-primary ta-full" onClick={() => setEdit(true)}><Pencil /> Edit Profile</button></section><section className="ta-card ta-settings"><header><span className="purple"><Settings /></span><div><h2>Account Settings</h2><p>Details and preferences</p></div></header>{[["Full Name","Maria Santos",UserRound,"Edit"],["Email Address","maria@learnease.edu",Mail,"Edit"],["Password","Last changed 30 days ago",ShieldCheck,"Change"]].map(([a,b,Icon,c]) => <div className="ta-setting" key={String(a)}><Icon /><span><b>{String(a)}</b><small>{String(b)}</small></span><button onClick={() => setEdit(true)}>{String(c)}</button></div>)}<h3>Notification Preferences</h3>{[["Push notifications","Student activity and alerts"],["Email notifications","Weekly progress reports"],["Weekly class summary","Every Friday at 4 PM"]].map(([a,b],i) => <div className="ta-setting" key={a}><Bell/><span><b>{a}</b><small>{b}</small></span><button className={`ta-toggle ${toggles[i] ? "on" : ""}`} onClick={() => setToggles(toggles.map((x,j) => i===j?!x:x))}><i/></button></div>)}<button className="ta-danger" onClick={logout}><LogOut /> Logout of Teacher Account</button></section></div>{edit && <SimpleForm title="Edit Teacher Profile" close={() => setEdit(false)} submit={() => { setEdit(false); notify("Profile changes saved"); }} fields={["Full Name", "Email Address", "Handled Section"]}/>}</>;
}

function SimpleForm({ title, fields, close, submit }: { title: string; fields: string[]; close: () => void; submit: () => void }) {
  return <div className="ta-overlay" onMouseDown={close}><form className="ta-modal ta-form" onMouseDown={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); submit(); }}><button type="button" className="ta-close" onClick={close}><X /></button><h2>{title}</h2><p>Complete the details below.</p>{fields.map((f,i) => <label key={f}>{f}{f.toLowerCase().includes("description") || f.toLowerCase().includes("observation") ? <textarea placeholder={`Enter ${f.toLowerCase()}`}/> : <input required={i === 0} placeholder={`Enter ${f.toLowerCase()}`}/>}</label>)}<button className="ta-primary ta-full">Save</button></form></div>;
}

export default function TeacherApp() {
  const navigate = useNavigate(); const [page, setPage] = useState<PageKey>("dashboard"); const [menu, setMenu] = useState(false); const [profile, setProfile] = useState(false); const [alerts, setAlerts] = useState(false); const [toast, setToast] = useState("");
  const current = useMemo(() => navItems.find(x => x.key === page)!, [page]);
  const CurrentIcon = current.icon;
  const notify: Notify = text => { setToast(text); window.setTimeout(() => setToast(""), 2400); };
  const go = (key: PageKey) => { setPage(key); setMenu(false); setProfile(false); setAlerts(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const logout = () => { localStorage.removeItem("user"); navigate("/"); };
  return <div className="teacher-app"><aside className={`ta-sidebar ${menu ? "open" : ""}`}><div className="ta-logo"><img src={logo}/><span><b>LearnEase</b><small>Teacher Portal</small></span><button onClick={() => setMenu(false)}><X/></button></div><nav>{navItems.map(({key,label,icon:Icon}) => <button className={page===key?"active":""} onClick={() => go(key)} key={key}><i><Icon/></i><b>{label}</b></button>)}</nav><div className="ta-side-profile"><i>👩🏻‍🏫</i><span><b>Maria Santos</b><small>Kindergarten Teacher</small></span><button onClick={logout}><LogOut/></button></div></aside>{menu && <button className="ta-backdrop" onClick={() => setMenu(false)}/>}<main><header className="ta-top"><button className="ta-menu" onClick={() => setMenu(true)}><Menu/></button><div className="ta-mobile-logo"><img src={logo}/><b>LearnEase Kids</b></div><span className="ta-current"><CurrentIcon/><b>{current.label}</b></span><div className="ta-top-actions"><div><button className="ta-bell" onClick={() => {setAlerts(!alerts);setProfile(false)}}><Bell/><b>3</b></button>{alerts && <section className="ta-pop ta-alert-pop"><h3>Notifications</h3>{[["⚠️","Attendance reminder","Review today's class attendance"],["🎨","Quest update","A learner completed a Colors activity"],["⭐","New achievement","A learner earned a new badge"]].map(([i,t,d]) => <button onClick={() => notify(t)} key={t}><i>{i}</i><span><b>{t}</b><small>{d}</small></span></button>)}</section>}</div><div><button className="ta-top-profile" onClick={() => {setProfile(!profile);setAlerts(false)}}><i>👩🏻‍🏫</i><span><b>Teacher Maria</b><small>Sunflower Class</small></span><ChevronDown/></button>{profile && <section className="ta-pop ta-profile-pop"><button onClick={() => go("settings")}><UserRound/> My Profile</button><button onClick={() => go("settings")}><Settings/> Settings</button><button onClick={logout}><LogOut/> Logout</button></section>}</div></div></header><div className="ta-content">{page === "dashboard" && <Dashboard go={go} notify={notify}/>} {page === "students" && <Students notify={notify}/>} {page === "lessons" && <Lessons notify={notify}/>} {page === "activities" && <Activities notify={notify}/>} {page === "attendance" && <Attendance notify={notify}/>} {page === "health" && <Health notify={notify}/>} {page === "rewards" && <Rewards notify={notify}/>} {page === "settings" && <ProfileSettings notify={notify} logout={logout}/>}</div></main><nav className="ta-bottom">{navItems.slice(0,5).map(({key,label,icon:Icon}) => <button className={page===key?"active":""} onClick={() => go(key)} key={key}><Icon/><span>{label.split(" ")[0]}</span></button>)}<button onClick={() => setMenu(true)}><MoreHorizontal/><span>More</span></button></nav>{toast && <div className="ta-toast"><Check/>{toast}</div>}</div>;
}
