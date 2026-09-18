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
import ChildBackgroundMusic from "./MobileApp/pages/Student/ChildBackgroundMusic";
import AppSignIn from "./MobileApp/WebView/AppSignIn";
import AppSignUp from "./MobileApp/WebView/AppSignUp";
import AppStudentAccess from "./MobileApp/WebView/AppStudentAccess";
import AppStudentPage from "./MobileApp/WebView/AppStudentPage";
import AppLessonPage from "./MobileApp/WebView/AppLessonPage";
import LettersGameRouter from "./MobileApp/pages/Student/LettersGameRouter";
const AppColorsQuestPage = lazy(() => import("./MobileApp/WebView/AppColorsQuestPage"));
const ColorsGameRouter = lazy(() => import("./MobileApp/pages/Student/ColorsGameRouter"));
const AppPhonicsQuestPage = lazy(() => import("./MobileApp/WebView/AppPhonicsQuestPage"));
const PhonicsGameRouter = lazy(() => import("./MobileApp/pages/Student/PhonicsGameRouter"));
const AppLogicQuestPage = lazy(() => import("./MobileApp/WebView/AppLogicQuestPage"));
const LogicGameRouter = lazy(() => import("./MobileApp/pages/Student/LogicGameRouter"));
const AppNumbersQuestPage = lazy(() => import("./MobileApp/WebView/AppNumbersQuestPage"));
const NumbersGameRouter = lazy(() => import("./MobileApp/pages/Student/NumbersGameRouter"));
const AppLetterQuestPage = lazy(() => import("./MobileApp/WebView/AppLetterQuestPage"));
const AppShapesQuestPage = lazy(() => import("./MobileApp/WebView/AppShapesQuestPage"));
const ShapesGameRouter = lazy(() => import("./MobileApp/pages/Student/ShapesGameRouter"));
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
      <ChildBackgroundMusic />
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
        <Route path="/app/phonics-quest/:gameId" element={<StudentGameGuard category="phonics"><PhonicsGameRouter mobileApp /></StudentGameGuard>} />
        <Route path="/app/logic-quest" element={<StudentGameGuard category="logic"><AppLogicQuestPage /></StudentGameGuard>} />
        <Route path="/app/logic-quest/:gameId" element={<StudentGameGuard category="logic"><LogicGameRouter mobileApp /></StudentGameGuard>} />
        <Route path="/app/colors-quest" element={<StudentGameGuard category="colors"><AppColorsQuestPage /></StudentGameGuard>} />
        <Route path="/app/shapes-quest" element={<StudentGameGuard category="shapes"><AppShapesQuestPage /></StudentGameGuard>} />
        <Route path="/app/numbers-quest" element={<StudentGameGuard category="numbers"><AppNumbersQuestPage /></StudentGameGuard>} />
        <Route path="/app/numbers-quest/:gameId" element={<StudentGameGuard category="numbers"><NumbersGameRouter mobileApp /></StudentGameGuard>} />
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
        <Route path="/quest/colors/:gameId" element={<StudentGameGuard category="colors"><ColorsGameRouter mobileApp /></StudentGameGuard>} />
        <Route path="/quest/phonics" element={<StudentGameGuard category="phonics"><AppPhonicsQuestPage /></StudentGameGuard>} />
        <Route path="/quest/phonics/:gameId" element={<StudentGameGuard category="phonics"><PhonicsGameRouter mobileApp /></StudentGameGuard>} />
        <Route path="/student/PhonicsQuestPage" element={<Navigate to="/quest/phonics" replace />} />
        <Route path="/student/sound" element={<Navigate to="/quest/phonics/sound" replace />} />
        <Route path="/quest/logic" element={<StudentGameGuard category="logic"><AppLogicQuestPage /></StudentGameGuard>} />
        <Route path="/quest/logic/:gameId" element={<StudentGameGuard category="logic"><LogicGameRouter mobileApp /></StudentGameGuard>} />
        <Route path="/student/LogicQuestPage" element={<Navigate to="/quest/logic" replace />} />
        <Route path="/student/pattern" element={<Navigate to="/quest/logic/pattern" replace />} />
        <Route path="/quest/number" element={<StudentGameGuard category="numbers"><AppNumbersQuestPage /></StudentGameGuard>} />
        <Route path="/quest/number/:gameId" element={<StudentGameGuard category="numbers"><NumbersGameRouter mobileApp /></StudentGameGuard>} />
        <Route path="/quest/numbers" element={<Navigate to="/quest/number" replace />} />
        <Route path="/quest/numbers/:gameId" element={<StudentGameGuard category="numbers"><NumbersGameRouter mobileApp /></StudentGameGuard>} />
        <Route path="/quest/letter" element={<StudentGameGuard category="letters"><AppLetterQuestPage /></StudentGameGuard>} />
        <Route path="/quest/letter/:gameId" element={<StudentGameGuard category="letters"><LettersGameRouter mobileApp /></StudentGameGuard>} />
        <Route path="/quest/shapes" element={<StudentGameGuard category="shapes"><AppShapesQuestPage /></StudentGameGuard>} />
        <Route path="/quest/shapes/:gameId" element={<StudentGameGuard category="shapes"><ShapesGameRouter /></StudentGameGuard>} />

        {/* ⚠️ ALWAYS LAST */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
