import React, { useEffect, useMemo, useState } from "react";
import "./GamePopup.css";

type GamePopupVariant = "primary" | "secondary" | "yes" | "no";

interface GamePopupProps {
  isOpen: boolean;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  buttons?: Array<{
    label: string;
    onClick: () => void;
    variant?: GamePopupVariant;
  }>;
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
  if (/(time'?s up|oops|try again|oh no|not quite|failed|almost)/.test(lower)) {
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

const getVoice = (): SpeechSynthesisVoice | null => {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;
  const preferred = voices.find((voice) =>
    /alloy|samantha|amy|kendra|victoria|zira|google|female|voice/i.test(voice.name.toLowerCase())
  );
  return preferred || voices[0];
};

const speak = (
  text: string,
  options?: {
    interrupt?: boolean;
    onStart?: () => void;
    onEnd?: () => void;
  }
) => {
  if (!text || !("speechSynthesis" in window)) return;
  if (options?.interrupt !== false) {
    window.speechSynthesis.cancel();
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1.1;
  utterance.volume = 1;
  const voice = getVoice();
  if (voice) utterance.voice = voice;
  utterance.onstart = () => options?.onStart?.();
  utterance.onend = () => options?.onEnd?.();
  utterance.onerror = () => options?.onEnd?.();
  window.speechSynthesis.speak(utterance);
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
}: Omit<GamePopupProps, "isOpen">) {
  const titleText = getText(title);
  const subtitleSpeech = getText(subtitle, true);
  const intro = getFriendlyIntro(titleText, subtitleSpeech);
  const buttonSpeak = buttons?.map((btn) => btn.label).filter(Boolean).join(" or ") ?? "";
  const speakText = useMemo(() => {
    const pieces = [titleText];
    if (intro && intro !== titleText) pieces.push(intro);
    if (buttonSpeak) pieces.push(buttonSpeak);
    if (pieces.length === 0) return "";
    return pieces.join(". ");
  }, [titleText, intro, buttonSpeak]);

  const [isInitialSpeaking, setIsInitialSpeaking] = useState(false);
  const [initialSpeechStarted, setInitialSpeechStarted] = useState(false);

  useEffect(() => {
    if (!speakText) {
      setInitialSpeechStarted(false);
      setIsInitialSpeaking(false);
      return;
    }

    setInitialSpeechStarted(false);
    setIsInitialSpeaking(true);

    speak(speakText, {
      interrupt: true,
      onStart: () => {
        setInitialSpeechStarted(true);
        setIsInitialSpeaking(true);
      },
      onEnd: () => {
        setIsInitialSpeaking(false);
      },
    });
  }, [speakText]);

  const handleHover = (label: string) => {
    if (!initialSpeechStarted || isInitialSpeaking) return;
    speak(label, { interrupt: true });
  };

  return (
    <div className="game-popup">
      {title && <div className="game-popup-title">{title}</div>}
      {subtitle && <div className="game-popup-subtitle">{subtitle}</div>}
      {children && <div className="game-popup-content">{children}</div>}
      {buttons && buttons.length > 0 && (
        <div className="game-popup-actions">
          {buttons.map((btn, idx) => (
            <button
              key={idx}
              onClick={btn.onClick}
              onMouseEnter={() => handleHover(btn.label)}
              className={`game-popup-btn ${btn.variant || "primary"}`}
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
