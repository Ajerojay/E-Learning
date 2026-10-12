type AndroidTtsBridge = {
  speak: (text: string, rate: number, pitch: number, interrupt: boolean) => void;
  speakTracked?: (text: string, rate: number, pitch: number, interrupt: boolean, utteranceId: string) => void;
  cancel: () => void;
  isReady: () => boolean;
};

type AndroidTtsEventName = "start" | "done" | "error" | "stop";

declare global {
  interface Window {
    AndroidTts?: AndroidTtsBridge;
    __androidTtsEvent?: (utteranceId: string, event: string) => void;
  }
}

const androidTtsListeners = new Set<(utteranceId: string, event: AndroidTtsEventName) => void>();

function publishAndroidTtsEvent(utteranceId: string, event: string) {
  const name: AndroidTtsEventName =
    event === "start" || event === "done" || event === "error" || event === "stop" ? event : "done";
  androidTtsListeners.forEach((listener) => listener(utteranceId, name));
}

if (typeof window !== "undefined") {
  window.__androidTtsEvent = publishAndroidTtsEvent;
}

/** Hear when a tracked Android prompt starts or finishes. */
export function subscribeAndroidTts(
  listener: (utteranceId: string, event: AndroidTtsEventName) => void
) {
  androidTtsListeners.add(listener);
  return () => androidTtsListeners.delete(listener);
}

/** Speak on Android and report start/end for this utterance id. Returns false off Android. */
export function speakTrackedNative(
  text: string,
  utteranceId: string,
  options: { interrupt?: boolean; rate?: number; pitch?: number; force?: boolean } = {}
) {
  if (!text || typeof window.AndroidTts?.speakTracked !== "function") return false;
  if (isSpeechMuted() && !options.force) return true;
  window.AndroidTts.speakTracked(
    text,
    options.rate ?? 1,
    options.pitch ?? 1.25,
    options.interrupt ?? false,
    utteranceId
  );
  return true;
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

/** Rough speaking time, used only when the device cannot report the real end. */
export function estimateSpeechMs(text: string, rate = 0.95) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const pauses = (text.match(/[.?!]/g) || []).length;
  return Math.round(150 + (words * 280 + pauses * 120) / Math.max(0.5, rate));
}

let trackedSpeechSeq = 0;
/** When untracked Android speech is expected to go quiet; queued lines start then. */
let untrackedQueueFreeAt = 0;

type KidPromptOptions = {
  interrupt?: boolean;
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  force?: boolean;
};

/**
 * Kid-friendly voice for Android TTS or the browser. With `interrupt: false`
 * the line is queued and plays right after the current one, with no gap.
 * `onStart`/`onEnd` fire once, when that line really starts and finishes.
 */
export function speakKidPrompt(text: string, options: KidPromptOptions = {}) {
  let startedCb = false;
  const start = () => {
    if (startedCb) return;
    startedCb = true;
    options.onStart?.();
  };
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    start();
    options.onEnd?.();
  };
  if (!text.trim() || (isSpeechMuted() && !options.force)) {
    end();
    return;
  }
  const rate = options.rate ?? 0.95;
  const interrupt = options.interrupt !== false;
  if (interrupt) {
    cancelNativeSpeech();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  if (window.AndroidTts) {
    const nativeOptions = { interrupt, rate, pitch: options.pitch ?? 1.3, force: options.force };
    if (typeof window.AndroidTts.speakTracked === "function") {
      const utteranceId = `kid-${Date.now()}-${++trackedSpeechSeq}`;
      const fallback = window.setTimeout(() => finish(), estimateSpeechMs(text, rate) * 3 + 4000);
      const unsubscribe = subscribeAndroidTts((id, event) => {
        if (id !== utteranceId) return;
        if (event === "start") start();
        else finish();
      });
      const finish = () => {
        window.clearTimeout(fallback);
        unsubscribe();
        end();
      };
      speakTrackedNative(text, utteranceId, nativeOptions);
    } else {
      speakNative(text, nativeOptions);
      const now = Date.now();
      const startAt = interrupt ? now : Math.max(now, untrackedQueueFreeAt);
      const endAt = startAt + estimateSpeechMs(text, rate);
      untrackedQueueFreeAt = endAt;
      window.setTimeout(start, startAt - now);
      window.setTimeout(end, endAt - now);
    }
    return;
  }
  if (!("speechSynthesis" in window)) {
    end();
    return;
  }

  let started = false;
  const speak = () => {
    if (started) return;
    started = true;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickKidVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.pitch = options.pitch ?? 1.25;
    utterance.onstart = start;
    utterance.onend = end;
    utterance.onerror = end;
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

/** Same as speakKidPrompt, but resolves when the speech has finished. */
export function speakKidPromptAsync(
  text: string,
  options: { interrupt?: boolean; rate?: number; pitch?: number; force?: boolean } = {}
) {
  return new Promise<void>((resolve) => speakKidPrompt(text, { ...options, onEnd: resolve }));
}
