import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Printer, X } from "lucide-react";
import {
  buildClassMonth,
  buildStudentMonth,
  currentMonth,
  downloadClassMonth,
  downloadStudentMonth,
  isAfterCurrentMonth,
  monthCounts,
  monthTitle,
  printAttendanceSheet,
  shiftMonth,
  statusLetter,
  type ClassMonthRow,
  type LearnerRef,
  type MonthPoint,
} from "./attendanceRecords";

export type ReportTeacher = {
  name: string;
  role: string;
  section: string;
};

function MonthSwitcher({ month, onChange }: { month: MonthPoint; onChange: (month: MonthPoint) => void }) {
  const next = shiftMonth(month, 1);
  return (
    <div className="ta-calendar-nav ta-no-print">
      <button type="button" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft /></button>
      <b>{monthTitle(month)}</b>
      <button type="button" disabled={isAfterCurrentMonth(next)} onClick={() => onChange(next)} aria-label="Next month"><ChevronRight /></button>
    </div>
  );
}

function PreparedBy({ teacher }: { teacher: ReportTeacher }) {
  return (
    <div className="ta-print-teacher">
      <span>Prepared by</span>
      <b>{teacher.name}</b>
      <small>{teacher.role}{teacher.section ? ` · ${teacher.section}` : ""}</small>
    </div>
  );
}

function ClassPrintSlice({ rows, month, from, to, totals }: { rows: ClassMonthRow[]; month: MonthPoint; from: number; to: number; totals?: boolean }) {
  const days = Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index + 1);
  return (
    <table className="ta-month-table ta-print-slice">
      <thead>
        <tr>
          <th>No.</th>
          <th className="name">Learner</th>
          {days.map(day => <th key={day}>{day}</th>)}
          {totals && <><th>P</th><th>L</th><th>A</th><th>E</th></>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.id}>
            <td>{index + 1}</td>
            <td className="name"><b>{row.name}</b><small>{row.section}</small></td>
            {row.marks.slice(from, to).map((status, offset) => {
              const day = from + offset + 1;
              const weekend = [0, 6].includes(new Date(month.year, month.month, day).getDay());
              return <td key={day} className={`${status ? status.toLowerCase() : "unmarked"}${weekend ? " weekend" : ""}`}>{statusLetter(status)}</td>;
            })}
            {totals && <><td>{row.present}</td><td>{row.late}</td><td>{row.absent}</td><td>{row.excused}</td></>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportActions({ onClose, onPrint, onDownload }: { onClose: () => void; onPrint: () => void; onDownload: () => void }) {
  return (
    <footer className="ta-report-actions ta-no-print">
      <button type="button" className="ta-secondary" onClick={onClose}>Close</button>
      <button type="button" className="ta-secondary" onClick={onDownload}><Download /> Download</button>
      <button type="button" className="ta-primary" onClick={onPrint}><Printer /> Print / Save PDF</button>
    </footer>
  );
}

export function ClassMonthReport({
  learners,
  initialMonth = currentMonth(),
  teacher,
  onClose,
  onDownloadLearner,
}: {
  learners: LearnerRef[];
  initialMonth?: MonthPoint;
  teacher: ReportTeacher;
  onClose: () => void;
  onDownloadLearner?: (learner: LearnerRef, month: MonthPoint) => void;
}) {
  const [month, setMonth] = useState(initialMonth);
  const rows = buildClassMonth(learners, month);
  const dayCount = rows[0]?.marks.length ?? new Date(month.year, month.month + 1, 0).getDate();
  const title = `LearnEase Class Attendance — ${monthTitle(month)}`;

  return (
    <div className="ta-overlay ta-print-overlay ta-month-overlay" onMouseDown={onClose}>
      <section className="ta-modal ta-print-report ta-month-report" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className="ta-close ta-no-print" onClick={onClose}><X /></button>
        <h2>Class Attendance Record</h2>
        <p className="ta-no-print">Every learner for {monthTitle(month)}. Download saves the same monthly table.</p>
        <p className="ta-print-only">{monthTitle(month)}</p>
        <MonthSwitcher month={month} onChange={setMonth} />
        <div className="ta-print-only ta-print-slices">
          <ClassPrintSlice rows={rows} month={month} from={0} to={Math.ceil(dayCount / 2)} />
          <ClassPrintSlice rows={rows} month={month} from={Math.ceil(dayCount / 2)} to={dayCount} totals />
        </div>
        <div className="ta-month-scroll ta-class-screen-table">
          <table className="ta-month-table">
            <thead>
              <tr>
                <th>No.</th>
                <th className="name">Learner</th>
                {Array.from({ length: dayCount }, (_, index) => <th key={index + 1}>{index + 1}</th>)}
                <th>P</th>
                <th>L</th>
                <th>A</th>
                <th>E</th>
                <th className="ta-no-print">Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td className="name"><b>{row.name}</b><small>{row.section}</small></td>
                  {row.marks.map((status, dayIndex) => {
                    const weekday = new Date(month.year, month.month, dayIndex + 1).getDay();
                    const weekend = weekday === 0 || weekday === 6;
                    return <td key={dayIndex} className={`${status ? status.toLowerCase() : "unmarked"}${weekend ? " weekend" : ""}`}>{statusLetter(status)}</td>;
                  })}
                  <td>{row.present}</td>
                  <td>{row.late}</td>
                  <td>{row.absent}</td>
                  <td>{row.excused}</td>
                  <td className="ta-no-print">
                    <button type="button" onClick={() => (onDownloadLearner ?? downloadStudentMonth)(row, month, teacher.name)}>Download</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ta-month-legend">P Present · L Late · A Absent · E Excused · — No record</p>
        <PreparedBy teacher={teacher} />
        <ReportActions
          onClose={onClose}
          onDownload={() => downloadClassMonth(learners, month, teacher.name)}
          onPrint={() => printAttendanceSheet(title)}
        />
      </section>
    </div>
  );
}

export function StudentMonthReport({
  learner,
  initialMonth = currentMonth(),
  teacher,
  onClose,
}: {
  learner: LearnerRef;
  initialMonth?: MonthPoint;
  teacher: ReportTeacher;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(initialMonth);
  const days = buildStudentMonth(learner.id, month);
  const counts = monthCounts(days);
  const title = `LearnEase — ${learner.name} Attendance — ${monthTitle(month)}`;

  return (
    <div className="ta-overlay ta-print-overlay ta-month-overlay" onMouseDown={onClose}>
      <section className="ta-modal ta-print-report ta-month-report ta-student-month-report" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className="ta-close ta-no-print" onClick={onClose}><X /></button>
        <h2>Learner Attendance Record</h2>
        <p>{learner.name} · {learner.section}</p>
        <MonthSwitcher month={month} onChange={setMonth} />
        <div className="ta-month-scroll">
          <table className="ta-month-table ta-student-month-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {days.map(day => (
                <tr key={day.key} className={day.weekend ? "weekend" : ""}>
                  <td className="name">{day.label}</td>
                  <td>{day.weekday}</td>
                  <td className={day.status ? day.status.toLowerCase() : "unmarked"}>{day.status || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="name">Month total</th>
                <td colSpan={2}>{counts.Present} Present · {counts.Late} Late · {counts.Absent} Absent · {counts.Excused} Excused</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <PreparedBy teacher={teacher} />
        <ReportActions
          onClose={onClose}
          onDownload={() => downloadStudentMonth(learner, month, teacher.name)}
          onPrint={() => printAttendanceSheet(title)}
        />
      </section>
    </div>
  );
}
