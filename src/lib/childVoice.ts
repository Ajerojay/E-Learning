import { useEffect, useState } from "react";
import { cancelNativeSpeech } from "../MobileApp/nativeTts";

const STORAGE_KEY = "childVoiceEnabled";
export const CHILD_VOICE_EVENT = "learnease:child-voice";

export function isChildVoiceEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setChildVoiceEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  if (!enabled) {
    cancelNativeSpeech();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }
  window.dispatchEvent(new Event(CHILD_VOICE_EVENT));
}

export function useChildVoiceEnabled() {
  const [enabled, setEnabled] = useState(isChildVoiceEnabled);
  useEffect(() => {
    const sync = () => setEnabled(isChildVoiceEnabled());
    window.addEventListener(CHILD_VOICE_EVENT, sync);
    return () => window.removeEventListener(CHILD_VOICE_EVENT, sync);
  }, []);
  return [enabled, setChildVoiceEnabled] as const;
}
