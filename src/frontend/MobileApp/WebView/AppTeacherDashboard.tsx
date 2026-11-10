import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isMobileApp } from "../isMobileApp";
import TeacherApp from "../teacher/TeacherApp";
import "../teacher/TeacherApp.css";

function signedInTeacher() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.role === "teacher";
  } catch {
    return false;
  }
}

/** Shared teacher portal for the website and installed Android app. */
export default function AppTeacherDashboard() {
  const navigate = useNavigate();
  useEffect(() => {
    if (isMobileApp()) {
      if (signedInTeacher()) localStorage.removeItem("user");
      navigate("/teacher-login", { replace: true });
      return;
    }
    if (!signedInTeacher()) navigate("/teacher-login", { replace: true });
  }, [navigate]);
  if (isMobileApp() || !signedInTeacher()) return null;
  return <TeacherApp />;
}
