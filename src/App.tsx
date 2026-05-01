import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

/* PARENT */
import ParentLogin from "./Parent/ParentLogin";
import ParentDashboard from "./Parent/ParentDashboard";
import ParentSignup from "./Parent/SignUp";
import ParentProgress from "./Parent/ParentProgress";

/* ADMIN */
import AdminPage from "./Admin/AdminPage";
import AdminStudents from "./Admin/AdminStudents";

/* STUDENT */
import StudentAccess from "./Student/StudentAccess";
import StudentPage from "./Student/StudentPage";
import LessonPage from "./Student/LessonPage";
import ColorsQuestPage from "./Student/ColorsQuestPage";
<<<<<<< HEAD
import Level1Sound from "./Student/Level1Sound";
import Level2Pattern from "./Student/Level2Pattern";

=======
import RainGame from "./Student/RainGame";
>>>>>>> 6cb3cb2a442f231436c055bf569a45a3bf4d4f83

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* DEFAULT */}
        <Route path="/" element={<ParentLogin />} />
        <Route path="/signup" element={<ParentSignup />} />

        {/* PARENT */}
        <Route path="/parent-dashboard" element={<ParentDashboard />} />
        <Route path="/parent-progress" element={<ParentProgress />} />

        {/* ADMIN */}
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/students" element={<AdminStudents />} />

        {/* STUDENT */}
        <Route path="/student-access" element={<StudentAccess />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/lesson/:category" element={<LessonPage />} />
        <Route path="/quest/colors" element={<ColorsQuestPage />} />
<<<<<<< HEAD
        <Route path="/student/sound" element={<Level1Sound />} />
        <Route path="/student/pattern" element={<Level2Pattern />} />
=======

        {/* 🌧️ RAIN GAME */}
        <Route path="/rain-game" element={<RainGame />} />

        {/* ⚠️ ALWAYS LAST */}
        <Route path="*" element={<Navigate to="/" replace />} />

>>>>>>> 6cb3cb2a442f231436c055bf569a45a3bf4d4f83
      </Routes>
    </BrowserRouter>
  );  
}

export default App;