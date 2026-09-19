import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { GameOverlay, GamePopup, Countdown } from "./GamePopup";
import QuestLevelSelect from "./QuestLevelSelect";
import ChildMusicToggle from "./ChildMusicToggle";
import { LiveStarHud } from "./LevelStars";
import { KidGameTitle } from "./KidGameTitle";
import { LevelIntroOverlay, COUNTDOWN_READY_SUBTITLE, type LevelIntroContent } from "./levelIntro";

export function LettersMiniChrome({
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
  footer,
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
  footer?: ReactNode;
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
          onBack={() => navigate("/quest/letter")}
        />
      )}
      <button type="button" className="ssm-map-btn" onClick={() => setMapOpen(true)}>
        {"\u2190"} Map
      </button>
      <KidGameTitle className="ssm-title" fitHud>
        {title}
      </KidGameTitle>
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
      <div className="ssm-board">{children}</div>
      {footer}
      <LevelIntroOverlay isOpen={introActive && introEnabled} content={intro} />
      {countdown !== null && (
        <GameOverlay isOpen>
          <GamePopup title={<Countdown value={countdown} />} subtitle={COUNTDOWN_READY_SUBTITLE} />
        </GameOverlay>
      )}
    </>
  );
}

export function LettersGameFooter({
  message,
  progress,
  total,
  wrong,
}: {
  message: string;
  progress: number;
  total: number;
  wrong: number;
}) {
  return (
    <div className="cq-panel">
      <div className="cq-message">{message}</div>
      <div className="cq-score">
        Progress: {progress}/{total} | Wrong Attempts: {wrong}
      </div>
    </div>
  );
}

export function lettersNextLevelButtons({
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
