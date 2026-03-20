import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import ParentLogin from "./Parent/ParentLogin";
import ParentDashboard from "./Parent/ParentDashboard";
import ParentSignup from "./Parent/SignUp";
import AdminPage from "./Admin/AdminPage";
import AdminStudents from "./Admin/AdminStudents";
import StudentAccess from "./Student/StudentAccess";
import StudentPage from "./Student/StudentPage";
import LessonPage from "./Student/LessonPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Login Page */}
        <Route path="/" element={<ParentLogin />} />

        {/* Signup Page */}
        <Route path="/signup" element={<ParentSignup />} />

        {/* Dashboard */}
        <Route path="/parent-dashboard" element={<ParentDashboard />} />

        {/* Admin Dashboard */}
        <Route path="/admin" element={<AdminPage />} />

        {/* Admin Student Management */}
        <Route path="/admin/students" element={<AdminStudents />} />

        {/* Student Access */}
        <Route path="/student-access" element={<StudentAccess />} />

        {/* Student Page */}
        <Route path="/student" element={<StudentPage />} />
        
        {/* Lesson Page */}
        <Route path="/lesson/:category" element={<LessonPage />} />

        {/* optional */}
        <Route path="/Parent" element={<ParentLogin />} />

        {/* redirect unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;