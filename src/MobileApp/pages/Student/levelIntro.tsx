import { useCallback, useEffect, useRef, useState } from "react";
import { GameOverlay } from "./GamePopup";
import { speakNative, cancelNativeSpeech } from "../../nativeTts";

/** Minimum time the instruction overlay stays up (ms), including when sound is muted. */
export const LEVEL_INTRO_MIN_DISPLAY_MS = 2200;

/** Brief pause after speech ends before the 3-2-1 countdown appears. */
const POST_INTRO_PAUSE_MS = 600;

/** Safety cap so a stuck voice engine cannot block the game forever. */
const INTRO_SAFETY_MAX_MS = 14000;

export type LevelIntroContent = {
  title: string;
  subtitle: string;
  speech: string;
  /** Optional exact overlay duration for games that require fixed timing. */
  displayMs?: number;
};

export function getKidFriendlyVoice(): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find(
      (v) =>
        /en(-|_)us|english/i.test(v.lang) &&
        /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(v.name)
    ) ??
    voices.find((v) =>
      /(female|girl|kid|child|aria|jenny|samantha|zira)/i.test(v.name)
    ) ??
    voices[0] ??
    null
  );
}

/** Estimate how long the instruction overlay should stay visible (reading + speech). */
export function getIntroMinDisplayMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const fromText = 1400 + words * 130;
  return Math.max(LEVEL_INTRO_MIN_DISPLAY_MS, Math.min(9000, fromText));
}

/**
 * Speaks child-friendly instructions, keeps the intro up until speech and
 * minimum read time are done, then calls onDone (countdown must start only here).
 */
export function speakKidLevelIntro(
  text: string,
  soundEnabled: boolean,
  onDone: () => void,
  fixedDisplayMs?: number
): () => void {
  let cancelled = false;
  let speechDone = !soundEnabled;
  let minDisplayDone = false;
  let pauseTimer: number | null = null;
  let minTimer: number | null = null;
  let safetyTimer: number | null = null;
  let utterance: SpeechSynthesisUtterance | null = null;

  const minDisplayMs = fixedDisplayMs ?? getIntroMinDisplayMs(text);

  const tryComplete = () => {
    if (cancelled || !minDisplayDone || (!fixedDisplayMs && !speechDone)) return;
    if (fixedDisplayMs) {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      onDone();
      return;
    }
    pauseTimer = window.setTimeout(() => {
      if (!cancelled) onDone();
    }, POST_INTRO_PAUSE_MS);
  };

  let voicesHandler: (() => void) | null = null;

  const cleanup = () => {
    cancelled = true;
    if (pauseTimer !== null) window.clearTimeout(pauseTimer);
    if (minTimer !== null) window.clearTimeout(minTimer);
    if (safetyTimer !== null) window.clearTimeout(safetyTimer);
    pauseTimer = null;
    minTimer = null;
    safetyTimer = null;
    if (voicesHandler) {
      window.speechSynthesis.removeEventListener("voiceschanged", voicesHandler);
      voicesHandler = null;
    }
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    cancelNativeSpeech();
  };

  minTimer = window.setTimeout(() => {
    minDisplayDone = true;
    tryComplete();
  }, minDisplayMs);

  safetyTimer = window.setTimeout(() => {
    speechDone = true;
    minDisplayDone = true;
    tryComplete();
  }, INTRO_SAFETY_MAX_MS);

  if (soundEnabled && speakNative(text, { interrupt: true, rate: 0.88, pitch: 1.3 })) {
    // The JavaScript bridge cannot report Android TTS's onDone event yet, so
    // use a conservative reading duration. The former short estimate closed
    // the intro and started 3-2-1 while Android was still speaking.
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    // Android's bridge has no onDone callback. At the child-friendly 0.88
    // speech rate, this conservative word-based window prevents 3-2-1 from
    // interrupting the final instruction words on slower phone TTS engines.
    const nativeSpeechWaitMs = Math.max(
      5200,
      Math.min(12000, 1600 + wordCount * 430)
    );
    window.setTimeout(() => { speechDone = true; tryComplete(); }, nativeSpeechWaitMs);
    return cleanup;
  }

  if (!soundEnabled || !("speechSynthesis" in window)) {
    return cleanup;
  }

  let speechStarted = false;

  const startSpeech = () => {
    if (cancelled || speechStarted) return;
    speechStarted = true;
    try {
      window.speechSynthesis.cancel();
      utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.88;
      utterance.pitch = 1.3;
      utterance.volume = 1;
      const voice = getKidFriendlyVoice();
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        if (cancelled) return;
        speechDone = true;
        tryComplete();
      };
      utterance.onerror = () => {
        if (cancelled) return;
        speechDone = true;
        tryComplete();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      speechDone = true;
      tryComplete();
    }
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    startSpeech();
  } else {
    voicesHandler = () => {
      if (voicesHandler) {
        window.speechSynthesis.removeEventListener("voiceschanged", voicesHandler);
        voicesHandler = null;
      }
      startSpeech();
    };
    window.speechSynthesis.addEventListener("voiceschanged", voicesHandler);
    window.setTimeout(() => startSpeech(), 500);
  }

  return cleanup;
}

/**
 * Instruction overlay + voice once per play session (before level 1).
 * Later levels use startCountdownOnly() â€” no instruction prompt.
 */
export function useLevelIntro({
  content,
  soundEnabled,
  enabled,
  sessionKey,
  onStartCountdown,
}: {
  content: LevelIntroContent;
  soundEnabled: boolean;
  enabled: boolean;
  /** Increment on "Play again" / new game â€” replays the instruction intro. */
  sessionKey: number;
  onStartCountdown: () => void;
}) {
  const [levelIntroActive, setLevelIntroActive] = useState(true);
  const [introFinished, setIntroFinished] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onStartCountdownRef = useRef(onStartCountdown);
  onStartCountdownRef.current = onStartCountdown;

  const startCountdownOnly = useCallback(() => {
    onStartCountdownRef.current();
  }, []);

  const beginCountdown = useCallback(() => {
    setLevelIntroActive(false);
    setIntroFinished(true);
    window.setTimeout(() => {
      onStartCountdownRef.current();
    }, 120);
  }, []);

  /** Call when a level begins: intro on first session level only, else 3-2-1. */
  const onLevelStart = useCallback(() => {
    if (introFinished) {
      startCountdownOnly();
    }
  }, [introFinished, startCountdownOnly]);

  useEffect(() => {
    setIntroFinished(false);
    setLevelIntroActive(true);
    cleanupRef.current?.();
    cleanupRef.current = null;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [sessionKey]);

  useEffect(() => {
    if (!levelIntroActive || !enabled || introFinished) return;

    cleanupRef.current?.();
    cleanupRef.current = speakKidLevelIntro(
      content.speech,
      soundEnabled,
      beginCountdown,
      content.displayMs
    );

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [
    levelIntroActive,
    enabled,
    introFinished,
    soundEnabled,
    content.speech,
    content.displayMs,
    beginCountdown,
  ]);

  const restartIntro = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIntroFinished(false);
    setLevelIntroActive(true);
  }, []);

  const cancelIntro = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setLevelIntroActive(false);
    setIntroFinished(true);
  }, []);

  return {
    levelIntroActive,
    introFinished,
    onLevelStart,
    startCountdownOnly,
    restartIntro,
    cancelIntro,
  };
}

export function LevelIntroOverlay({
  isOpen,
  content,
}: {
  isOpen: boolean;
  content: LevelIntroContent;
}) {
  if (!isOpen) return null;
  return (
    <GameOverlay isOpen={isOpen}>
      <div className="game-popup">
        <div className="game-popup-title">{content.title}</div>
        <div className="game-popup-subtitle">{content.subtitle}</div>
      </div>
    </GameOverlay>
  );
}

export const COUNTDOWN_READY_SUBTITLE = "Get ready to play!";

