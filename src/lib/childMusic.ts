import { useEffect, useState } from "react";
import bgMusic from "../MobileApp/pages/Student/bg-music-loop.mp3";

const STORAGE_KEY = "childMusicEnabled";
export const CHILD_MUSIC_EVENT = "learnease:child-music";

let audio: HTMLAudioElement | null = null;
let routeAllowed = false;
let holdCount = 0;

function getAudio() {
  if (!audio) {
    audio = new Audio(bgMusic);
    audio.loop = true;
    audio.volume = 0.28;
  }
  return audio;
}

export function isChildMusicEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function syncChildMusic() {
  const next = getAudio();
  if (routeAllowed && isChildMusicEnabled() && holdCount <= 0) {
    void next.play().catch(() => {});
    return;
  }
  next.pause();
}

export function setChildMusicEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new Event(CHILD_MUSIC_EVENT));
  syncChildMusic();
}

export function setChildMusicRouteAllowed(allowed: boolean) {
  routeAllowed = allowed;
  syncChildMusic();
}

export function holdChildMusic() {
  holdCount += 1;
  syncChildMusic();
}

export function releaseChildMusic() {
  holdCount = Math.max(0, holdCount - 1);
  syncChildMusic();
}

export function resetChildMusicHolds() {
  holdCount = 0;
}

export function useChildMusicEnabled() {
  const [enabled, setEnabled] = useState(isChildMusicEnabled);
  useEffect(() => {
    const sync = () => setEnabled(isChildMusicEnabled());
    window.addEventListener(CHILD_MUSIC_EVENT, sync);
    return () => window.removeEventListener(CHILD_MUSIC_EVENT, sync);
  }, []);
  return [enabled, setChildMusicEnabled] as const;
}
