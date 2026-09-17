import { supabase } from "./supabase";

export type AttendanceStatus = "Present" | "Late" | "Absent" | "Excused";

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cacheAttendance(childId: string, date: string, status: AttendanceStatus) {
  let history: Record<string, Record<string, AttendanceStatus>> = {};
  try { history = JSON.parse(localStorage.getItem("learnease.attendanceHistory") || "{}"); } catch { /* reset invalid cache */ }
  history[childId] = { ...(history[childId] || {}), [date]: status };
  localStorage.setItem("learnease.attendanceHistory", JSON.stringify(history));
}

export async function recordChildLoginAttendance(childId: string) {
  const attendanceDate = localDateKey();
  cacheAttendance(childId, attendanceDate, "Present");
  if (!navigator.onLine) return;
  const { error } = await supabase.from("child_attendance").upsert({
    child_id: childId,
    attendance_date: attendanceDate,
    status: "Present",
    source: "pin_login",
  }, { onConflict: "child_id,attendance_date" });
  if (error) console.error("PIN attendance record error:", error.message);
}

export async function getAttendanceRecords(childIds: string[]) {
  if (!navigator.onLine || !childIds.length) return [] as Array<{ child_id: string; attendance_date: string; status: AttendanceStatus }>;
  const { data, error } = await supabase.from("child_attendance").select("child_id,attendance_date,status").in("child_id", childIds);
  if (error) {
    console.error("Attendance history lookup error:", error.message);
    return [];
  }
  return (data || []) as Array<{ child_id: string; attendance_date: string; status: AttendanceStatus }>;
}

export async function saveAttendanceRecords(records: Array<{ childId: string; date: string; status: AttendanceStatus }>) {
  records.forEach(record => cacheAttendance(record.childId, record.date, record.status));
  if (!navigator.onLine || !records.length) return;
  const { error } = await supabase.from("child_attendance").upsert(records.map(record => ({
    child_id: record.childId,
    attendance_date: record.date,
    status: record.status,
    source: "teacher",
  })), { onConflict: "child_id,attendance_date" });
  if (error) throw error;
}
