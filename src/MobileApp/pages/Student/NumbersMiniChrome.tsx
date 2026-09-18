import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { GameOverlay, GamePopup, Countdown } from "./GamePopup";
import QuestLevelSelect from "./QuestLevelSelect";
import ChildMusicToggle from "./ChildMusicToggle";
import { LiveStarHud } from "./LevelStars";
import { LevelIntroOverlay, COUNTDOWN_READY_SUBTITLE, type LevelIntroContent } from "./levelIntro";

export function NumbersMiniChrome({
  mapTitle,
  mapOpen,
  setMapOpen,
  unlockedCount,
  levelStars = [],
  onSelectLevel,
  title,
  levelIndex,
  timeLeft,
  soundEnabled,
  setSoundEnabled,
  intro,
  introActive,
  introEnabled,
  countdown,
  children,
  extraHeader,
  tried = false,
  wrong = 0,
}: {
  mapTitle: string;
  mapOpen: boolean;
  setMapOpen: (open: boolean) => void;
  unlockedCount: number;
  levelStars?: number[];
  onSelectLevel: (index: number) => void;
  title: string;
  levelIndex: number;
  timeLeft: number;
  soundEnabled: boolean;
  setSoundEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  intro: LevelIntroContent;
  introActive: boolean;
  introEnabled: boolean;
  countdown: number | null;
  children: ReactNode;
  extraHeader?: ReactNode;
  tried?: boolean;
  wrong?: number;
}) {
  const navigate = useNavigate();

  return (
    <>
      {mapOpen && (
        <QuestLevelSelect
          title={mapTitle}
          unlockedCount={unlockedCount}
          levelStars={levelStars}
          onSelectLevel={(index) => {
            onSelectLevel(index);
            setMapOpen(false);
          }}
          onBack={() => navigate("/quest/number")}
        />
      )}
      <div className="nmini-header">
        <button type="button" className="ssm-map-btn" onClick={() => setMapOpen(true)}>
          {"\u2190"} Map
        </button>
        <h1 className="ssm-title">{title}</h1>
        <div className="ssm-meta">
          <strong className="ssm-pill">Level {levelIndex + 1}</strong>
          <LiveStarHud timeLeft={timeLeft} tried={tried} wrong={wrong} />
          <span className="ssm-pill">⏱ {timeLeft}s</span>
          <button
            type="button"
            className="ssm-sound"
            onClick={() => {
              setSoundEnabled((prev) => {
                const next = !prev;
                if (!next && "speechSynthesis" in window) window.speechSynthesis.cancel();
                return next;
              });
            }}
            aria-label={soundEnabled ? "Mute voice" : "Unmute voice"}
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
          <ChildMusicToggle />
          {extraHeader}
        </div>
      </div>
      {children}
      <LevelIntroOverlay isOpen={introActive && introEnabled} content={intro} />
      {countdown !== null && (
        <GameOverlay isOpen>
          <GamePopup title={<Countdown value={countdown} />} subtitle={COUNTDOWN_READY_SUBTITLE} />
        </GameOverlay>
      )}
    </>
  );
}

export function numbersNextLevelButtons({
  levelIndex,
  lastIndex,
  onYes,
  onNo,
  onGames,
}: {
  levelIndex: number;
  lastIndex: number;
  onYes: () => void;
  onNo: () => void;
  onGames: () => void;
}) {
  if (levelIndex >= lastIndex) {
    return [{ label: "Games", variant: "yes" as const, onClick: onGames }];
  }
  return [
    { label: "Yes", variant: "yes" as const, onClick: onYes },
    { label: "No", variant: "no" as const, onClick: onNo },
  ];
}

export const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

export function NumbersGameFooter({
  message,
  detail,
  progress,
  total,
  wrong,
  hidden,
}: {
  message: string;
  detail: string;
  progress: number;
  total: number;
  wrong: number;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className="nq-panel nq-panel--page nmini-footer">
      <div className="nq-message">{message}</div>
      <div className="nq-selection-count">{detail}</div>
      <div className="nq-score">
        Progress: {progress}/{total} | Wrong Attempts: {wrong}
      </div>
    </div>
  );
}
