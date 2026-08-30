import TeacherDashboard from "./pages/Teacher/TeacherDashboard";
import "./AppTeacherDashboard.css";

/** Mobile/tablet shell that keeps the web teacher dashboard untouched. */
export default function AppTeacherDashboard() {
  return (
    <div className="app-teacher-dashboard">
      <TeacherDashboard />
    </div>
  );
}

