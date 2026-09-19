type AndroidTtsBridge = {
  speak: (text: string, rate: number, pitch: number, interrupt: boolean) => void;
  cancel: () => void;
  isReady: () => boolean;
};

declare global {
  interface Window { AndroidTts?: AndroidTtsBridge; }
}

let speechMutedUntil = 0;

const isSpeechMuted = () => Date.now() < speechMutedUntil;

/** Stop talking and ignore new prompts until `ms` have passed. */
export function muteKidSpeech(ms: number) {
  speechMutedUntil = Math.max(speechMutedUntil, Date.now() + Math.max(0, ms));
  cancelNativeSpeech();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function unmuteKidSpeech() {
  speechMutedUntil = 0;
}

/** Uses Android's native TTS in Capacitor; returns false on the website. */
export function speakNative(
  text: string,
  options: { interrupt?: boolean; rate?: number; pitch?: number; force?: boolean } = {}
) {
  if (!text || !window.AndroidTts) return false;
  if (isSpeechMuted() && !options.force) return true;
  window.AndroidTts.speak(text, options.rate ?? 1, options.pitch ?? 1.25, options.interrupt ?? false);
  return true;
}

export function cancelNativeSpeech() {
  window.AndroidTts?.cancel();
}

function pickKidVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find((voice) => /en(-|_)us|english/i.test(voice.lang) && /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(voice.name)) ||
    voices.find((voice) => /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(voice.name)) ||
    voices.find((voice) => /en/i.test(voice.lang)) ||
    voices[0]
  );
}

/** Kid-friendly voice for Android TTS or the browser. */
export function speakKidPrompt(
  text: string,
  options: { interrupt?: boolean; rate?: number; pitch?: number; onEnd?: () => void; force?: boolean } = {}
) {
  if (!text.trim()) return;
  if (isSpeechMuted() && !options.force) return;
  if (options.interrupt !== false) {
    cancelNativeSpeech();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }
  if (speakNative(text, { interrupt: options.interrupt !== false, rate: options.rate ?? 0.95, pitch: options.pitch ?? 1.3, force: options.force })) {
    window.setTimeout(() => options.onEnd?.(), 4200);
    return;
  }
  if (!("speechSynthesis" in window)) return;

  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickKidVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = options.rate ?? 0.95;
    utterance.pitch = options.pitch ?? 1.25;
    utterance.onend = () => options.onEnd?.();
    window.speechSynthesis.speak(utterance);
  };

  if (pickKidVoice()) {
    speak();
    return;
  }
  const onVoices = () => {
    window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
    speak();
  };
  window.speechSynthesis.addEventListener("voiceschanged", onVoices);
  void window.speechSynthesis.getVoices();
  window.setTimeout(speak, 250);
}
