import { useCallback, useEffect, useRef, useState } from "react";
import { speakKidPrompt } from "../../nativeTts";
import {
  useLevelIntro,
  type LevelIntroContent,
} from "./levelIntro";
import { playKidBeep } from "./colorsMiniAudio";

export function useLandscapeLock(mobileApp: boolean) {
  const [isLandscape, setIsLandscape] = useState(
    () => !mobileApp || window.matchMedia("(orientation: landscape)").matches
  );
  useEffect(() => {
    if (!mobileApp) return;
    const orientation = window.matchMedia("(orientation: landscape)");
    const update = () => setIsLandscape(orientation.matches);
    update();
    orientation.addEventListener("change", update);
    window.addEventListener("orientationchange", update);
    return () => {
      orientation.removeEventListener("change", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [mobileApp]);
  return isLandscape;
}

export function useColorsMiniClock({
  intro,
  mapOpen,
  isLandscape,
  paused,
  blocked,
  timeLimit,
  levelIndex,
  soundEnabled,
}: {
  intro: LevelIntroContent;
  mapOpen: boolean;
  isLandscape: boolean;
  paused?: boolean;
  blocked: boolean;
  timeLimit: number;
  levelIndex: number;
  soundEnabled: boolean;
}) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const timeLeftRef = useRef(timeLimit);
  timeLeftRef.current = timeLeft;
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);
  const [awaitingGo, setAwaitingGo] = useState(false);
  const warnedSecondsRef = useRef<Set<number>>(new Set());
  const committedLevelRef = useRef(levelIndex);
  const levelChangedThisRender = committedLevelRef.current !== levelIndex;

  const startCountdown = useCallback(() => setCountdown(3), []);
  const introEnabled =
    isLandscape && !mapOpen && !blocked && !timeUpOpen && !paused;

  const { levelIntroActive, onLevelStart, startCountdownOnly, cancelIntro } = useLevelIntro({
    content: intro,
    soundEnabled,
    enabled: introEnabled,
    sessionKey: 0,
    onStartCountdown: startCountdown,
  });

  useEffect(() => {
    committedLevelRef.current = levelIndex;
  }, [levelIndex]);

  useEffect(() => {
    setTimeLeft(timeLimit);
    setTimerRunning(false);
    setAwaitingGo(false);
    setCountdown(null);
    setTimeUpOpen(false);
    warnedSecondsRef.current = new Set();
    if (!mapOpen) onLevelStart();
  }, [levelIndex, timeLimit, mapOpen, onLevelStart]);

  useEffect(() => {
    if (levelIntroActive) {
      setTimerRunning(false);
      setAwaitingGo(false);
    }
  }, [levelIntroActive]);

  useEffect(() => {
    if (!isLandscape || blocked || timeUpOpen || levelIntroActive || paused) return;
    if (countdown === null) return;
    setTimerRunning(false);
    if (countdown <= 0) {
      setCountdown(null);
      setAwaitingGo(true);
      if (soundEnabled) {
        speakKidPrompt("Go!", { interrupt: true });
        playKidBeep(0, true);
      }
      return;
    }
    if (soundEnabled) {
      speakKidPrompt(String(countdown), { interrupt: true });
      playKidBeep(countdown, true);
    }
    const t = window.setTimeout(() => setCountdown((p) => (p === null ? null : p - 1)), 850);
    return () => window.clearTimeout(t);
  }, [countdown, blocked, timeUpOpen, levelIntroActive, isLandscape, paused, soundEnabled]);

  useEffect(() => {
    if (!awaitingGo || blocked || timeUpOpen || levelIntroActive || paused || !isLandscape) return;
    const goDelay = soundEnabled ? 750 : 80;
    const t = window.setTimeout(() => {
      setAwaitingGo(false);
      setTimerRunning(true);
    }, goDelay);
    return () => window.clearTimeout(t);
  }, [awaitingGo, blocked, timeUpOpen, levelIntroActive, paused, isLandscape, soundEnabled]);

  useEffect(() => {
    if (!timerRunning || !isLandscape || paused) return;
    if (countdown !== null) return;
    if (timeUpOpen || blocked || levelIntroActive || awaitingGo) return;
    if (timeLeft <= 0) {
      setTimerRunning(false);
      setTimeUpOpen(true);
      if (soundEnabled) {
        speakKidPrompt("Time's up!", { interrupt: true });
        playKidBeep(0, true);
      }
      return;
    }
    const t = window.setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => window.clearTimeout(t);
  }, [
    timerRunning,
    countdown,
    timeLeft,
    timeUpOpen,
    blocked,
    isLandscape,
    paused,
    levelIntroActive,
    awaitingGo,
    soundEnabled,
  ]);

  useEffect(() => {
    if (!timerRunning || paused) return;
    if (countdown !== null) return;
    if (timeUpOpen || blocked) return;
    if (timeLeft > 5 || timeLeft <= 0) return;
    if (warnedSecondsRef.current.has(timeLeft)) return;
    warnedSecondsRef.current.add(timeLeft);
    if (soundEnabled) {
      speakKidPrompt(String(timeLeft), { interrupt: true });
      playKidBeep(timeLeft, true);
    }
  }, [timerRunning, countdown, timeLeft, timeUpOpen, blocked, paused, soundEnabled]);

  const replayLevel = useCallback(() => {
    cancelIntro();
    setTimeUpOpen(false);
    setTimeLeft(timeLimit);
    setTimerRunning(false);
    setAwaitingGo(false);
    setCountdown(null);
    warnedSecondsRef.current = new Set();
    window.setTimeout(() => startCountdownOnly(), 120);
  }, [cancelIntro, startCountdownOnly, timeLimit]);

  const playing =
    timerRunning &&
    !awaitingGo &&
    !levelChangedThisRender &&
    !paused &&
    !blocked &&
    !timeUpOpen &&
    !levelIntroActive &&
    countdown === null &&
    isLandscape &&
    !mapOpen;

  useEffect(() => {
    if (mapOpen || paused || blocked || timeUpOpen || !isLandscape) return;
    if (levelIntroActive || countdown !== null || awaitingGo || timerRunning) return;
    const t = window.setTimeout(() => setTimerRunning(true), 600);
    return () => window.clearTimeout(t);
  }, [
    mapOpen,
    paused,
    blocked,
    timeUpOpen,
    isLandscape,
    levelIntroActive,
    countdown,
    awaitingGo,
    timerRunning,
  ]);

  return {
    countdown,
    timeLeft,
    timeLeftRef,
    timeUpOpen,
    setTimeUpOpen,
    levelIntroActive,
    introEnabled,
    playing,
    replayLevel,
    startCountdownOnly,
  };
}
