import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert,
  Pencil, Printer, Send, Users, X,
} from "lucide-react";
import BearLoading from "../BearLoading";
import { supabase } from "../../../backend/supabase";
import { getAttendanceRecords, localDateKey, saveAttendanceRecords, type AttendanceStatus } from "../../../backend/attendance";
import { sendParentAnnouncement } from "../../../backend/supabaseData";
import { getOfflineChildrenFromSqlite } from "../../../backend/offlineSqlite";
import { getStoredChildAvatar, normalizeChildAvatar } from "../../../backend/childAvatar";
import { childAvatarById } from "../pages/Student/childAvatars";
import { ClassMonthReport, StudentMonthReport, type ReportTeacher } from "./AttendanceReports";
import {
  buildStudentMonth,
  dateKeyFor,
  longDate,
  mergeAttendanceRecords,
  monthCounts,
  monthFromDateKey,
  monthTitle,
  readAttendanceHistory,
  writeAttendanceHistory,
  type MonthPoint,
} from "./attendanceRecords";

type Notify = (text: string) => void;
type DayStatus = AttendanceStatus | "Unmarked";
type AttendanceRow = {
  id: string;
  parentId: string | null;
  name: string;
  section: string;
  avatar: ReactNode;
};

const STATUSES = ["Present", "Late", "Absent", "Excused"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function studentAvatar(avatarId: string | null | undefined, fallback: string) {
  const avatar = childAvatarById(avatarId);
  return avatar ? <img className="ta-student-avatar-image" src={avatar.src} alt={`${avatar.label} avatar`} /> : <>{fallback}</>;
}

function teacherKey(teacher: ReportTeacher & { id?: string }) {
  return teacher.id || `username:${teacher.name.trim().toLowerCase()}`;
}

function Heading({ eyebrow, title, detail, children }: { eyebrow: string; title: string; detail: string; children?: ReactNode }) {
  return <div className="ta-heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div><div className="ta-heading-actions">{children}</div></div>;
}

function monthCells(month: Date) {
  const blanks = Array.from({ length: new Date(month.getFullYear(), month.getMonth(), 1).getDay() }, () => null);
  const days = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, index) => index + 1);
  return [...blanks, ...days];
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default function TeacherAttendance({ notify, teacher }: { notify: Notify; teacher: ReportTeacher & { id: string } }) {
  const today = localDateKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [draft, setDraft] = useState<Record<string, DayStatus>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(true);
  const [sending, setSending] = useState(false);
  const [classCalendarOpen, setClassCalendarOpen] = useState(false);
  const [classCalendarMonth, setClassCalendarMonth] = useState(() => startOfMonth());
  const [classDateView, setClassDateView] = useState<string | null>(null);
  const [classReportMonth, setClassReportMonth] = useState<MonthPoint | null>(null);
  const [calendarStudent, setCalendarStudent] = useState<AttendanceRow | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth());
  const [studentReport, setStudentReport] = useState<{ learner: AttendanceRow; month: MonthPoint } | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const refreshHistory = () => setHistoryTick(value => value + 1);

  useEffect(() => {
    let active = true;
    const loadRoster = async () => {
      setLoading(true);
      setLoadError("");
      let { data, error } = await supabase.from("children_accounts").select("id, parent_id, child_name, first_name, last_name, grade_level, is_active, avatar").order("created_at", { ascending: false });
      if (error && /avatar|column|schema cache|could not find/i.test(error.message)) {
        const fallback = await supabase.from("children_accounts").select("id, parent_id, child_name, first_name, last_name, grade_level, is_active").order("created_at", { ascending: false });
        data = fallback.data?.map(row => ({ ...row, avatar: null })) ?? null;
        error = fallback.error;
      }
      if (!active) return;
      const roster = error
        ? (await getOfflineChildrenFromSqlite()).filter(row => row.is_active !== 0).map(row => ({ id: row.id, parent_id: row.parent_id, child_name: row.child_name, first_name: row.first_name, last_name: row.last_name, grade_level: "Preschool", avatar: null }))
        : (data ?? []).filter(student => student.is_active !== false);
      if (error && !roster.length) {
        console.error("Teacher attendance roster error:", error.message);
        setRows([]);
        setLoadError("Unable to load the student roster. Please try again.");
        setLoading(false);
        return;
      }
      const loaded = roster.map((student, index) => {
        const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
        const id = String(student.id);
        return {
          id,
          parentId: student.parent_id ? String(student.parent_id) : null,
          name: student.child_name?.trim() || fullName || "Unnamed learner",
          section: student.grade_level?.trim() || "Preschool",
          avatar: studentAvatar(normalizeChildAvatar(student.avatar) || getStoredChildAvatar(id), index % 2 === 0 ? "🧒" : "👧"),
        };
      });
      mergeAttendanceRecords(await getAttendanceRecords(loaded.map(row => row.id)));
      if (!active) return;
      setRows(loaded);
      setLoading(false);
      refreshHistory();
    };
    void loadRoster();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const history = readAttendanceHistory();
    const statusOnDate = (rowId: string): DayStatus => history[rowId]?.[selectedDate] ?? "Unmarked";
    setDraft(Object.fromEntries(rows.map(row => [row.id, statusOnDate(row.id)])));
    setEditing(!rows.length || rows.some(row => statusOnDate(row.id) === "Unmarked"));
  }, [selectedDate, rows]);

  const rosterIds = rows.map(row => row.id).join(",");
  useEffect(() => {
    if (!rosterIds) return;
    let active = true;
    const syncLoginAttendance = async () => {
      const records = await getAttendanceRecords(rosterIds.split(","));
      if (!active || !records.length) return;
      const history = mergeAttendanceRecords(records);
      setDraft(current => {
        const next = { ...current };
        records.forEach(record => {
          if (record.attendance_date === selectedDate) next[record.child_id] = history[record.child_id]?.[selectedDate] || next[record.child_id] || "Unmarked";
        });
        return next;
      });
      refreshHistory();
    };
    const refresh = () => { void syncLoginAttendance(); };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [rosterIds, selectedDate]);

  const present = rows.filter(row => draft[row.id] === "Present").length;
  const attendanceRate = rows.length ? Math.round(present / rows.length * 100) : 0;
  const saved = rows.length > 0 && rows.every(row => draft[row.id] && draft[row.id] !== "Unmarked") && !editing;
  const futureDate = selectedDate > today;
  const currentMonthStart = startOfMonth();
  const learners = rows.map(({ id, name, section }) => ({ id, name, section }));

  const setStatus = (childId: string, status: AttendanceStatus) => {
    if (futureDate) return;
    setDraft(current => ({ ...current, [childId]: status }));
    setEditing(true);
  };

  const saveAttendance = async () => {
    if (futureDate) {
      notify("Future attendance dates cannot be edited.");
      return;
    }
    const history = readAttendanceHistory();
    rows.forEach(row => {
      history[row.id] ||= {};
      const status = draft[row.id];
      if (!status || status === "Unmarked") delete history[row.id][selectedDate];
      else history[row.id][selectedDate] = status;
    });
    writeAttendanceHistory(history);
    try {
      await saveAttendanceRecords(rows.flatMap(row => {
        const status = draft[row.id];
        return !status || status === "Unmarked" ? [] : [{ childId: row.id, date: selectedDate, status, teacherId: teacherKey(teacher), teacherName: teacher.name }];
      }));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Attendance could not sync online.");
      return;
    }
    setEditing(false);
    refreshHistory();
    notify(`Attendance submitted for ${longDate(selectedDate)}`);
  };

  const sendMonthToParent = async (student: AttendanceRow, month: MonthPoint) => {
    if (!student.parentId || sending) return;
    const counts = monthCounts(buildStudentMonth(student.id, month));
    setSending(true);
    try {
      await sendParentAnnouncement({
        title: `${student.name} — ${monthTitle(month)} Attendance`,
        message: `${monthTitle(month)} attendance: ${counts.Present} Present, ${counts.Late} Late, ${counts.Absent} Absent, and ${counts.Excused} Excused.`,
        kind: "attendance",
        parentId: student.parentId,
        childId: student.id,
      });
      notify(`Monthly attendance sent to ${student.name}'s parent`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Attendance notification could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const openStudentCalendar = (student: AttendanceRow, dateKey = selectedDate) => {
    const date = new Date(`${dateKey}T00:00:00`);
    setCalendarMonth(startOfMonth(date));
    setCalendarStudent(student);
  };

  const history = useMemo(() => readAttendanceHistory(), [historyTick]);

  return (
    <>
      <Heading eyebrow="DAILY ATTENDANCE" title="Attendance" detail="Mark learners for a date, then print or download the whole month as a table.">
        <button className="ta-class-date" onClick={() => { const date = new Date(`${selectedDate}T00:00:00`); setClassCalendarMonth(startOfMonth(date)); setClassCalendarOpen(true); }}>
          <CalendarDays />
          <span><small>Select attendance date</small><b>{longDate(selectedDate)}</b></span>
          <ChevronDown />
        </button>
        <button className="ta-secondary" disabled={!rows.length} onClick={() => setClassReportMonth(monthFromDateKey(selectedDate))}><Printer /> Monthly class record</button>
      </Heading>

      {loading && <section className="ta-student-state"><BearLoading compact /></section>}
      {!loading && loadError && <section className="ta-student-state error"><CircleAlert /><h3>Unable to load attendance</h3><p>{loadError}</p></section>}
      {!loading && !loadError && rows.length === 0 && <section className="ta-student-state"><Users /><h3>No student accounts found</h3><p>Students added to Student Management will appear here automatically.</p></section>}

      {!loading && !loadError && rows.length > 0 && (
        <>
          <section className="ta-att-summary ta-auto-att-summary">
            <div className="ta-ring"><b>{attendanceRate}%</b></div>
            <div><h2>{present} Present</h2><p>{present} of {rows.length} learners marked present for this date</p></div>
            <span className="present"><b>{present}</b>Present</span>
          </section>
          {saved && <div className="ta-att-complete"><Check /><span><b>Attendance saved for this date</b><small>Select Edit Attendance if you need to make a correction.</small></span></div>}
          <section className="ta-card ta-roll ta-auto-roll">
            <header>
              <span><CalendarDays /></span>
              <div><h2>Attendance List — {longDate(selectedDate)}</h2><p>PIN logins appear automatically. Open a learner for that month’s record.</p></div>
            </header>
            {rows.map(student => (
              <div className="ta-roll-row" key={student.id}>
                <i>{student.avatar}</i>
                <button className="ta-att-student" onClick={() => openStudentCalendar(student)}>
                  <b>{student.name}</b>
                  <small>{student.section} · Monthly attendance record</small>
                </button>
                <div>
                  {STATUSES.map(status => (
                    <button key={status} disabled={!editing || futureDate} className={`${draft[student.id] === status ? "active " : ""}${status.toLowerCase()}`} onClick={() => setStatus(student.id, status)}>{status}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="ta-att-actions">
              {saved
                ? <button className="ta-secondary ta-edit-att" onClick={() => setEditing(true)}><Pencil /> Edit Attendance</button>
                : <button className="ta-primary" disabled={futureDate || rows.some(row => !draft[row.id] || draft[row.id] === "Unmarked")} onClick={() => void saveAttendance()}><Check /> Save Attendance</button>}
            </div>
          </section>
        </>
      )}

      {classCalendarOpen && (
        <div className="ta-overlay" onMouseDown={() => setClassCalendarOpen(false)}>
          <section className="ta-modal ta-att-calendar ta-class-calendar" onMouseDown={event => event.stopPropagation()}>
            <button className="ta-close" onClick={() => setClassCalendarOpen(false)}><X /></button>
            <div className="ta-calendar-child"><i><Users /></i><span><h2>Class Attendance Calendar</h2><p>Choose today or a past date. Future dates are locked.</p></span></div>
            <div className="ta-calendar-nav">
              <button type="button" onClick={() => setClassCalendarMonth(new Date(classCalendarMonth.getFullYear(), classCalendarMonth.getMonth() - 1, 1))}><ChevronLeft /></button>
              <b>{monthTitle({ year: classCalendarMonth.getFullYear(), month: classCalendarMonth.getMonth() })}</b>
              <button type="button" disabled={classCalendarMonth >= currentMonthStart} onClick={() => setClassCalendarMonth(new Date(classCalendarMonth.getFullYear(), classCalendarMonth.getMonth() + 1, 1))}><ChevronRight /></button>
            </div>
            <div className="ta-calendar-week">{WEEKDAYS.map(day => <b key={day}>{day}</b>)}</div>
            <div className="ta-calendar-grid ta-class-calendar-grid">
              {monthCells(classCalendarMonth).map((day, index) => {
                if (day === null) return <span key={`blank-${index}`} />;
                const dateKey = dateKeyFor({ year: classCalendarMonth.getFullYear(), month: classCalendarMonth.getMonth() }, day);
                const recorded = rows.some(row => history[row.id]?.[dateKey]);
                return (
                  <button type="button" disabled={dateKey > today} className={`${recorded ? "recorded" : ""} ${dateKey === selectedDate ? "selected" : ""}`} key={day} onClick={() => { setSelectedDate(dateKey); setClassCalendarOpen(false); setClassDateView(dateKey); }}>
                    <b>{day}</b>
                    <small>{dateKey > today ? "Locked" : recorded ? "Recorded" : "Open"}</small>
                  </button>
                );
              })}
            </div>
            <div className="ta-class-date-actions">
              <button type="button" className="ta-secondary" onClick={() => { setClassReportMonth({ year: classCalendarMonth.getFullYear(), month: classCalendarMonth.getMonth() }); setClassCalendarOpen(false); }}><Printer /> Monthly class record</button>
              <button type="button" className="ta-primary" onClick={() => setClassCalendarOpen(false)}>Close</button>
            </div>
          </section>
        </div>
      )}

      {classDateView && (
        <div className="ta-overlay" onMouseDown={() => setClassDateView(null)}>
          <section className="ta-modal ta-class-date-view" onMouseDown={event => event.stopPropagation()}>
            <button className="ta-close" onClick={() => setClassDateView(null)}><X /></button>
            <div className="ta-calendar-child"><i><CalendarDays /></i><span><h2>Class Attendance</h2><p>{longDate(classDateView)}</p></span></div>
            <div className="ta-class-date-list">
              {rows.map(student => {
                const status = history[student.id]?.[classDateView] || "Unmarked";
                return (
                  <button type="button" key={student.id} onClick={() => { openStudentCalendar(student, classDateView); setClassDateView(null); }}>
                    <i>{student.avatar}</i>
                    <span><b>{student.name}</b><small>{student.section} · Open monthly record</small></span>
                    <em className={status.toLowerCase()}>{status}</em>
                    <ChevronRight />
                  </button>
                );
              })}
            </div>
            <div className="ta-class-date-actions">
              <button type="button" className="ta-secondary" onClick={() => { setClassReportMonth(monthFromDateKey(classDateView)); setClassDateView(null); }}><Printer /> Monthly class record</button>
              <button type="button" className="ta-primary" onClick={() => setClassDateView(null)}>Close</button>
            </div>
          </section>
        </div>
      )}

      {calendarStudent && (
        <div className="ta-overlay" onMouseDown={() => setCalendarStudent(null)}>
          <section className="ta-modal ta-att-calendar" onMouseDown={event => event.stopPropagation()}>
            <button className="ta-close" onClick={() => setCalendarStudent(null)}><X /></button>
            <div className="ta-calendar-child"><i>{calendarStudent.avatar}</i><span><h2>{calendarStudent.name}</h2><p>{calendarStudent.section} · {monthTitle({ year: calendarMonth.getFullYear(), month: calendarMonth.getMonth() })}</p></span></div>
            <div className="ta-calendar-nav">
              <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}><ChevronLeft /></button>
              <b>{monthTitle({ year: calendarMonth.getFullYear(), month: calendarMonth.getMonth() })}</b>
              <button type="button" disabled={calendarMonth >= currentMonthStart} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}><ChevronRight /></button>
            </div>
            <div className="ta-calendar-week">{WEEKDAYS.map(day => <b key={day}>{day}</b>)}</div>
            <div className="ta-calendar-grid">
              {monthCells(calendarMonth).map((day, index) => {
                if (day === null) return <span key={`blank-${index}`} />;
                const point = { year: calendarMonth.getFullYear(), month: calendarMonth.getMonth() };
                const dateKey = dateKeyFor(point, day);
                const status = history[calendarStudent.id]?.[dateKey];
                return <div className={dateKey > today ? "future" : status ? status.toLowerCase() : "unmarked"} key={day}><b>{day}</b><small>{dateKey > today ? "—" : status || "—"}</small></div>;
              })}
            </div>
            <div className="ta-calendar-legend"><span className="present"><i />Present</span><span className="late"><i />Late</span><span className="absent"><i />Absent</span><span className="excused"><i />Excused</span></div>
            <div className="ta-report-actions">
              <button type="button" className="ta-secondary" onClick={() => { setStudentReport({ learner: calendarStudent, month: { year: calendarMonth.getFullYear(), month: calendarMonth.getMonth() } }); setCalendarStudent(null); }}><Printer /> Monthly record</button>
              <button type="button" className="ta-primary" disabled={!calendarStudent.parentId || sending} onClick={() => void sendMonthToParent(calendarStudent, { year: calendarMonth.getFullYear(), month: calendarMonth.getMonth() })}><Send /> {sending ? "Sending…" : "Notify Parent"}</button>
            </div>
          </section>
        </div>
      )}

      {classReportMonth && <ClassMonthReport learners={learners} initialMonth={classReportMonth} teacher={teacher} onClose={() => setClassReportMonth(null)} />}
      {studentReport && <StudentMonthReport learner={studentReport.learner} initialMonth={studentReport.month} teacher={teacher} onClose={() => setStudentReport(null)} />}
    </>
  );
}
