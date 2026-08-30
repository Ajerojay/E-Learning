type AndroidTtsBridge = {
  speak: (text: string, rate: number, pitch: number, interrupt: boolean) => void;
  cancel: () => void;
  isReady: () => boolean;
};

declare global {
  interface Window { AndroidTts?: AndroidTtsBridge; }
}

/** Uses Android's native TTS in Capacitor; returns false on the website. */
export function speakNative(
  text: string,
  options: { interrupt?: boolean; rate?: number; pitch?: number } = {}
) {
  if (!text || !window.AndroidTts) return false;
  window.AndroidTts.speak(text, options.rate ?? 1, options.pitch ?? 1.25, options.interrupt ?? false);
  return true;
}

export function cancelNativeSpeech() {
  window.AndroidTts?.cancel();
}
