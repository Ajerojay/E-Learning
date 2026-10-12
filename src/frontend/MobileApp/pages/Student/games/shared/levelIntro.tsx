import { useCallback, useEffect, useRef, useState } from "react";
import { GameOverlay } from "./GamePopup";
import { cancelNativeSpeech, estimateSpeechMs, speakKidPrompt } from "../../../../nativeTts";

/** Minimum time the instruction overlay stays up (ms), including when sound is muted. */
export const LEVEL_INTRO_MIN_DISPLAY_MS = 2200;


export type LevelIntroContent = {
  title: string;
  subtitle: string;
  speech: string;
  /** Optional exact overlay duration for games that require fixed timing. */
  displayMs?: number;
  /** Shorter pause before 3-2-1. Use on the extra Colors mini-games. */
  compact?: boolean;
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
export function getIntroMinDisplayMs(text: string, compact = false): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (compact) {
    return Math.max(1400, Math.min(3200, 700 + words * 90));
  }
  const fromText = 1100 + words * 90;
  return Math.max(1600, Math.min(3600, fromText));
}

const INTRO_SPEECH_RATE = 0.88;

/**
 * Speaks child-friendly instructions, keeps the intro up until the speech has
 * really finished and the minimum read time has passed, then calls onDone
 * (countdown must start only here).
 */
export function speakKidLevelIntro(
  text: string,
  soundEnabled: boolean,
  onDone: () => void,
  fixedDisplayMs?: number,
  compact = false
): () => void {
  let cancelled = false;
  let finishedCleanly = false;
  let speechDone = !soundEnabled;
  // With sound on, the spoken instruction sets the pace; the read time only applies when muted.
  let minDisplayDone = soundEnabled;
  let minTimer: number | null = null;
  let safetyTimer: number | null = null;

  const minDisplayMs = fixedDisplayMs ?? getIntroMinDisplayMs(text, compact);
  // Only for a speech engine that never reports the end; long enough for a full instruction.
  const safetyMs = Math.max(9000, estimateSpeechMs(text, INTRO_SPEECH_RATE) * 3 + 4000);

  const tryComplete = () => {
    if (cancelled || finishedCleanly) return;
    if (!minDisplayDone || !speechDone) return;
    finishedCleanly = true;
    onDone();
  };

  const cleanup = () => {
    cancelled = true;
    if (minTimer !== null) window.clearTimeout(minTimer);
    if (safetyTimer !== null) window.clearTimeout(safetyTimer);
    minTimer = null;
    safetyTimer = null;
    if (!finishedCleanly) {
      cancelNativeSpeech();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    }
  };

  if (!minDisplayDone) {
    minTimer = window.setTimeout(() => {
      minDisplayDone = true;
      tryComplete();
    }, minDisplayMs);
  }

  safetyTimer = window.setTimeout(() => {
    speechDone = true;
    minDisplayDone = true;
    tryComplete();
  }, safetyMs);

  if (soundEnabled) {
    speakKidPrompt(text, {
      interrupt: true,
      rate: INTRO_SPEECH_RATE,
      pitch: 1.3,
      onEnd: () => {
        if (cancelled) return;
        speechDone = true;
        tryComplete();
      },
    });
  }

  return cleanup;
}

/**
 * Instruction overlay + voice once per play session (before level 1).
 * Later levels use startCountdownOnly() — no instruction prompt.
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
  /** Increment on "Play again" / new game — replays the instruction intro. */
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
    cancelNativeSpeech();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setLevelIntroActive(false);
    setIntroFinished(true);
    onStartCountdownRef.current();
  }, []);

  /** Call when a level begins: intro on first session level only, else 3-2-1. */
  const onLevelStart = useCallback(() => {
    if (introFinished) startCountdownOnly();
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
      content.displayMs,
      content.compact
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
    content.compact,
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

