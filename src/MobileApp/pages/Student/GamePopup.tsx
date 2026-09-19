import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Map, Pause, Play } from "lucide-react";
import { muteKidSpeech, speakKidPrompt, unmuteKidSpeech } from "../../nativeTts";
import LevelCelebrate, { LEVEL_CELEBRATE_STAR_POP_MS } from "./LevelCelebrate";
import { livePlayStars } from "./questLevelMap";
import "./GamePopup.css";

type GamePopupVariant = "primary" | "secondary" | "yes" | "no";

type GamePopupButton = {
  label: React.ReactNode;
  speak?: string;
  onClick: () => void;
  variant?: GamePopupVariant;
};

interface GamePopupProps {
  isOpen: boolean;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  buttons?: GamePopupButton[];
  /** Live stars from this play. Pass with timeLeft/wrong, or a ready star count. */
  stars?: number;
  timeLeft?: number;
  wrong?: number;
}

export interface GameConfirmPopupProps {
  isOpen: boolean;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  yesLabel?: string;
  noLabel?: string;
  onYes: () => void;
  onNo: () => void;
}

const stripEmoji = (text: string) =>
  text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{200D}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const stripStats = (text: string) =>
  text
    .replace(/\bProgress:\s*\d+\/\d+\s*(\|\s*)?/gi, "")
    .replace(/\bWrong Attempts:\s*\d+\s*(\|\s*)?/gi, "")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getText = (node?: React.ReactNode, skipStats = false) => {
  if (node == null) return "";
  const children = React.Children.toArray(node);
  return children
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        const raw = stripEmoji(String(child));
        return skipStats ? stripStats(raw) : raw;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
};

const getFriendlyIntro = (title: string, subtitle: string) => {
  const lower = title.toLowerCase();
  if (/proceed to level \d+\?/i.test(subtitle.trim())) {
    return subtitle.replace(/proceed to level (\d+)\?/i, "Do you want to proceed to level $1?");
  }
  if (/proceed to the next level\?/i.test(subtitle.trim())) {
    return "Do you want to proceed to the next level?";
  }
  if (/(time'?s up|oops|try again|oh no|not quite|failed|almost|game over)/.test(lower)) {
    if (/game over/i.test(lower)) {
      return "Oh no! That's game over. Too many tries, so the next level stays locked. You can go back to the lesson, or replay this level.";
    }
    return `Oh no! ${subtitle}`;
  }
  if (/(level complete|congratulations|great job|awesome|you finished|you sorted|you did it)/.test(lower)) {
    if (/(great job|congratulations|awesome|you finished|you sorted|you did it)/.test(lower)) {
      return subtitle ? `Nice work! ${subtitle}` : title;
    }
    return `Great job! ${subtitle}`;
  }
  return subtitle || title;
};

const isYesNoButtons = (buttons?: GamePopupButton[]) => {
  const labels = (buttons ?? []).map((btn) => (btn.speak ?? getText(btn.label)).trim().toLowerCase());
  return labels.includes("yes") && labels.includes("no");
};

const nextLevelQuestion = (subtitle: string) => {
  const numbered = subtitle.match(/proceed to level (\d+)\?/i);
  if (numbered) return `Do you want to proceed to level ${numbered[1]}?`;
  if (/proceed to the next level/i.test(subtitle)) return "Do you want to proceed to the next level?";
  const proceed = subtitle.match(/proceed to ([^?]+)\?/i);
  if (proceed) return `Do you want to proceed to ${proceed[1].trim()}?`;
  return "Do you want to proceed to the next level?";
};

const YES_HINT = "Yes is the green button.";
const NO_HINT = "No is the red button.";

const speechMs = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1100, Math.min(5000, 600 + words * 380));
};

const speak = (
  text: string,
  options?: {
    interrupt?: boolean;
    onStart?: () => void;
    onEnd?: () => void;
    force?: boolean;
  }
) => {
  if (!text) return;
  speakKidPrompt(text, {
    interrupt: options?.interrupt !== false,
    rate: 0.92,
    pitch: 1.22,
    onEnd: options?.onEnd,
    force: options?.force,
  });
  options?.onStart?.();
};

export function GameOverlay({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <div className="game-overlay" role="dialog" aria-modal="true">
      {children}
    </div>
  );
}

export function GamePopup({
  title,
  subtitle,
  children,
  buttons,
  stars,
  timeLeft,
  wrong,
}: Omit<GamePopupProps, "isOpen">) {
  const titleText = getText(title);
  const subtitleSpeech = getText(subtitle, true);
  const intro = getFriendlyIntro(titleText, subtitleSpeech);
  const earnedStars =
    stars ?? (timeLeft != null ? livePlayStars(timeLeft, true, wrong ?? 0) : undefined);
  const celebrate = earnedStars != null;
  const askYesNo = isYesNoButtons(buttons);
  const yesNoNextLevel = askYesNo && celebrate;
  const buttonSpeak =
    buttons
      ?.map((btn) => btn.speak ?? getText(btn.label))
      .filter(Boolean)
      .join(" or ") ?? "";
  const speakText = useMemo(() => {
    // 3-2-1 already speaks the number. Do not also read "Get ready to play!".
    if (/get ready to play/i.test(subtitleSpeech) && !titleText) return "";
    if (/game over/i.test(titleText)) {
      return [intro, buttonSpeak].map((piece) => piece.trim()).filter(Boolean).join(". ");
    }
    if (askYesNo) {
      return yesNoNextLevel ? nextLevelQuestion(subtitleSpeech) : intro || titleText;
    }
    const pieces = [titleText];
    if (intro && intro !== titleText) pieces.push(intro);
    if (buttonSpeak) pieces.push(buttonSpeak);
    return pieces.map((piece) => piece.trim()).filter(Boolean).join(". ");
  }, [titleText, intro, buttonSpeak, askYesNo, yesNoNextLevel, subtitleSpeech]);

  const [isInitialSpeaking, setIsInitialSpeaking] = useState(false);
  const [initialSpeechStarted, setInitialSpeechStarted] = useState(false);
  const [askHighlight, setAskHighlight] = useState<"yes" | "no" | null>(null);

  useLayoutEffect(() => {
    if (!celebrate) return;
    muteKidSpeech(LEVEL_CELEBRATE_STAR_POP_MS);
    return () => unmuteKidSpeech();
  }, [celebrate, speakText]);

  useEffect(() => {
    if (!speakText) {
      setInitialSpeechStarted(false);
      setIsInitialSpeaking(false);
      setAskHighlight(null);
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    setInitialSpeechStarted(false);
    setIsInitialSpeaking(true);
    setAskHighlight(null);

    const run = async () => {
      await wait(celebrate ? LEVEL_CELEBRATE_STAR_POP_MS : 0);
      if (cancelled) return;
      unmuteKidSpeech();
      speak(speakText, { interrupt: true, force: true });
      setInitialSpeechStarted(true);
      await wait(speechMs(speakText));
      if (cancelled) return;
      if (askYesNo) {
        setAskHighlight("yes");
        speak(YES_HINT, { interrupt: true, force: true });
        await wait(speechMs(YES_HINT));
        if (cancelled) return;
        setAskHighlight("no");
        speak(NO_HINT, { interrupt: true, force: true });
        await wait(speechMs(NO_HINT));
        if (cancelled) return;
        setAskHighlight(null);
      }
      setIsInitialSpeaking(false);
    };

    void run();
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      setAskHighlight(null);
    };
  }, [speakText, celebrate, askYesNo]);

  const handleHover = (label: string) => {
    if (!initialSpeechStarted || isInitialSpeaking) return;
    const key = label.trim().toLowerCase();
    if (key === "yes" || key === "no") setAskHighlight(key);
    speak(label, {
      interrupt: true,
      onEnd: () => setAskHighlight(null),
    });
  };

  return (
    <div
      className={`game-popup${/game over/i.test(getText(title)) ? " game-popup--over" : ""}${celebrate ? " game-popup--celebrate" : ""}`}
    >
      {celebrate ? (
        <div className="game-popup-title">Great Job!</div>
      ) : (
        title && <div className="game-popup-title">{title}</div>
      )}
      {celebrate ? <LevelCelebrate stars={earnedStars ?? 0} /> : null}
      {subtitle && <div className="game-popup-subtitle">{subtitle}</div>}
      {children && <div className="game-popup-content">{children}</div>}
      {buttons && buttons.length > 0 && (
        <div className="game-popup-actions">
          {buttons.map((btn, idx) => (
            <button
              key={idx}
              onClick={btn.onClick}
              onMouseEnter={() => handleHover(btn.speak ?? getText(btn.label))}
              className={`game-popup-btn ${btn.variant || "primary"}${askHighlight === btn.variant ? " is-lit" : ""}`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GameConfirmPopup({
  isOpen,
  title,
  subtitle,
  yesLabel = "Yes",
  noLabel = "No",
  onYes,
  onNo,
}: GameConfirmPopupProps) {
  return (
    <GameOverlay isOpen={isOpen}>
      <GamePopup
        title={title}
        subtitle={subtitle}
        buttons={[
          {
            label: yesLabel,
            onClick: onYes,
            variant: "yes",
          },
          {
            label: noLabel,
            onClick: onNo,
            variant: "no",
          },
        ]}
      />
    </GameOverlay>
  );
}

export function Countdown({ value }: { value: number }) {
  return <div className="game-countdown">{value}</div>;
}

export function GamePauseButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`game-pause-btn${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label="Pause"
    >
      <Pause size={18} strokeWidth={2.75} aria-hidden="true" />
    </button>
  );
}

function PausePopupLabel({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <span className="game-popup-btn-inner">
      {icon}
      {text}
    </span>
  );
}

export function GamePausePopup({
  open,
  subtitle,
  onPlay,
  onMap,
}: {
  open: boolean;
  subtitle?: React.ReactNode;
  onPlay: () => void;
  onMap: () => void;
}) {
  return (
    <GameOverlay isOpen={open}>
      <GamePopup
        title="Paused"
        subtitle={subtitle}
        buttons={[
          {
            label: (
              <PausePopupLabel
                icon={<Play size={18} strokeWidth={2.4} fill="currentColor" aria-hidden="true" />}
                text="Play"
              />
            ),
            speak: "Play",
            variant: "yes",
            onClick: onPlay,
          },
          {
            label: (
              <PausePopupLabel
                icon={<Map size={18} strokeWidth={2.4} aria-hidden="true" />}
                text="Map"
              />
            ),
            speak: "Map",
            variant: "no",
            onClick: onMap,
          },
        ]}
      />
    </GameOverlay>
  );
}

export function GameOverPopup({
  open,
  onLesson,
  onReplay,
}: {
  open: boolean;
  onLesson: () => void;
  onReplay: () => void;
}) {
  return (
    <GameOverlay isOpen={open}>
      <GamePopup
        title="Game Over"
        subtitle="Too many tries! The next level stays locked until you do better."
        buttons={[
          {
            label: "Back to Lesson",
            speak: "Back to lesson",
            variant: "secondary",
            onClick: onLesson,
          },
          {
            label: "Replay Level",
            speak: "Replay level",
            variant: "primary",
            onClick: onReplay,
          },
        ]}
      />
    </GameOverlay>
  );
}

