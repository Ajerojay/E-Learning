import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert,
  Mail, Paperclip, Pencil, Printer, Send, Users, X,
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
  dateKeyFor,
  dateKeysThrough,
  longDate,
  mergeAttendanceRecords,
  monthFromDateKey,
  monthTitle,
  readAttendanceHistory,
  attendancePdfFilename,
  studentMonthAttachmentText,
  writeAttendanceHistory,
  type LearnerRef,
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
  const [classReportMonth, setClassReportMonth] = useState<MonthPoint | null>(null);
  const [calendarStudent, setCalendarStudent] = useState<AttendanceRow | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth());
  const [studentReport, setStudentReport] = useState<{ learner: LearnerRef; month: MonthPoint } | null>(null);
  const [parentNote, setParentNote] = useState<{
    student: AttendanceRow;
    month: MonthPoint;
    title: string;
    message: string;
    attachMonthlyRecord: boolean;
  } | null>(null);
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

  const openParentNote = (student: AttendanceRow, month: MonthPoint) => {
    setParentNote({
      student,
      month,
      title: `${student.name} — ${monthTitle(month)} Attendance`,
      message: "Good day,\n\n",
      attachMonthlyRecord: true,
    });
  };

  const sendMonthToParent = async () => {
    if (!parentNote?.student.parentId || sending) return;
    const title = parentNote.title.trim();
    const note = parentNote.message.trim();
    if (!title || !note) {
      notify("Add a subject and message before sending.");
      return;
    }
    const learner = {
      id: parentNote.student.id,
      name: parentNote.student.name,
      section: parentNote.student.section,
    };
    const attachment = parentNote.attachMonthlyRecord
      ? {
          name: attendancePdfFilename(learner.name, monthTitle(parentNote.month)),
          text: studentMonthAttachmentText(learner, parentNote.month, teacher.name),
        }
      : null;
    setSending(true);
    try {
      await sendParentAnnouncement({
        title,
        message: note,
        kind: "attendance",
        parentId: parentNote.student.parentId,
        childId: parentNote.student.id,
        childName: parentNote.student.name,
        senderId: teacherKey(teacher),
        senderName: teacher.name,
        attachment,
      });
      setParentNote(null);
      notify(`Message sent to ${parentNote.student.name}'s parent`);
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
  const dateFilterOptions = useMemo(() => {
    const keys = dateKeysThrough(today);
    const groups: Array<{ label: string; days: Array<{ key: string; label: string }> }> = [];
    keys.forEach(key => {
      const point = monthFromDateKey(key);
      const label = monthTitle(point);
      const last = groups[groups.length - 1];
      const option = { key, label: longDate(key) };
      if (last?.label === label) last.days.push(option);
      else groups.push({ label, days: [option] });
    });
    return groups;
  }, [today]);

  return (
    <>
      <Heading eyebrow="DAILY ATTENDANCE" title="Attendance" detail="Filter a date to view and mark each learner’s attendance, including weekend PIN logins.">
        <label className="ta-class-date ta-date-filter">
          <select
            className="ta-date-filter-input"
            aria-label="Filter attendance by date"
            value={selectedDate}
            onChange={event => setSelectedDate(event.target.value)}
          >
            {dateFilterOptions.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.days.map(day => (
                  <option key={day.key} value={day.key}>{day.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <CalendarDays />
          <span>
            <small>Filter attendance by date</small>
            <b>{longDate(selectedDate)}</b>
          </span>
          <ChevronDown />
        </label>
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
              <div><h2>Attendance List — {longDate(selectedDate)}</h2><p>This list is filtered to the selected date, including weekends. PIN logins count as attendance. Open a learner for that month’s record.</p></div>
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
              <button type="button" className="ta-primary" disabled={!calendarStudent.parentId} onClick={() => openParentNote(calendarStudent, { year: calendarMonth.getFullYear(), month: calendarMonth.getMonth() })}><Send /> Notify Parent</button>
            </div>
          </section>
        </div>
      )}

      {parentNote && (
        <div className="ta-overlay" onMouseDown={() => !sending && setParentNote(null)}>
          <section className="ta-modal ta-parent-note" onMouseDown={event => event.stopPropagation()}>
            <button className="ta-close" disabled={sending} onClick={() => setParentNote(null)}><X /></button>
            <div className="ta-quick-modal-title"><i><Mail /></i><span><h2>Message parent</h2><p>Write your concern. This appears in the parent’s notification bell.</p></span></div>
            <div className={`ta-health-recipient ${parentNote.student.parentId ? "linked" : "missing"}`}>
              <Users />
              <span><small>To</small><b>{parentNote.student.name}'s Parent</b><em>{parentNote.student.parentId ? "Linked parent account · in-app notification" : "No linked parent account"}</em></span>
              {parentNote.student.parentId ? <Check /> : <CircleAlert />}
            </div>
            <label>From<input value={teacher.name} readOnly /></label>
            <label>Subject<input value={parentNote.title} onChange={event => setParentNote({ ...parentNote, title: event.target.value })} placeholder="Subject" /></label>
            <label>Message<textarea maxLength={800} value={parentNote.message} onChange={event => setParentNote({ ...parentNote, message: event.target.value })} placeholder="Write your concern or note for the parent…" /><small>{parentNote.message.length}/800</small></label>
            <div className="ta-parent-attach">
              <label className="ta-parent-attach-toggle">
                <input
                  type="checkbox"
                  checked={parentNote.attachMonthlyRecord}
                  disabled={sending}
                  onChange={event => setParentNote({ ...parentNote, attachMonthlyRecord: event.target.checked })}
                />
                <i aria-hidden="true"><Paperclip /></i>
                <span>
                  <b>Attach monthly record</b>
                  <small>{monthTitle(parentNote.month)} · PDF attachment, not shown in the message</small>
                </span>
              </label>
              <button
                type="button"
                className="ta-secondary"
                disabled={sending}
                onClick={() => setStudentReport({
                  learner: {
                    id: parentNote.student.id,
                    name: parentNote.student.name,
                    section: parentNote.student.section,
                  },
                  month: parentNote.month,
                })}
              >
                <Printer /> Preview record
              </button>
            </div>
            <div className="ta-health-compose-actions ta-send-only">
              <button type="button" className="ta-primary" disabled={sending || !parentNote.title.trim() || !parentNote.message.trim() || !parentNote.student.parentId} onClick={() => void sendMonthToParent()}><Send />{sending ? "Sending…" : parentNote.attachMonthlyRecord ? "Send with record" : "Send to parent"}</button>
            </div>
          </section>
        </div>
      )}
      {classReportMonth && <ClassMonthReport learners={learners} initialMonth={classReportMonth} teacher={teacher} onClose={() => setClassReportMonth(null)} />}
      {studentReport && <StudentMonthReport learner={studentReport.learner} initialMonth={studentReport.month} teacher={teacher} onClose={() => setStudentReport(null)} />}
    </>
  );
}
