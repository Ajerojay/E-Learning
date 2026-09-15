import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isMobileApp } from "./isMobileApp";
import { supabase } from "../lib/supabase";

type AndroidOrientationBridge = {
  allowGameRotation: () => void;
  lockLandscape?: () => void;
  lockPortrait: () => void;
};

declare global {
  interface Window {
    AndroidOrientation?: AndroidOrientationBridge;
  }
}

const GAME_PATHS = new Set([
  "/app/phonics-quest",
  "/app/logic-quest",
  "/app/colors-quest",
  "/app/shapes-quest",
  "/app/numbers-quest",
  "/app/letters-quest",
  "/quest/colors",
  "/student/PhonicsQuestPage",
  "/student/sound",
  "/student/LogicQuestPage",
  "/student/pattern",
  "/quest/number",
  "/quest/numbers",
  "/quest/letter",
  "/quest/shapes",
]);

// Every child quest is landscape-only. Keeping this derived from GAME_PATHS
// also covers route aliases without accidentally leaving a portrait version.
const LANDSCAPE_ONLY_PATHS = new Set(GAME_PATHS);

/** Android app only: games may rotate; every other app page stays portrait. */
export default function MobileOrientationController() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isMobileApp()) return;
    const isStudentPage = pathname === "/student" || pathname === "/student-access" || pathname.startsWith("/lesson/") || GAME_PATHS.has(pathname);
    if (!isStudentPage) return;
    const childId = localStorage.getItem("activeChildId");
    if (!childId) return;
    if (!navigator.onLine) return;
    const touchPresence = () => {
      if (!navigator.onLine) return;
      void supabase.from("children_accounts").update({ last_active_at: new Date().toISOString() }).eq("id", childId).then(({ error }) => {
        if (error && !/last_active_at/i.test(error.message)) console.error("Student presence update:", error.message);
      });
    };
    touchPresence();
    const timer = window.setInterval(touchPresence, 60000);
    const onVisibility = () => { if (document.visibilityState === "visible") touchPresence(); };
    window.addEventListener("pagehide", touchPresence);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      touchPresence();
      window.clearInterval(timer);
      window.removeEventListener("pagehide", touchPresence);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);

  useEffect(() => {
    if (!isMobileApp()) return;

    const applyOrientation = () => {
      if (LANDSCAPE_ONLY_PATHS.has(pathname)) {
        window.AndroidOrientation?.lockLandscape?.();
      } else if (pathname.startsWith("/lesson/")) {
        // Lesson videos can go fullscreen and follow the device if auto-rotate is on.
        window.AndroidOrientation?.allowGameRotation();
      } else if (GAME_PATHS.has(pathname)) {
        window.AndroidOrientation?.allowGameRotation();
      } else {
        window.AndroidOrientation?.lockPortrait();
      }
    };

    applyOrientation();
    const retry = window.setInterval(applyOrientation, 400);
    const stop = window.setTimeout(() => window.clearInterval(retry), 2500);
    return () => {
      window.clearInterval(retry);
      window.clearTimeout(stop);
    };
  }, [pathname]);

  return null;
}
