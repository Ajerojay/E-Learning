import type { AttendanceStatus } from "../../../backend/attendance";

export const ATTENDANCE_HISTORY_KEY = "learnease.attendanceHistory";

export type AttendanceHistory = Record<string, Record<string, AttendanceStatus>>;
export type MonthPoint = { year: number; month: number };

export type LearnerRef = {
  id: string;
  name: string;
  section: string;
};

export type ClassMonthRow = LearnerRef & {
  marks: Array<AttendanceStatus | undefined>;
  present: number;
  late: number;
  absent: number;
  excused: number;
};

export type StudentMonthDay = {
  key: string;
  day: number;
  label: string;
  weekday: string;
  weekend: boolean;
  status?: AttendanceStatus;
};

const STATUS_LETTER: Record<AttendanceStatus, string> = {
  Present: "P",
  Late: "L",
  Absent: "A",
  Excused: "E",
};

export function readAttendanceHistory(): AttendanceHistory {
  try {
    const parsed = JSON.parse(localStorage.getItem(ATTENDANCE_HISTORY_KEY) || "{}") as AttendanceHistory;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeAttendanceHistory(history: AttendanceHistory) {
  localStorage.setItem(ATTENDANCE_HISTORY_KEY, JSON.stringify(history));
}

export function mergeAttendanceRecords(records: Array<{ child_id: string; attendance_date: string; status: AttendanceStatus }>) {
  const history = readAttendanceHistory();
  records.forEach(record => {
    history[record.child_id] ||= {};
    history[record.child_id][record.attendance_date] = record.status;
  });
  writeAttendanceHistory(history);
  return history;
}

export function currentMonth(): MonthPoint {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function monthFromDateKey(dateKey: string): MonthPoint {
  const [year, month] = dateKey.split("-").map(Number);
  return { year, month: month - 1 };
}

export function shiftMonth(point: MonthPoint, delta: number): MonthPoint {
  const date = new Date(point.year, point.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function isAfterCurrentMonth(point: MonthPoint) {
  const now = currentMonth();
  return point.year > now.year || (point.year === now.year && point.month > now.month);
}

export function daysInMonth(point: MonthPoint) {
  return new Date(point.year, point.month + 1, 0).getDate();
}

export function dateKeyFor(point: MonthPoint, day: number) {
  return `${point.year}-${String(point.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function monthTitle(point: MonthPoint) {
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(new Date(point.year, point.month, 1));
}

export function longDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${dateKey}T00:00:00`));
}

export function statusLetter(status?: AttendanceStatus) {
  return status ? STATUS_LETTER[status] : "—";
}

export function buildClassMonth(learners: LearnerRef[], month: MonthPoint, history = readAttendanceHistory()): ClassMonthRow[] {
  const totalDays = daysInMonth(month);
  return [...learners]
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map(learner => {
      const marks = Array.from({ length: totalDays }, (_, index) => history[learner.id]?.[dateKeyFor(month, index + 1)]);
      return {
        ...learner,
        marks,
        present: marks.filter(status => status === "Present").length,
        late: marks.filter(status => status === "Late").length,
        absent: marks.filter(status => status === "Absent").length,
        excused: marks.filter(status => status === "Excused").length,
      };
    });
}

export function buildStudentMonth(childId: string, month: MonthPoint, history = readAttendanceHistory()): StudentMonthDay[] {
  const totalDays = daysInMonth(month);
  return Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const key = dateKeyFor(month, day);
    const date = new Date(`${key}T00:00:00`);
    const weekdayIndex = date.getDay();
    return {
      key,
      day,
      label: longDate(key),
      weekday: new Intl.DateTimeFormat("en-PH", { weekday: "long" }).format(date),
      weekend: weekdayIndex === 0 || weekdayIndex === 6,
      status: history[childId]?.[key],
    };
  });
}

export function monthCounts(days: StudentMonthDay[]) {
  return {
    Present: days.filter(day => day.status === "Present").length,
    Late: days.filter(day => day.status === "Late").length,
    Absent: days.filter(day => day.status === "Absent").length,
    Excused: days.filter(day => day.status === "Excused").length,
  };
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fileSlug(value: string) {
  return value.trim().replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "attendance";
}

export function downloadClassMonth(learners: LearnerRef[], month: MonthPoint, teacherName: string) {
  const rows = buildClassMonth(learners, month);
  const dayHeaders = rows[0]?.marks.map((_, index) => index + 1) ?? Array.from({ length: daysInMonth(month) }, (_, index) => index + 1);
  downloadCsv(`Class-Attendance-${fileSlug(monthTitle(month))}.csv`, [
    ["LearnEase Class Attendance"],
    ["Month", monthTitle(month)],
    ["Prepared by", teacherName],
    [],
    ["No.", "Learner", "Section", ...dayHeaders, "Present", "Late", "Absent", "Excused"],
    ...rows.map((row, index) => [
      index + 1,
      row.name,
      row.section,
      ...row.marks.map(status => statusLetter(status)),
      row.present,
      row.late,
      row.absent,
      row.excused,
    ]),
  ]);
}

export function downloadStudentMonth(learner: LearnerRef, month: MonthPoint, teacherName: string) {
  const days = buildStudentMonth(learner.id, month);
  const counts = monthCounts(days);
  downloadCsv(`${fileSlug(learner.name)}-Attendance-${fileSlug(monthTitle(month))}.csv`, [
    ["LearnEase Learner Attendance"],
    ["Learner", learner.name],
    ["Section", learner.section],
    ["Month", monthTitle(month)],
    ["Prepared by", teacherName],
    [],
    ["Date", "Day", "Status"],
    ...days.map(day => [day.label, day.weekday, day.status || "—"]),
    [],
    ["Present", counts.Present],
    ["Late", counts.Late],
    ["Absent", counts.Absent],
    ["Excused", counts.Excused],
  ]);
}

export function printAttendanceSheet(title: string) {
  const nativePrint = (window as Window & { AndroidPrint?: { print?: (title: string) => void } }).AndroidPrint;
  if (typeof nativePrint?.print === "function") {
    nativePrint.print(title);
    return;
  }
  window.print();
}
