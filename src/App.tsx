import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import "./App.css";
import { getOrCreateActiveChildId, type SubjectKey } from "./lib/childProgress";
import { completePendingParentRegistration } from "./lib/supabaseAuth";
import { supabase } from "./lib/supabase";
import { syncOfflineProgress } from "./lib/gameProgressDb";
import { initializeOfflineSqlite } from "./lib/offlineSqlite";
import { isStudentGameAllowed } from "./lib/studentGameAccess";
import { isActivityOpen } from "./lib/activityConfig";
import { installMojibakeRepair } from "./MobileApp/repairMojibake";

/* MOBILE APP */
import MobileOrientationController from "./MobileApp/MobileOrientationController";
import AppSignIn from "./MobileApp/WebView/AppSignIn";
import AppSignUp from "./MobileApp/WebView/AppSignUp";
import AppStudentAccess from "./MobileApp/WebView/AppStudentAccess";
import AppStudentPage from "./MobileApp/WebView/AppStudentPage";
import AppLessonPage from "./MobileApp/WebView/AppLessonPage";
const AppColorsQuestPage = lazy(() => import("./MobileApp/WebView/AppColorsQuestPage"));
const AppPhonicsQuestPage = lazy(() => import("./MobileApp/WebView/AppPhonicsQuestPage"));
const AppLogicQuestPage = lazy(() => import("./MobileApp/WebView/AppLogicQuestPage"));
const AppNumbersQuestPage = lazy(() => import("./MobileApp/WebView/AppNumbersQuestPage"));
const AppLetterQuestPage = lazy(() => import("./MobileApp/WebView/AppLetterQuestPage"));
const AppShapesQuestPage = lazy(() => import("./MobileApp/WebView/AppShapesQuestPage"));
const AppParentDashboard = lazy(() => import("./MobileApp/WebView/AppParentDashboard"));
const AppParentChildren = lazy(() => import("./MobileApp/WebView/AppParentChildren"));
const AppParentProgress = lazy(() => import("./MobileApp/WebView/AppParentProgress"));
const AppTeacherDashboard = lazy(() => import("./MobileApp/WebView/AppTeacherDashboard"));

function StudentGameGuard({ category, children }: { category: SubjectKey; children: ReactNode }) {
  const cachedChildId = typeof localStorage === "undefined" ? null : localStorage.getItem("activeChildId");
  const [allowed, setAllowed] = useState<boolean>(() => (
    isActivityOpen(category) && (!cachedChildId || isStudentGameAllowed(cachedChildId, category))
  ));
  useEffect(() => {
    let active = true;
    void getOrCreateActiveChildId().then(childId => {
      if (!active) return;
      setAllowed(isActivityOpen(category) && (!childId || isStudentGameAllowed(childId, category)));
    }).catch(() => {
      if (active) setAllowed(isActivityOpen(category));
    });
    return () => { active = false; };
  }, [category]);
  return allowed ? <>{children}</> : <Navigate to="/student" replace state={{ blockedGame: category }} />;
}

function App() {
  useEffect(() => {
    const stopMojibakeRepair = installMojibakeRepair();
    void initializeOfflineSqlite().then(() => {
      if (navigator.onLine) void syncOfflineProgress();
    });
    const sync = () => { void syncOfflineProgress(); };
    window.addEventListener("online", sync);

    if (navigator.onLine) {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) void completePendingParentRegistration(data.session.user);
      });
    }
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user) {
        void completePendingParentRegistration(session.user);
      }
    });

    return () => {
      stopMojibakeRepair();
      window.removeEventListener("online", sync);
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <BrowserRouter>
      <MobileOrientationController />
      <Suspense fallback={<div className="app-route-loading">Loading…</div>}>
      <Routes>

        {/* DEFAULT */}
        <Route path="/" element={<AppSignIn />} />
        <Route path="/signup" element={<AppSignUp />} />

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
        <Route path="/parent-dashboard" element={<AppParentDashboard />} />
        <Route path="/parent-children" element={<AppParentChildren />} />
        <Route path="/parent-progress" element={<AppParentProgress />} />

        {/* TEACHER */}
        <Route path="/teacher-dashboard" element={<AppTeacherDashboard />} />

        {/* STUDENT */}
        <Route path="/student-access" element={<AppStudentAccess />} />
        <Route path="/student" element={<AppStudentPage />} />
        <Route path="/lesson/:category" element={<AppLessonPage />} />
        <Route path="/quest/colors" element={<StudentGameGuard category="colors"><AppColorsQuestPage /></StudentGameGuard>} />
        <Route path="/student/PhonicsQuestPage" element={<StudentGameGuard category="phonics"><AppPhonicsQuestPage /></StudentGameGuard>} />
        <Route path="/student/sound" element={<StudentGameGuard category="phonics"><AppPhonicsQuestPage /></StudentGameGuard>} />
        <Route path="/student/LogicQuestPage" element={<StudentGameGuard category="logic"><AppLogicQuestPage /></StudentGameGuard>} />
        <Route path="/student/pattern" element={<StudentGameGuard category="logic"><AppLogicQuestPage /></StudentGameGuard>} />
        <Route path="/quest/number" element={<StudentGameGuard category="numbers"><AppNumbersQuestPage /></StudentGameGuard>} />
        <Route path="/quest/numbers" element={<Navigate to="/quest/number" replace />} />
        <Route path="/quest/letter" element={<StudentGameGuard category="letters"><AppLetterQuestPage /></StudentGameGuard>} />
        <Route path="/quest/shapes" element={<StudentGameGuard category="shapes"><AppShapesQuestPage /></StudentGameGuard>} />

        {/* ⚠️ ALWAYS LAST */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
