import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import {
  holdChildMusic,
  releaseChildMusic,
  resetChildMusicHolds,
  setChildMusicRouteAllowed,
  syncChildMusic,
} from "../../../lib/childMusic";

function isChildMusicPath(pathname: string) {
  if (pathname === "/student-access") return false;
  return (
    pathname === "/student" ||
    pathname.startsWith("/lesson/") ||
    pathname.startsWith("/quest/") ||
    (pathname.startsWith("/app/") && pathname.includes("-quest"))
  );
}

export default function ChildBackgroundMusic() {
  const { pathname } = useLocation();

  useEffect(() => {
    resetChildMusicHolds();
    setChildMusicRouteAllowed(isChildMusicPath(pathname));
  }, [pathname]);

  useEffect(() => {
    const unlock = () => syncChildMusic();
    const pause = () => holdChildMusic();
    const resume = () => releaseChildMusic();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("learnease:pause-background-music", pause);
    window.addEventListener("learnease:resume-background-music", resume);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("learnease:pause-background-music", pause);
      window.removeEventListener("learnease:resume-background-music", resume);
      setChildMusicRouteAllowed(false);
    };
  }, []);

  return null;
}
