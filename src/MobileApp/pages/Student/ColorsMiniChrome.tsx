import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { speakKidPrompt } from "../../nativeTts";
import { GameOverlay, GamePopup, Countdown } from "./GamePopup";
import QuestLevelSelect from "./QuestLevelSelect";
import ChildMusicToggle from "./ChildMusicToggle";
import { LiveStarHud } from "./LevelStars";
import { LevelIntroOverlay, COUNTDOWN_READY_SUBTITLE, type LevelIntroContent } from "./levelIntro";

export function ColorsMiniChrome({
  mapTitle,
  mapOpen,
  setMapOpen,
  unlockedCount,
  levelStars = [],
  onSelectLevel,
  mapLevelCount = 3,
  title,
  levelIndex,
  timeLeft,
  soundEnabled,
  setSoundEnabled,
  intro,
  introActive,
  introEnabled,
  countdown,
  rotateLabel,
  mobileApp,
  isLandscape,
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
  mapLevelCount?: number;
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
  rotateLabel: string;
  mobileApp: boolean;
  isLandscape: boolean;
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
          levelCount={mapLevelCount}
          levelStars={levelStars}
          onSelectLevel={(index) => {
            onSelectLevel(index);
            setMapOpen(false);
          }}
          onBack={() => navigate("/quest/colors")}
        />
      )}
      {mobileApp && !isLandscape && (
        <div className="cq-rotate-notice" role="status">
          <span className="cq-phone-icon" aria-hidden="true">
            📱
          </span>
          <strong>Turn your device sideways!</strong>
          <p>{rotateLabel} needs landscape mode before you can play.</p>
        </div>
      )}
      <button type="button" className="cq-back-btn" onClick={() => setMapOpen(true)}>
        {"\u2190"} Map
      </button>
      <h1 className="cq-title">{title}</h1>
      <div className="cq-level-meta-row">
        <div className="cq-level-meta">
          <strong className="cq-level-pill">Level {levelIndex + 1}</strong>
          <LiveStarHud timeLeft={timeLeft} tried={tried} wrong={wrong} />
          <span className="cq-timer-pill">⏱ {timeLeft}s</span>
        </div>
        <div className="cq-sound-buttons">
          <button
            type="button"
            className="cq-sound-toggle cq-effects-toggle"
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
        </div>
        {extraHeader}
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

export const NEXT_LEVEL_SPEECH = "Do you want to proceed to the next level? Yes or no.";

export function speakNextLevelPrompt(soundEnabled: boolean, isLastLevel: boolean) {
  if (!soundEnabled) return;
  speakKidPrompt(
    isLastLevel ? "Awesome! You finished!" : NEXT_LEVEL_SPEECH,
    { interrupt: true }
  );
}

export function colorsNextLevelButtons({
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
