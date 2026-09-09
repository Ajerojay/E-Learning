import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import "./App.css";
import { getOrCreateActiveChildId, type SubjectKey } from "./lib/childProgress";
import { isStudentGameAllowed } from "./lib/studentGameAccess";
import { isActivityOpen } from "./lib/activityConfig";

/* PARENT */
const ParentLogin = lazy(() => import("./Parent/ParentLogin"));
const ParentDashboard = lazy(() => import("./Parent/ParentDashboard"));
const ParentSignup = lazy(() => import("./Parent/SignUp"));
const ParentProgress = lazy(() => import("./Parent/ParentProgress"));
const ParentChildren = lazy(() => import("./Parent/ParentChildren"));

/* MOBILE APP */
import { isMobileApp } from "./MobileApp/isMobileApp";
import MobileOrientationController from "./MobileApp/MobileOrientationController";
const AppSignIn = lazy(() => import("./MobileApp/WebView/AppSignIn"));
const AppSignUp = lazy(() => import("./MobileApp/WebView/AppSignUp"));
const AppStudentAccess = lazy(() => import("./MobileApp/WebView/AppStudentAccess"));
const AppStudentPage = lazy(() => import("./MobileApp/WebView/AppStudentPage"));
const AppLessonPage = lazy(() => import("./MobileApp/WebView/AppLessonPage"));
const AppColorsQuestPage = lazy(() => import("./MobileApp/WebView/AppColorsQuestPage"));
const AppPhonicsQuestPage = lazy(() => import("./MobileApp/WebView/AppPhonicsQuestPage"));
const AppLogicQuestPage = lazy(() => import("./MobileApp/WebView/AppLogicQuestPage"));
const AppNumbersQuestPage = lazy(() => import("./MobileApp/WebView/AppNumbersQuestPage"));
const AppLetterQuestPage = lazy(() => import("./MobileApp/WebView/AppLetterQuestPage"));
const AppShapesQuestPage = lazy(() => import("./MobileApp/WebView/AppShapesQuestPage"));
const AppParentDashboard = lazy(() => import("./MobileApp/WebView/AppParentDashboard"));
const AppParentChildren = lazy(() => import("./MobileApp/WebView/AppParentChildren"));
const AppParentProgress = lazy(() => import("./MobileApp/WebView/AppParentProgress"));
const AppAdminPage = lazy(() => import("./MobileApp/WebView/AppAdminPage"));
const AppAdminStudents = lazy(() => import("./MobileApp/WebView/AppAdminStudents"));
const AppTeacherDashboard = lazy(() => import("./MobileApp/WebView/AppTeacherDashboard"));

/* ADMIN */
const AdminPage = lazy(() => import("./Admin/AdminPage"));
const AdminStudents = lazy(() => import("./Admin/AdminStudents"));

/* TEACHER */
const TeacherDashboard = lazy(() => import("./Teacher/TeacherDashboard"));

/* STUDENT */
const StudentAccess = lazy(() => import("./Student/StudentAccess"));
const StudentPage = lazy(() => import("./Student/StudentPage"));
const LessonPage = lazy(() => import("./Student/LessonPage"));
const ColorsQuestPage = lazy(() => import("./Student/ColorsQuestPage"));
const SoundGame = lazy(() => import("./Student/PhonicsQuestPage"));
const LogicGame = lazy(() => import("./Student/LogicQuestPage"));
const NumbersQuestPage = lazy(() => import("./Student/NumbersQuestPage"));
const LetterQuestPage = lazy(() => import("./Student/LetterQuestPage"));
const ShapesQuestPage = lazy(() => import("./Student/ShapesQuestPage"));

function StudentGameGuard({ category, children }: { category: SubjectKey; children: ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void getOrCreateActiveChildId().then(childId => {
      if (active) setAllowed(isActivityOpen(category) && (!childId || isStudentGameAllowed(childId, category)));
    });
    return () => { active = false; };
  }, [category]);
  if (allowed === null) return <div className="app-route-loading">Checking activity access…</div>;
  return allowed ? <>{children}</> : <Navigate to="/student" replace state={{ blockedGame: category }} />;
}

function App() {
  const mobileApp = isMobileApp();

  return (
    <BrowserRouter>
      <MobileOrientationController />
      <Suspense fallback={<div className="app-route-loading">Loading…</div>}>
      <Routes>

        {/* DEFAULT */}
        <Route path="/" element={mobileApp ? <AppSignIn /> : <ParentLogin />} />
        <Route path="/signup" element={mobileApp ? <AppSignUp /> : <ParentSignup />} />

        {/* MOBILE APP */}
        <Route path="/app" element={<Navigate to="/app/signin" replace />} />
        <Route path="/app/signin" element={<AppSignIn />} />
        <Route path="/app/signup" element={<AppSignUp />} />
        <Route path="/app/phonics-quest" element={<StudentGameGuard category="phonics"><AppPhonicsQuestPage /></StudentGameGuard>} />
        <Route path="/app/logic-quest" element={<StudentGameGuard category="logic"><AppLogicQuestPage /></StudentGameGuard>} />
        <Route path="/app/colors-quest" element={<StudentGameGuard category="colors"><AppColorsQuestPage /></StudentGameGuard>} />
        <Route path="/app/shapes-quest" element={<StudentGameGuard category="shapes"><AppShapesQuestPage /></StudentGameGuard>} />
        <Route path="/app/numbers-quest" element={<StudentGameGuard category="numbers"><AppNumbersQuestPage /></StudentGameGuard>} />
        <Route path="/app/letters-quest" element={<StudentGameGuard category="letters"><AppLetterQuestPage /></StudentGameGuard>} />
        
        {/* PARENT */}
        <Route path="/parent-dashboard" element={mobileApp ? <AppParentDashboard /> : <ParentDashboard />} />
        <Route path="/parent-children" element={mobileApp ? <AppParentChildren /> : <ParentChildren />} />
        <Route path="/parent-progress" element={mobileApp ? <AppParentProgress /> : <ParentProgress />} />

        {/* ADMIN */}
        <Route path="/admin" element={mobileApp ? <AppAdminPage /> : <AdminPage />} />
        <Route path="/admin/students" element={mobileApp ? <AppAdminStudents /> : <AdminStudents />} />

        {/* TEACHER */}
        <Route path="/teacher-dashboard" element={mobileApp ? <AppTeacherDashboard /> : <TeacherDashboard />} />

        {/* STUDENT */}
        <Route path="/student-access" element={mobileApp ? <AppStudentAccess /> : <StudentAccess />} />
        <Route path="/student" element={mobileApp ? <AppStudentPage /> : <StudentPage />} />
        <Route path="/lesson/:category" element={mobileApp ? <AppLessonPage /> : <LessonPage />} />
        <Route path="/quest/colors" element={<StudentGameGuard category="colors">{mobileApp ? <AppColorsQuestPage /> : <ColorsQuestPage />}</StudentGameGuard>} />
        <Route path="/student/PhonicsQuestPage" element={<StudentGameGuard category="phonics">{mobileApp ? <AppPhonicsQuestPage /> : <SoundGame />}</StudentGameGuard>} />
        <Route path="/student/sound" element={<StudentGameGuard category="phonics">{mobileApp ? <AppPhonicsQuestPage /> : <SoundGame />}</StudentGameGuard>} />
        <Route path="/student/LogicQuestPage" element={<StudentGameGuard category="logic">{mobileApp ? <AppLogicQuestPage /> : <LogicGame />}</StudentGameGuard>} />
        <Route path="/student/pattern" element={<StudentGameGuard category="logic">{mobileApp ? <AppLogicQuestPage /> : <LogicGame />}</StudentGameGuard>} />
        <Route path="/quest/number" element={<StudentGameGuard category="numbers">{mobileApp ? <AppNumbersQuestPage /> : <NumbersQuestPage />}</StudentGameGuard>} />
        <Route path="/quest/numbers" element={<Navigate to="/quest/number" replace />} />
        <Route path="/quest/letter" element={<StudentGameGuard category="letters">{mobileApp ? <AppLetterQuestPage /> : <LetterQuestPage />}</StudentGameGuard>} />
        <Route path="/quest/shapes" element={<StudentGameGuard category="shapes">{mobileApp ? <AppShapesQuestPage /> : <ShapesQuestPage />}</StudentGameGuard>} />

        {/* ⚠️ ALWAYS LAST */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
