import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";
import { recordGameProgressRpc } from "../../../lib/gameProgressDb";
import { speakKidPrompt } from "../../nativeTts";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "./GamePopup";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "./questLevelMap";
import { LettersGameFooter, LettersMiniChrome, lettersNextLevelButtons } from "./LettersMiniChrome";
import { useColorsMiniClock } from "./useColorsMiniClock";
import type { LevelIntroContent } from "./levelIntro";
import bear from "./images/bear-2.png";
import "./LettersMiniGames.css";

type AnimalPair = {
  letter: string;
  name: string;
  emoji: string;
  tint: string;
  tile: string;
};

const ANIMALS: AnimalPair[] = [
  { letter: "A", name: "ant", emoji: "🐜", tint: "#f8d9c4", tile: "#f7c9c4" },
  { letter: "B", name: "bear", emoji: "🐻", tint: "#e8d4c4", tile: "#cde8c4" },
  { letter: "C", name: "cat", emoji: "🐱", tint: "#f8e4d0", tile: "#d4e4f8" },
  { letter: "D", name: "dog", emoji: "🐶", tint: "#ffe9b8", tile: "#f8d4e8" },
  { letter: "E", name: "elephant", emoji: "🐘", tint: "#c9dce8", tile: "#f7c9c4" },
  { letter: "F", name: "fox", emoji: "🦊", tint: "#ffd8c4", tile: "#cde8c4" },
  { letter: "G", name: "goat", emoji: "🐐", tint: "#e8f0d0", tile: "#d4e4f8" },
  { letter: "H", name: "horse", emoji: "🐴", tint: "#e4d8c8", tile: "#f8e3b0" },
  { letter: "I", name: "iguana", emoji: "🦎", tint: "#d4f0c8", tile: "#e4d4f8" },
  { letter: "J", name: "jellyfish", emoji: "🪼", tint: "#d8e8ff", tile: "#f8d4e8" },
  { letter: "K", name: "kangaroo", emoji: "🦘", tint: "#ffe4c4", tile: "#cde8c4" },
  { letter: "L", name: "lion", emoji: "🦁", tint: "#ffe9b0", tile: "#f7c9c4" },
  { letter: "M", name: "monkey", emoji: "🐵", tint: "#ead4c0", tile: "#d4e4f8" },
  { letter: "N", name: "newt", emoji: "🐸", tint: "#d8f0c8", tile: "#f8e3b0" },
  { letter: "O", name: "owl", emoji: "🦉", tint: "#e8dcc8", tile: "#e4d4f8" },
  { letter: "P", name: "penguin", emoji: "🐧", tint: "#dce8f4", tile: "#cde8c4" },
  { letter: "R", name: "rabbit", emoji: "🐰", tint: "#f8e8dc", tile: "#f8d4e8" },
  { letter: "S", name: "snake", emoji: "🐍", tint: "#d8f0d0", tile: "#d4e4f8" },
  { letter: "T", name: "tiger", emoji: "🐯", tint: "#ffe0b8", tile: "#f7c9c4" },
  { letter: "W", name: "whale", emoji: "🐋", tint: "#c8e4f8", tile: "#cde8c4" },
  { letter: "Z", name: "zebra", emoji: "🦓", tint: "#ece8e0", tile: "#e4d4f8" },
];

const LEVELS: Array<{ name: string; time: number; pages: string[] }> = [
  { name: "Level 1", time: 50, pages: ["ABC", "DEF"] },
  { name: "Level 2", time: 55, pages: ["EFG", "HIJ"] },
  { name: "Level 3", time: 60, pages: ["KLMN", "OPRS"] },
];

function pairsForLetters(letters: string): AnimalPair[] {
  return ANIMALS.filter((animal) => letters.includes(animal.letter));
}

const INTRO: LevelIntroContent = {
  title: "Match the Mama and Baby!",
  subtitle: "Drag each baby lowercase letter back to its mama.",
  speech: "Match the mama and baby! Drag the baby to its mama.",
  compact: true,
};

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function AnimalCard({
  animal,
  role,
}: {
  animal: AnimalPair;
  role: "Mama" | "Baby";
}) {
  return (
    <div className={`lmm-card lmm-card--${role.toLowerCase()}`} style={{ background: animal.tint }}>
      <span className="lmm-portrait" aria-hidden="true">
        {animal.emoji}
      </span>
      <span className="lmm-tile" style={{ background: animal.tile }}>
        {role === "Baby" ? animal.letter.toLowerCase() : animal.letter}
      </span>
      <small>{role}</small>
    </div>
  );
}

function DraggableBaby({ animal, disabled }: { animal: AnimalPair; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `baby-${animal.letter}`,
    disabled,
    data: { letter: animal.letter },
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 20 : 2,
    opacity: isDragging ? 0.92 : 1,
  };
  return (
    <button
      type="button"
      ref={setNodeRef}
      className="lmm-animal lmm-animal--baby"
      style={style}
      aria-label={`Baby ${animal.name} ${animal.letter.toLowerCase()}`}
      {...listeners}
      {...attributes}
    >
      <AnimalCard animal={animal} role="Baby" />
    </button>
  );
}

function MamaSlot({ animal, reunited }: { animal: AnimalPair; reunited: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `mama-${animal.letter}`,
    data: { letter: animal.letter },
  });
  return (
    <div
      ref={setNodeRef}
      className={["lmm-drop", reunited ? "is-reunited" : "", isOver ? "is-over" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <AnimalCard animal={animal} role="Mama" />
      {reunited && (
        <>
          <span className="lmm-heart" aria-hidden="true">
            {"\u2764"}
          </span>
          <AnimalCard animal={animal} role="Baby" />
        </>
      )}
    </div>
  );
}

export default function LettersMamaBaby() {
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 20, tolerance: 12 } })
  );
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("letters-mama");
  const [levelIndex, setLevelIndex] = useState(0);
  const [mamas, setMamas] = useState<AnimalPair[]>([]);
  const [babies, setBabies] = useState<AnimalPair[]>([]);
  const [pageLetters, setPageLetters] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [reunited, setReunited] = useState<Record<string, boolean>>({});
  const [matchedCount, setMatchedCount] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [message, setMessage] = useState("Drag each baby to its mama!");
  const [paused, setPaused] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const doneRef = useRef(false);
  const level = LEVELS[levelIndex];

  const clock = useColorsMiniClock({
    intro: INTRO,
    mapOpen,
    isLandscape: true,
    paused,
    blocked: completeOpen || gameOverOpen,
    timeLimit: level.time,
    levelIndex,
    soundEnabled,
  });
  useStarTimeUp(clock.timeUpOpen, levelIndex, matchedCount > 0 || Object.keys(reunited).length > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  const showPage = useCallback((letters: string) => {
    const pairs = pairsForLetters(letters);
    setMamas(shuffle(pairs));
    setBabies(shuffle(pairs));
    setReunited({});
  }, []);

  const resetBoard = useCallback((index: number) => {
    const next = LEVELS[index];
    doneRef.current = false;
    setLevelIndex(index);
    setPageLetters(next.pages);
    setPageIndex(0);
    showPage(next.pages[0]);
    setMatchedCount(0);
    setWrong(0);
    setMessage("Drag each baby to its mama!");
    setPaused(false);
    setCompleteOpen(false); setGameOverOpen(false);
  }, [showPage]);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  useEffect(() => {
    resetBoard(levelIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelIndex]);

  const pageCount = pageLetters.length || 2;
  const pageSize = mamas.length;
  const totalLetters = pageLetters.reduce((sum, letters) => sum + letters.length, 0);
  const progress = matchedCount + Object.keys(reunited).length;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCompleteOpen(true);
    setMessage("Awesome!");
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "letters_mama", Math.max(40, 100 - wrong * 8), wrong, levelIndex >= 2);
    }
    if (soundEnabled) speakKidPrompt("Yay! The babies found their mamas!", { interrupt: true });
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const goNextPage = () => {
    const nextPage = pageIndex + 1;
    setMatchedCount((count) => count + pageSize);
    setPageIndex(nextPage);
    showPage(pageLetters[nextPage]);
    setMessage("New letters! Drag each baby to its mama!");
    if (soundEnabled) speakKidPrompt("More letters! Match the babies to their mamas.", { interrupt: true });
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!clock.playing) return;
    const letter = (event.active.data.current as { letter?: string } | undefined)?.letter;
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!letter || !overId.startsWith("mama-")) return;
    const target = overId.replace("mama-", "");
    if (reunited[letter]) return;
    if (target === letter) {
      const next = { ...reunited, [letter]: true };
      setReunited(next);
      setMessage("Great match!");
      if (soundEnabled) speakKidPrompt("Great match!", { interrupt: true });
      if (Object.keys(next).length >= pageSize) {
        if (pageIndex < pageCount - 1) window.setTimeout(goNextPage, 280);
        else window.setTimeout(finish, 280);
      }
      return;
    }
    setWrong((count) => count + 1);
    setMessage("Try another mama!");
    if (soundEnabled) speakKidPrompt("Try another mama!", { interrupt: true });
  };

  return (
    <div className="ssm lmm">
      <LettersMiniChrome
        mapTitle="Mama Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title="Match the Mama and Baby!"
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        tried={matchedCount > 0 || Object.keys(reunited).length > 0 || wrong > 0}
        wrong={wrong}
        extraHeader={<GamePauseButton onClick={() => setPaused(true)} />}
        footer={
          !completeOpen ? (
            <LettersGameFooter
              message={message}
              progress={progress}
              total={totalLetters}
              wrong={wrong}
            />
          ) : null
        }
      >
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="lmm-play">
            <div className="lmm-row" aria-label="Mamas">
              {mamas.map((animal) => (
                <MamaSlot key={`${pageIndex}-${animal.letter}`} animal={animal} reunited={Boolean(reunited[animal.letter])} />
              ))}
            </div>
            <div className="lmm-row lmm-row--babies" aria-label="Babies">
              {babies.map((animal) =>
                reunited[animal.letter] ? (
                  <div key={`${pageIndex}-${animal.letter}`} className="lmm-animal lmm-animal--ghost" aria-hidden="true" />
                ) : (
                  <DraggableBaby key={`${pageIndex}-${animal.letter}`} animal={animal} disabled={!clock.playing} />
                )
              )}
            </div>
          </div>
        </DndContext>
        <div className="lmm-pager" aria-hidden="true">
          {pageLetters.map((letters, index) => (
            <span key={letters} className={index === pageIndex ? "is-on" : index < pageIndex ? "is-done" : ""} />
          ))}
        </div>
        <img className="ssm-bear" src={bear} alt="" />
      </LettersMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="Ready to reunite more families?"
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />
      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/letters")}
        onReplay={() => { resetBoard(levelIndex); clock.replayLevel(); }}
      />
      <GameOverlay isOpen={clock.timeUpOpen && !gameOverOpen}>
        <GamePopup
          title="Time's up!"
          subtitle={`Progress: ${progress}/${totalLetters} | Wrong Attempts: ${wrong}`}
          buttons={[
            { label: "Replay Level", onClick: () => { resetBoard(levelIndex); clock.replayLevel(); } },
            { label: "Map", variant: "secondary", onClick: () => { clock.setTimeUpOpen(false); setMapOpen(true); } },
          ]}
        />
      </GameOverlay>
      <GameOverlay isOpen={completeOpen}>
        <GamePopup
          title="Awesome!"
          timeLeft={clock.timeLeft}
          wrong={wrong}
          subtitle={`Progress: ${totalLetters}/${totalLetters} | Wrong Attempts: ${wrong}`}
          buttons={lettersNextLevelButtons({
            levelIndex,
            lastIndex: 2,
            onYes: () => resetBoard(levelIndex + 1),
            onNo: () => { setCompleteOpen(false); setGameOverOpen(false); setMapOpen(true); },
            onGames: () => navigate("/quest/letter"),
          })}
        />
      </GameOverlay>
    </div>
  );
}
