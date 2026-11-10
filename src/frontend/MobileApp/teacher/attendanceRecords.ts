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

export function dateKeysThrough(endKey: string, monthsBack = 4) {
  const end = new Date(`${endKey}T00:00:00`);
  const start = new Date(end.getFullYear(), end.getMonth() - monthsBack, 1);
  const keys: string[] = [];
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
  }
  return keys.reverse();
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

export type AttendanceRecordDay = {
  day: string;
  weekday: string;
  status: string;
};

export type AttendanceRecordView = {
  title: string;
  learner: string;
  section: string;
  preparedBy: string;
  totals: string;
  days: AttendanceRecordDay[];
};

export function parseStudentMonthAttachment(text: string): AttendanceRecordView {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n").map(line => line.trim()).filter(Boolean);
  const heading = lines.find(line => /monthly attendance record/i.test(line)) || "Monthly attendance record";
  const title = heading.replace(/^-+|\s*-+$/g, "").trim();
  const who = lines.find(line => line.includes("·") && !/^\d{1,2}\s*·/.test(line) && !/^---/.test(line)) || "";
  const [learner, section = ""] = who.split("·").map(part => part.trim());
  const prepared = lines.find(line => /^prepared by /i.test(line))?.replace(/^prepared by /i, "") || "";
  const totals = lines.find(line => /^totals:/i.test(line))?.replace(/^totals:\s*/i, "") || "";
  const days = lines.flatMap(line => {
    const match = line.match(/^(\d{1,2})\s*·\s*([A-Za-z]{3,9})\s*:\s*(.+)$/);
    if (!match) return [];
    return [{ day: match[1].padStart(2, "0"), weekday: match[2], status: match[3].trim() || "—" }];
  });
  return { title, learner, section, preparedBy: prepared, totals, days };
}

export function studentMonthAttachmentText(learner: LearnerRef, month: MonthPoint, teacherName: string) {
  const days = buildStudentMonth(learner.id, month);
  const counts = monthCounts(days);
  const dayLines = days.map(day => `${String(day.day).padStart(2, "0")} · ${day.weekday.slice(0, 3)}: ${day.status || "—"}`);
  return [
    `--- Monthly attendance record (${monthTitle(month)}) ---`,
    `${learner.name} · ${learner.section}`,
    `Prepared by ${teacherName}`,
    `Totals: ${counts.Present} Present, ${counts.Late} Late, ${counts.Absent} Absent, ${counts.Excused} Excused`,
    "",
    ...dayLines,
  ].join("\n");
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

export function fileSlug(value: string) {
  return value.trim().replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "attendance";
}

export function attendancePdfFilename(learnerName: string, monthLabel: string) {
  return `${fileSlug(learnerName)}-Attendance-${fileSlug(monthLabel)}.pdf`;
}

function pdfSafe(text: string) {
  return Array.from(text).map(char => {
    const code = char.charCodeAt(0);
    if (char === "\\") return "\\\\";
    if (char === "(") return "\\(";
    if (char === ")") return "\\)";
    if (code === 9) return "  ";
    if (code >= 32 && code <= 126) return char;
    if (code > 127 && code < 256) return `\\${code.toString(8).padStart(3, "0")}`;
    return "?";
  }).join("");
}

function wrapPdfLines(text: string, maxChars = 86) {
  return text.replace(/\r\n/g, "\n").split("\n").flatMap(line => {
    const value = line || " ";
    if (value.length <= maxChars) return [value];
    const parts: string[] = [];
    let rest = value;
    while (rest.length > maxChars) {
      const slice = rest.slice(0, maxChars);
      const breakAt = slice.lastIndexOf(" ");
      const take = breakAt > 40 ? breakAt : maxChars;
      parts.push(rest.slice(0, take).trimEnd());
      rest = rest.slice(take).trimStart();
    }
    if (rest) parts.push(rest);
    return parts;
  });
}

export function textPdfBlob(text: string) {
  const lines = wrapPdfLines(text.trim() || "Attendance record");
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const leading = 14;
  const perPage = Math.max(1, Math.floor((pageHeight - margin * 2) / leading));
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += perPage) pages.push(lines.slice(index, index + perPage));
  if (!pages.length) pages.push(["Attendance record"]);

  const parts: string[] = [];
  const pageObjectIds: number[] = [];
  pages.forEach((pageLines, pageIndex) => {
    const contentId = 4 + pageIndex * 2;
    const pageId = contentId + 1;
    pageObjectIds.push(pageId);
    const stream = `${pageLines.map((line, lineIndex) => `BT /F1 11 Tf ${margin} ${pageHeight - margin - lineIndex * leading} Td (${pdfSafe(line)}) Tj ET`).join("\n")}\n`;
    parts[contentId] = `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`;
    parts[pageId] = `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
  });
  parts[1] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  parts[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>\nendobj\n`;
  parts[3] = "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

  let output = "%PDF-1.4\n";
  const xref = [0];
  const lastId = 3 + pages.length * 2;
  for (let id = 1; id <= lastId; id += 1) {
    xref[id] = output.length;
    output += parts[id];
  }
  const startxref = output.length;
  const xrefTable = [`xref\n0 ${lastId + 1}\n0000000000 65535 f \n`];
  for (let id = 1; id <= lastId; id += 1) xrefTable.push(`${String(xref[id]).padStart(10, "0")} 00000 n \n`);
  output += `${xrefTable.join("")}trailer\n<< /Size ${lastId + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  return new Blob([output], { type: "application/pdf" });
}

export const ATTENDANCE_PDF_DOWNLOAD_EVENT = "learnease:attendance-pdf-download";
export const ATTENDANCE_PDF_REDOWNLOAD_EVENT = "learnease:attendance-pdf-redownload";
export const ATTENDANCE_PDF_DOWNLOAD_ERROR_EVENT = "learnease:attendance-pdf-download-error";
const downloadedAttendancePdfsKey = "learnease:downloaded-attendance-pdfs";
const activeAttendancePdfDownloads = new Set<string>();

export type AttendancePdfDownloadInput = {
  filename: string;
  text: string;
};

function readDownloadedAttendancePdfs() {
  const stored = localStorage.getItem(downloadedAttendancePdfsKey);
  if (!stored) return new Set<string>();
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every((filename) => typeof filename === "string")) {
    throw new Error("Saved attendance PDF download history is invalid.");
  }
  return new Set(parsed);
}

export function downloadTextPdf(filename: string, text: string, allowRepeat = false) {
  const safeFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  if (activeAttendancePdfDownloads.has(safeFilename)) return;
  activeAttendancePdfDownloads.add(safeFilename);
  try {
    const downloaded = readDownloadedAttendancePdfs();
    if (downloaded.has(safeFilename) && !allowRepeat) {
      window.dispatchEvent(new CustomEvent<AttendancePdfDownloadInput>(ATTENDANCE_PDF_REDOWNLOAD_EVENT, {
        detail: { filename: safeFilename, text },
      }));
      return;
    }

    const blob = textPdfBlob(text);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeFilename;
    downloaded.add(safeFilename);
    localStorage.setItem(downloadedAttendancePdfsKey, JSON.stringify([...downloaded]));
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.dispatchEvent(new Event(ATTENDANCE_PDF_DOWNLOAD_EVENT));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attendance PDF download failed.";
    window.dispatchEvent(new CustomEvent<string>(ATTENDANCE_PDF_DOWNLOAD_ERROR_EVENT, { detail: message }));
  } finally {
    activeAttendancePdfDownloads.delete(safeFilename);
  }
}

export function pdfObjectUrl(text: string) {
  return URL.createObjectURL(textPdfBlob(text));
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
