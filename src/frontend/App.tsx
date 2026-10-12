import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import "./App.css";
import { getOrCreateActiveChildId, type SubjectKey } from "../backend/childProgress";
import { completePendingParentRegistration, EMAIL_VERIFIED_PATH, openEmailLinkSession, RESET_PASSWORD_PATH } from "../backend/supabaseAuth";
import { pendingEmailLink, supabase } from "../backend/supabase";
import { syncOfflineProgress } from "../backend/gameProgressDb";
import { syncLocalQuestStars } from "../backend/questLevelResults";
import { pullSharedClassSettings, syncQueuedClassSettings } from "../backend/classSettings";
import { initializeOfflineSqlite } from "../backend/offlineSqlite";
import { isMobileApp } from "./MobileApp/isMobileApp";
import { isStudentGameAllowed } from "../backend/studentGameAccess";
import { isActivityOpen } from "../backend/activityConfig";
import { installMojibakeRepair } from "./MobileApp/repairMojibake";
import BearLoading from "./MobileApp/BearLoading";
import GameCertificateHost from "./MobileApp/pages/Student/GameCertificateHost";
import CertificateDownloadNotice from "./MobileApp/pages/Student/CertificateDownloadNotice";

/* MOBILE APP */
import MobileOrientationController from "./MobileApp/MobileOrientationController";
import ChildBackgroundMusic from "./MobileApp/pages/Student/ChildBackgroundMusic";
import AppSignIn from "./MobileApp/WebView/AppSignIn";
import AppSignUp from "./MobileApp/WebView/AppSignUp";
import AppResetPassword from "./MobileApp/WebView/AppResetPassword";
import AppEmailVerified from "./MobileApp/WebView/AppEmailVerified";
import AppStudentAccess from "./MobileApp/WebView/AppStudentAccess";
const AppStudentPage = lazy(() => import("./MobileApp/WebView/AppStudentPage"));
const PickAvatar = lazy(() => import("./MobileApp/pages/Student/PickAvatar"));
const AppLessonPage = lazy(() => import("./MobileApp/WebView/AppLessonPage"));
const LettersGameRouter = lazy(() => import("./MobileApp/pages/Student/games/letters/LettersGameRouter"));
const AppColorsQuestPage = lazy(() => import("./MobileApp/WebView/AppColorsQuestPage"));
const ColorsGameRouter = lazy(() => import("./MobileApp/pages/Student/games/colors/ColorsGameRouter"));
const AppPhonicsQuestPage = lazy(() => import("./MobileApp/WebView/AppPhonicsQuestPage"));
const PhonicsGameRouter = lazy(() => import("./MobileApp/pages/Student/games/phonics/PhonicsGameRouter"));
const AppLogicQuestPage = lazy(() => import("./MobileApp/WebView/AppLogicQuestPage"));
const LogicGameRouter = lazy(() => import("./MobileApp/pages/Student/games/logic/LogicGameRouter"));
const AppNumbersQuestPage = lazy(() => import("./MobileApp/WebView/AppNumbersQuestPage"));
const NumbersGameRouter = lazy(() => import("./MobileApp/pages/Student/games/numbers/NumbersGameRouter"));
const AppLetterQuestPage = lazy(() => import("./MobileApp/WebView/AppLetterQuestPage"));
const AppShapesQuestPage = lazy(() => import("./MobileApp/WebView/AppShapesQuestPage"));
const ShapesGameRouter = lazy(() => import("./MobileApp/pages/Student/games/shapes/ShapesGameRouter"));
const AppParentDashboard = lazy(() => import("./MobileApp/WebView/AppParentDashboard"));
const AppParentChildren = lazy(() => import("./MobileApp/WebView/AppParentChildren"));
const AppParentProgress = lazy(() => import("./MobileApp/WebView/AppParentProgress"));
const AppTeacherDashboard = lazy(() => import("./MobileApp/WebView/AppTeacherDashboard"));

function StudentGameGuard({ category, children }: { category: SubjectKey; children: ReactNode }) {
  const cachedChildId = typeof localStorage === "undefined" ? null : localStorage.getItem("activeChildId");
  const [allowed, setAllowed] = useState<boolean | null>(() => (
    cachedChildId ? (isActivityOpen(category) && isStudentGameAllowed(cachedChildId, category)) : null
  ));
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getOrCreateActiveChildId().then(childId => {
        if (!active) return;
        setAllowed(isActivityOpen(category) && (!childId || isStudentGameAllowed(childId, category)));
      }).catch(() => {
        if (active) setAllowed(isActivityOpen(category));
      });
    };
    refresh();
    window.addEventListener("learnease-activity-config-change", refresh);
    window.addEventListener("learnease-game-access-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("learnease-activity-config-change", refresh);
      window.removeEventListener("learnease-game-access-change", refresh);
    };
  }, [category]);
  if (allowed === null) return <BearLoading />;
  return allowed ? <>{children}</> : <Navigate to="/student" replace state={{ blockedGame: category }} />;
}

function AuthEmailRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const type = pendingEmailLink.type;
    const kind = type === "recovery" ? "recovery" : type === "signup" || type === "email" ? "signup" : "";
    if (!kind) return;
    const pathname = kind === "recovery" ? RESET_PASSWORD_PATH : EMAIL_VERIFIED_PATH;
    if (window.location.pathname === pathname || window.location.pathname === `/app${pathname}`) return;
    let active = true;
    void openEmailLinkSession(kind).finally(() => {
      if (active) navigate(pathname, { replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);
  return null;
}

function AppDeepLinkListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const open = () => {
      const deepLink = (window as Window & { AndroidDeepLink?: { consume: () => string } }).AndroidDeepLink;
      const path = deepLink?.consume?.() || "";
      if (path.startsWith("/") && !path.startsWith("//")) navigate(path, { replace: true });
    };
    open();
    window.addEventListener("learnease-deeplink", open);
    return () => window.removeEventListener("learnease-deeplink", open);
  }, [navigate]);
  return null;
}

function TeacherWebOnly() {
  if (isMobileApp()) return <Navigate to="/" replace />;
  return <AppTeacherDashboard />;
}

function App() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const stopMojibakeRepair = installMojibakeRepair();
    let finished = false;
    const splashStarted = Date.now();
    const splashMs = 900;
    let splashTimer = 0;
    const markReady = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(splashTimer);
      setAppReady(true);
    };
    const failSafe = window.setTimeout(markReady, 8000);
    const syncShared = async () => {
      if (!navigator.onLine) return;
      if (!isMobileApp()) await syncQueuedClassSettings();
      await pullSharedClassSettings();
    };
    const sync = () => {
      if (!navigator.onLine) return;
      void syncOfflineProgress();
      const childId = localStorage.getItem("activeChildId");
      if (childId) void syncLocalQuestStars(childId);
      void syncShared();
    };
    void initializeOfflineSqlite()
      .then(async () => {
        sync();
      })
      .finally(() => {
        const wait = Math.max(0, splashMs - (Date.now() - splashStarted));
        splashTimer = window.setTimeout(markReady, wait);
      });
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);

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
      window.clearTimeout(failSafe);
      window.clearTimeout(splashTimer);
      stopMojibakeRepair();
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", sync);
      authListener.subscription.unsubscribe();
    };
  }, []);

  useLayoutEffect(() => {
    if (appReady) return;
    const hideNativeSplash = () => {
      const splash = (window as Window & { AndroidSplash?: { hide: () => void } }).AndroidSplash;
      if (!splash?.hide) return false;
      splash.hide();
      return true;
    };
    if (hideNativeSplash()) return;
    const timer = window.setInterval(() => {
      if (hideNativeSplash()) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [appReady]);

  return (
    <BrowserRouter>
      <MobileOrientationController />
      {!appReady ? (
        <BearLoading />
      ) : (
        <>
          <ChildBackgroundMusic />
          <GameCertificateHost />
          <CertificateDownloadNotice />
          <AuthEmailRedirect />
          <AppDeepLinkListener />
          <Suspense fallback={<BearLoading />}>
      <Routes>

        {/* DEFAULT */}
        <Route path="/" element={<AppSignIn />} />
        <Route path="/signup" element={<AppSignUp />} />
        <Route path="/reset-password" element={<AppResetPassword />} />
        <Route path="/email-verified" element={<AppEmailVerified />} />

        {/* MOBILE APP */}
        <Route path="/app" element={<Navigate to="/app/signin" replace />} />
        <Route path="/app/signin" element={<AppSignIn />} />
        <Route path="/app/signup" element={<AppSignUp />} />
        <Route path="/app/reset-password" element={<AppResetPassword />} />
        <Route path="/app/email-verified" element={<AppEmailVerified />} />
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
        <Route path="/teacher-dashboard" element={<TeacherWebOnly />} />

        {/* STUDENT */}
        <Route path="/student-access" element={<AppStudentAccess />} />
        <Route path="/student/pick-avatar" element={<PickAvatar />} />
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
        </>
      )}
    </BrowserRouter>
  );
}

export default App;
