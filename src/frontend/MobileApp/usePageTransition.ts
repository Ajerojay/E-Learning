import { useEffect, useRef, useState } from "react";

export function usePageTransition(durationMs = 220) {
  const [loading, setLoading] = useState(false);
  const startTimer = useRef(0);
  const endTimer = useRef(0);

  useEffect(() => () => {
    window.clearTimeout(startTimer.current);
    window.clearTimeout(endTimer.current);
  }, []);

  const transitionTo = (action: () => void, force = false) => {
    window.clearTimeout(startTimer.current);
    window.clearTimeout(endTimer.current);
    setLoading(true);
    startTimer.current = window.setTimeout(() => {
      action();
      window.scrollTo({ top: 0, behavior: "auto" });
      endTimer.current = window.setTimeout(() => setLoading(false), force ? durationMs : Math.max(80, durationMs - 80));
    }, 40);
  };

  return { loading, transitionTo };
}
