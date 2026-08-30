import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, Bell, BookOpen, CalendarDays, ChevronDown, ClipboardCheck,
  FileBarChart, Heart, Home, LogOut, NotebookPen, Palette,
  Settings, Star, Sun, UserRound, Users, Utensils, X,
} from "lucide-react";
import logo from "../../../../images/learnease logo-no bg.png";
import "./TeacherDashboard.css";

const navItems = [
  { label: "Dashboard", icon: Home, active: true },
  { label: "Students", icon: Users },
  { label: "Modules", icon: BookOpen },
  { label: "Rewards", icon: Star },
  { label: "Activities", icon: NotebookPen },
  { label: "Attendance", icon: CalendarDays },
  { label: "Health Monitoring", icon: Heart },
  { label: "Reports", icon: FileBarChart },
  { label: "Settings", icon: Settings },
];

const stats = [
  { title: "Total Students", value: "25", action: "View Students", icon: "ðŸ‘©â€ðŸ‘§â€ðŸ‘¦", tone: "blue", progress: 83 },
  { title: "Todayâ€™s Attendance", value: "22", action: "Present Today", icon: "ðŸ“‹", tone: "green", progress: 88 },
  { title: "Activities Today", value: "8", action: "View Activities", icon: "ðŸ“", tone: "pink", progress: 64 },
  { title: "Stars Given", value: "450", action: "View Rewards", icon: "â­", tone: "purple", progress: 75 },
];

const schedule = [
  { time: "8:00 AM", name: "Alphabet Lesson", color: "#ffc84b", Icon: BookOpen },
  { time: "9:30 AM", name: "Numbers Activity", color: "#5d9cf5", Icon: Activity },
  { time: "11:00 AM", name: "Snack Time", color: "#65bd73", Icon: Utensils },
  { time: "1:00 PM", name: "Story Time", color: "#b28cf5", Icon: BookOpen },
  { time: "2:00 PM", name: "Coloring Activity", color: "#f48daf", Icon: Palette },
];

const recent = [
  { avatar: "ðŸ‘§ðŸ»", text: "Sofia earned â€œReading Starâ€", time: "2 min ago", badge: "ðŸŒŸ" },
  { avatar: "ðŸ‘¦ðŸ»", text: "Liam completed Colors", time: "15 min ago", badge: "ðŸŽ¨" },
  { avatar: "ðŸ‘§ðŸ»", text: "Emma finished Shapes", time: "30 min ago", badge: "ðŸ”º" },
];

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileView, setProfileView] = useState<"profile" | "settings" | null>(null);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const headerActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closePopovers = (event: MouseEvent) => {
      if (!headerActionsRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", closePopovers);
    return () => document.removeEventListener("mousedown", closePopovers);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showAction = (message: string) => setToast(message);
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric",
  }).format(new Date());

  const logout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <div className="td-page">
      <aside className="td-sidebar">
        <div className="td-sun"><Sun size={26} /></div>
        <nav>
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={activeNav === label ? "active" : ""} type="button" onClick={() => {
              setActiveNav(label);
              if (label === "Settings") setProfileView("settings");
              else if (label !== "Dashboard") showAction(`${label} section selected`);
            }}>
              <Icon size={23} strokeWidth={2.2} /><span>{label}</span>
            </button>
          ))}
          <button type="button" onClick={logout}><LogOut size={23} /><span>Logout</span></button>
        </nav>
        <div className="td-bear" aria-hidden="true">ðŸ§¸<span>ðŸ’—</span></div>
      </aside>

      <main className="td-main">
        <header className="td-header">
          <div className="td-brand"><img src={logo} alt="" /><strong>LearnEase Kids</strong></div>
          <div className="td-header-actions" ref={headerActionsRef}>
            <div className="td-popover-wrap">
              <button
                className="td-notifications"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setProfileOpen(false);
                }}
              ><Bell size={22} /><b>3</b></button>
              {notificationsOpen && (
                <div className="td-popover td-notification-menu">
                  <strong>Notifications</strong>
                  <p>Attendance is ready to review.</p>
                  <p>3 students completed activities.</p>
                  <p>Sofia earned a Reading Star.</p>
                </div>
              )}
            </div>
            <div className="td-popover-wrap">
              <button
                className="td-profile"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setProfileOpen((open) => !open);
                  setNotificationsOpen(false);
                }}
              ><span>ðŸ‘©ðŸ»â€ðŸ«</span><span><strong>Teacher Maria</strong><small>Kindergarten Teacher</small></span><ChevronDown className={profileOpen ? "rotated" : ""} size={17} /></button>
              {profileOpen && (
                <div className="td-popover td-profile-menu" role="menu">
                  <div className="td-menu-person"><span>ðŸ‘©ðŸ»â€ðŸ«</span><div><strong>Maria Santos</strong><small>maria@learnease.test</small></div></div>
                  <button type="button" role="menuitem" onClick={() => { setProfileView("profile"); setProfileOpen(false); }}><UserRound size={17} />My Profile</button>
                  <button type="button" role="menuitem" onClick={() => { setProfileView("settings"); setProfileOpen(false); }}><Settings size={17} />Account Settings</button>
                  <button type="button" role="menuitem" className="danger" onClick={logout}><LogOut size={17} />Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="td-dashboard-card">
          <div className="td-greeting">
            <div><h1>Good Morning, Teacher Maria! <span className="td-wave">ðŸ‘‹</span></h1><p>Hereâ€™s whatâ€™s happening in your classroom today.</p><span className="td-date">ðŸ“… {today}</span></div>
            <div className="td-cloud" aria-hidden="true">â˜ï¸</div>
          </div>

          <div className="td-stats">
            {stats.map((stat) => (
              <article className={`td-stat ${stat.tone}`} key={stat.title} role="button" tabIndex={0} onClick={() => showAction(`${stat.action} opened`)} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") showAction(`${stat.action} opened`);
              }}>
                <h2>{stat.title}</h2>
                <div><span className="td-stat-icon">{stat.icon}</span><strong>{stat.value}</strong></div>
                <small>{stat.action} â€º</small>
                <span className="td-mini-progress" aria-label={`${stat.progress}% progress`}><i style={{ width: `${stat.progress}%` }} /></span>
              </article>
            ))}
          </div>

          <div className="td-panels">
            <section className="td-panel td-schedule">
              <h2><CalendarDays size={22} />Todayâ€™s Schedule</h2>
              <div className="td-panel-body">
                {schedule.map(({ time, name, color, Icon }) => (
                  <div className="td-schedule-row" key={time} onClick={() => showAction(`${name} at ${time}`)}>
                    <strong>{time}</strong><i style={{ backgroundColor: color }} /><span>{name}</span><Icon size={16} />
                  </div>
                ))}
                <div className="td-reading-bear" aria-hidden="true">ðŸ§¸ðŸ“–</div>
              </div>
            </section>

            <section className="td-panel td-activity">
              <h2><Star size={22} fill="#ffc93d" />Recent Student Activity</h2>
              <div className="td-panel-body">
                {recent.map((item) => (
                  <div className="td-activity-row" key={item.text} onClick={() => showAction(item.text)}>
                    <span className="td-avatar">{item.avatar}</span>
                    <span><strong>{item.text}</strong><small>{item.time}</small></span>
                    <b>{item.badge}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>

        {profileView && (
          <div className="td-modal-backdrop" role="presentation" onMouseDown={() => setProfileView(null)}>
            <section className="td-profile-modal" role="dialog" aria-modal="true" aria-labelledby="td-modal-title" onMouseDown={(event) => event.stopPropagation()}>
              <button className="td-modal-close" aria-label="Close" onClick={() => setProfileView(null)}><X size={20} /></button>
              <div className="td-modal-avatar">ðŸ‘©ðŸ»â€ðŸ«</div>
              <h2 id="td-modal-title">{profileView === "profile" ? "Teacher Profile" : "Account Settings"}</h2>
              {profileView === "profile" ? (
                <div className="td-profile-details"><p><span>Name</span><strong>Maria Santos</strong></p><p><span>Role</span><strong>Kindergarten Teacher</strong></p><p><span>Email</span><strong>maria@learnease.test</strong></p></div>
              ) : (
                <div className="td-settings-list"><label><span>Email notifications</span><input type="checkbox" defaultChecked /></label><label><span>Activity reminders</span><input type="checkbox" defaultChecked /></label><label><span>Weekly class summary</span><input type="checkbox" /></label></div>
              )}
            </section>
          </div>
        )}
        {toast && <div className="td-toast" role="status"><span>âœ¨</span>{toast}</div>}
      </main>
    </div>
  );
}

