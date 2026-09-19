import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { GameOverlay, GamePopup, Countdown } from "./GamePopup";
import QuestLevelSelect from "./QuestLevelSelect";
import ChildMusicToggle from "./ChildMusicToggle";
import { LiveStarHud } from "./LevelStars";
import { KidGameTitle } from "./KidGameTitle";
import { LevelIntroOverlay, COUNTDOWN_READY_SUBTITLE, type LevelIntroContent } from "./levelIntro";

export function ShapesMiniChrome({
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
  footerMessage,
  progress,
  total,
  wrongAttempts,
  hideFooter = false,
  tried,
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
  footerMessage: string;
  progress: number;
  total: number;
  wrongAttempts: number;
  hideFooter?: boolean;
  tried?: boolean;
}) {
  const navigate = useNavigate();
  const hasTried = tried ?? (progress > 0 || wrongAttempts > 0);

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
          onBack={() => navigate("/quest/shapes")}
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
        <LiveStarHud timeLeft={timeLeft} tried={hasTried} wrong={wrongAttempts} />
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
      {children}
      {hideFooter ? null : (
        <div className="sq-panel ssm-panel ssm-footer">
          <div className="sq-message">{footerMessage}</div>
          <div className="sq-score">
            Progress: {progress}/{total} | Wrong Attempts: {wrongAttempts}
          </div>
        </div>
      )}
      <LevelIntroOverlay isOpen={introActive && introEnabled} content={intro} />
      {countdown !== null && (
        <GameOverlay isOpen>
          <GamePopup title={<Countdown value={countdown} />} subtitle={COUNTDOWN_READY_SUBTITLE} />
        </GameOverlay>
      )}
    </>
  );
}

export function shapesNextLevelButtons({
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
