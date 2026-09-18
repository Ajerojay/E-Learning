import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const TILE_COLORS = ["#f7c9c4", "#cde8c4", "#d4e4f8", "#f8e3b0", "#e4d4f8", "#f8d4e8"];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const INTRO: LevelIntroContent = {
  title: "Load the Train!",
  subtitle: "Start at the front of the train, then put the letters in order.",
  speech: "Load the train! Start at the front, then put the letters in order.",
  compact: true,
};

function consecutiveRun(count: number, minStart: number, usedStarts: number[]) {
  const maxStart = Math.max(minStart, ALPHABET.length - count);
  const choices: number[] = [];
  for (let start = minStart; start <= maxStart; start += 1) {
    if (usedStarts.some((used) => Math.abs(used - start) < count)) continue;
    choices.push(start);
  }
  const pool = choices.length ? choices : Array.from({ length: maxStart - minStart + 1 }, (_, i) => minStart + i);
  const start = pool[Math.floor(Math.random() * pool.length)] ?? minStart;
  return { start, letters: ALPHABET.slice(start, start + count) };
}

const LEVELS: Array<{ name: string; pageCount: number; pageSize: number; minStart: number; time: number }> = [
  { name: "Level 1", pageCount: 2, pageSize: 3, minStart: 0, time: 45 },
  { name: "Level 2", pageCount: 2, pageSize: 4, minStart: 6, time: 50 },
  { name: "Level 3", pageCount: 2, pageSize: 5, minStart: 11, time: 55 },
];

function pagesForLevel(index: number) {
  if (index === 0) return [["A", "B", "C"], ["D", "E", "F"]];
  const next = LEVELS[index];
  const usedStarts: number[] = [];
  return Array.from({ length: next.pageCount }, () => {
    const run = consecutiveRun(next.pageSize, next.minStart, usedStarts);
    usedStarts.push(run.start);
    return run.letters;
  });
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function playWhistle() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    window.setTimeout(() => void ctx.close(), 700);
  } catch {
    /* ignore */
  }
}

function LetterBlock({ letter, index, disabled }: { letter: string; index: number; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `block-${letter}`,
    disabled,
    data: { letter },
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 20 : 2,
    opacity: isDragging ? 0.92 : 1,
    background: TILE_COLORS[index % TILE_COLORS.length],
  };
  return (
    <button
      type="button"
      ref={setNodeRef}
      className="lat-block"
      style={style}
      aria-label={`Letter ${letter}`}
      {...listeners}
      {...attributes}
    >
      {letter}
    </button>
  );
}

function TrainCar({
  letter,
  filled,
}: {
  letter: string;
  filled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `car-${letter}`, data: { letter } });
  return (
    <div
      ref={setNodeRef}
      className={["lat-car", filled ? "is-filled" : "", isOver ? "is-over" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${letter} train car`}
    >
      {filled ? <span className="lat-block lat-block--parked">{letter}</span> : null}
    </div>
  );
}

export default function LettersAlphabetTrain() {
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 20, tolerance: 12 } })
  );
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("letters-train");
  const [levelIndex, setLevelIndex] = useState(0);
  const [blocks, setBlocks] = useState<string[]>([]);
  const [track, setTrack] = useState<string[]>(["A", "B", "C"]);
  const [pages, setPages] = useState<string[][]>([["A", "B", "C"], ["D", "E", "F"]]);
  const [pageIndex, setPageIndex] = useState(0);
  const [filled, setFilled] = useState<Record<string, boolean>>({});
  const [placedCount, setPlacedCount] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [message, setMessage] = useState("Drag the letter blocks into ABC order!");
  const [paused, setPaused] = useState(false);
  const [motion, setMotion] = useState<"enter" | "parked" | "exit">("enter");
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
    blocked: completeOpen || gameOverOpen || motion === "exit",
    timeLimit: level.time,
    levelIndex,
    soundEnabled,
  });
  useStarTimeUp(clock.timeUpOpen, levelIndex, Object.keys(filled).length > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  const showPage = (letters: string[]) => {
    setTrack(letters);
    setBlocks(shuffle(letters));
    setFilled({});
    setMotion("enter");
  };

  useEffect(() => {
    if (motion !== "enter") return;
    if (mapOpen || clock.levelIntroActive || clock.countdown !== null) return;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setMotion("parked"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [motion, mapOpen, clock.levelIntroActive, clock.countdown]);

  const resetBoard = useCallback((index: number) => {
    const nextPages = pagesForLevel(index);
    doneRef.current = false;
    setLevelIndex(index);
    setPages(nextPages);
    setPageIndex(0);
    showPage(nextPages[0]);
    setPlacedCount(0);
    setWrong(0);
    setMessage("Start at the front of the train, then keep going in order!");
    setPaused(false);
    setCompleteOpen(false); setGameOverOpen(false);
  }, []);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  useEffect(() => {
    resetBoard(levelIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelIndex]);

  const remaining = useMemo(
    () => blocks.filter((letter) => !filled[letter]),
    [blocks, filled]
  );
  const totalLetters = pages.reduce((sum, letters) => sum + letters.length, 0);
  const progress = placedCount + Object.keys(filled).length;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setMotion("exit");
    setMessage("Toot toot! The train is ready!");
    playWhistle();
    if (soundEnabled) speakKidPrompt("Toot toot! The train is ready to go!", { interrupt: true });
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "letters_train", Math.max(40, 100 - wrong * 8), wrong, levelIndex >= 2);
    }
    window.setTimeout(() => setCompleteOpen(true), 950);
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const goNextPage = () => {
    const nextPage = pageIndex + 1;
    setPlacedCount((count) => count + track.length);
    setPageIndex(nextPage);
    showPage(pages[nextPage]);
    setMessage("New letters! Start at the front of the train.");
    if (soundEnabled) speakKidPrompt("More letters! Start at the front of the train.", { interrupt: true });
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!clock.playing || motion !== "parked") return;
    const letter = (event.active.data.current as { letter?: string } | undefined)?.letter;
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!letter || !overId.startsWith("car-")) return;
    const target = overId.replace("car-", "");
    if (filled[letter] || filled[target]) return;
    if (target === letter) {
      const next = { ...filled, [letter]: true };
      setFilled(next);
      setMessage(`Great! ${letter} is in the right car.`);
      if (soundEnabled) speakKidPrompt(letter, { interrupt: true });
      if (Object.keys(next).length >= track.length) {
        if (pageIndex < pages.length - 1) {
          setMotion("exit");
          playWhistle();
          window.setTimeout(() => goNextPage(), 950);
        } else {
          window.setTimeout(finish, 220);
        }
      }
      return;
    }
    setWrong((count) => count + 1);
    setMessage("Put the letters in order!");
    if (soundEnabled) speakKidPrompt("Put them in order!", { interrupt: true });
  };

  return (
    <div className="ssm lat">
      <LettersMiniChrome
        mapTitle="Train Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title="Load the Train!"
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        tried={Object.keys(filled).length > 0 || wrong > 0}
        wrong={wrong}
        extraHeader={
          <>
            <span className="ssm-pill">Page {pageIndex + 1}/{pages.length}</span>
            <GamePauseButton onClick={() => setPaused(true)} />
          </>
        }
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
          <div className="lat-blocks">
            {remaining.map((letter, index) => (
              <LetterBlock key={letter} letter={letter} index={index} disabled={!clock.playing || motion !== "parked"} />
            ))}
          </div>
          <div className="lat-rail">
            <div className={`lat-track is-${motion}`}>
              <div className="lat-engine" aria-hidden="true">
                <span className="lat-engine-cabin">🚂</span>
              </div>
              {track.map((letter) => (
                <TrainCar key={`${pageIndex}-${letter}`} letter={letter} filled={Boolean(filled[letter])} />
              ))}
            </div>
          </div>
        </DndContext>
        <div className="lmm-pager" aria-hidden="true">
          {pages.map((letters, index) => (
            <span key={letters.join("")} className={index === pageIndex ? "is-on" : index < pageIndex ? "is-done" : ""} />
          ))}
        </div>
        <div className="lat-conductor">
          <img src={bear} alt="" />
        </div>
      </LettersMiniChrome>

      <GamePausePopup
        open={paused}
        subtitle="Ready to load more letters?"
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
          title="Toot toot!"
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
