import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isMobileApp } from "./isMobileApp";

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

    if (LANDSCAPE_ONLY_PATHS.has(pathname)) {
      window.AndroidOrientation?.lockLandscape?.();
    } else if (GAME_PATHS.has(pathname)) {
      window.AndroidOrientation?.allowGameRotation();
    } else {
      // This also rotates the lesson page back to portrait after leaving a quest.
      window.AndroidOrientation?.lockPortrait();
    }
  }, [pathname]);

  return null;
}
