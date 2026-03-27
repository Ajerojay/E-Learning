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
        <Route path="/" element={<ParentLogin />} />
        <Route path="/signup" element={<ParentSignup />} />
        <Route path="/parent-dashboard" element={<ParentDashboard />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/students" element={<AdminStudents />} />
        <Route path="/student-access" element={<StudentAccess />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/lesson/:category" element={<LessonPage />} />
        <Route path="/Parent" element={<ParentLogin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;