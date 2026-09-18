import { useCallback, useEffect, useRef, useState } from "react";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";

export type QuestGameKey =
  | "colors"
  | "colors-balloons"
  | "colors-paint"
  | "shapes"
  | "shapes-shadow"
  | "shapes-trace"
  | "letters"
  | "letters-mama"
  | "letters-train"
  | "numbers"
  | "numbers-feed"
  | "numbers-dots"
  | "phonics"
  | "phonics-begin"
  | "phonics-vowels"
  | "logic"
  | "logic-size"
  | "logic-odd";

export type LevelStarResult = {
  finished?: boolean;
  timeLeft?: number;
  tried?: boolean;
  wrongAttempts?: number;
};

function storageKey(childId: string, game: QuestGameKey) {
  return `questUnlock:${childId}:${game}`;
}

function starsStorageKey(childId: string, game: QuestGameKey) {
  return `questStars:${childId}:${game}`;
}

/** Too many misses: 1 star, no next-level unlock, game-over popup. */
export const GAME_OVER_WRONG_ATTEMPTS = 20;

function wrongStarCap(wrong: number): number {
  if (wrong >= GAME_OVER_WRONG_ATTEMPTS) return 1;
  if (wrong >= 10) return 2;
  if (wrong >= 5) return 2.5;
  return 3;
}

/** Finish with >8s left = 3, last 8s = 2.5, last 3s = 2. Time-up after a try = 1. Extra misses cap the stars. */
export function starsForResult(result: LevelStarResult): number {
  const wrong = result.wrongAttempts ?? 0;
  if (wrong >= GAME_OVER_WRONG_ATTEMPTS) return 1;
  if (result.finished) {
    const left = result.timeLeft ?? 0;
    const byTime = left > 8 ? 3 : left > 3 ? 2.5 : 2;
    return Math.min(byTime, wrongStarCap(wrong));
  }
  return result.tried ? 1 : 0;
}

export function livePlayStars(timeLeft: number, tried: boolean, wrong = 0): number {
  if (!tried) return 0;
  if (wrong >= GAME_OVER_WRONG_ATTEMPTS || timeLeft <= 0) return 1;
  return starsForResult({ finished: true, timeLeft, wrongAttempts: wrong });
}

export function getQuestLevelStars(childId: string, game: QuestGameKey, levelCount = 3): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(starsStorageKey(childId, game)) || "[]");
    const list = Array.isArray(raw) ? raw.map((value) => Number(value) || 0) : [];
    return Array.from({ length: levelCount }, (_, index) => list[index] ?? 0);
  } catch {
    return Array.from({ length: levelCount }, () => 0);
  }
}

export const QUEST_GAME_KEYS: QuestGameKey[] = [
  "colors",
  "colors-balloons",
  "colors-paint",
  "shapes",
  "shapes-shadow",
  "shapes-trace",
  "letters",
  "letters-mama",
  "letters-train",
  "numbers",
  "numbers-feed",
  "numbers-dots",
  "phonics",
  "phonics-begin",
  "phonics-vowels",
  "logic",
  "logic-size",
  "logic-odd",
];

const GAME_CODE_TO_QUEST: Record<string, QuestGameKey> = {
  colors_sort: "colors",
  colors_balloons: "colors-balloons",
  colors_paint: "colors-paint",
  shapes_match: "shapes",
  shapes: "shapes",
  shapes_shadow: "shapes-shadow",
  shapes_trace: "shapes-trace",
  letters_trace: "letters",
  letters: "letters",
  letters_mama: "letters-mama",
  letters_train: "letters-train",
  numbers_count: "numbers",
  numbers: "numbers",
  numbers_feed: "numbers-feed",
  numbers_dots: "numbers-dots",
  phonics_sound: "phonics",
  phonics_sound_match: "phonics",
  phonics: "phonics",
  phonics_begin: "phonics-begin",
  phonics_vowels: "phonics-vowels",
  logic_pattern: "logic",
  logic: "logic",
  logic_size: "logic-size",
  logic_odd: "logic-odd",
};

function timedStarsKey(childId: string, game: QuestGameKey) {
  return `questStarsTimed:${childId}:${game}`;
}

function getTimedStarFlags(childId: string, game: QuestGameKey, levelCount = 3): boolean[] {
  try {
    const raw = JSON.parse(localStorage.getItem(timedStarsKey(childId, game)) || "[]");
    const list = Array.isArray(raw) ? raw.map(Boolean) : [];
    return Array.from({ length: levelCount }, (_, index) => Boolean(list[index]));
  } catch {
    return Array.from({ length: levelCount }, () => false);
  }
}

function setTimedStarFlag(childId: string, game: QuestGameKey, levelIndex: number, levelCount = 3) {
  const next = getTimedStarFlags(childId, game, levelCount);
  next[levelIndex] = true;
  localStorage.setItem(timedStarsKey(childId, game), JSON.stringify(next));
}

/** Map keeps the best stars; the in-game HUD still shows the current run. */
export function saveQuestLevelStars(
  childId: string,
  game: QuestGameKey,
  levelIndex: number,
  stars: number,
  levelCount = 3
): number[] {
  const next = getQuestLevelStars(childId, game, levelCount);
  next[levelIndex] = Math.max(next[levelIndex] ?? 0, stars);
  localStorage.setItem(starsStorageKey(childId, game), JSON.stringify(next));
  setTimedStarFlag(childId, game, levelIndex, levelCount);
  return next;
}

function fillEmptyStars(
  childId: string,
  game: QuestGameKey,
  levelIndex: number,
  stars: number,
  levelCount = 3
): number[] {
  if (getTimedStarFlags(childId, game, levelCount)[levelIndex]) {
    return getQuestLevelStars(childId, game, levelCount);
  }
  const next = getQuestLevelStars(childId, game, levelCount);
  if ((next[levelIndex] ?? 0) > 0) return next;
  next[levelIndex] = stars;
  localStorage.setItem(starsStorageKey(childId, game), JSON.stringify(next));
  return next;
}

/** Old records have no leftover-time. A finish is treated as on-time, then misses cap the stars. */
export function starsFromLastActivity(row: {
  finished: boolean;
  score: number;
  wrongAttempts?: number;
}): number {
  const wrong = row.wrongAttempts ?? 0;
  const tried = row.finished || row.score > 0 || wrong > 0;
  if (!tried) return 0;
  if (!row.finished || wrong >= GAME_OVER_WRONG_ATTEMPTS) {
    return starsForResult({ finished: false, tried: true, wrongAttempts: wrong });
  }
  return starsForResult({ finished: true, timeLeft: 9, wrongAttempts: wrong });
}

export function questKeyFromGameCode(gameCode: string): QuestGameKey | null {
  const exact = GAME_CODE_TO_QUEST[gameCode];
  if (exact) return exact;
  const dashed = gameCode.replace(/_/g, "-") as QuestGameKey;
  return QUEST_GAME_KEYS.includes(dashed) ? dashed : null;
}

/** Fill empty map stars from unlocks already on this device. */
export function backfillQuestStarsFromUnlocks(childId: string, levelCount = 3) {
  for (const game of QUEST_GAME_KEYS) {
    const unlocked = getUnlockedQuestLevelCount(childId, game);
    const finishedCount = Math.max(0, unlocked - 1);
    for (let index = 0; index < finishedCount; index += 1) {
      fillEmptyStars(childId, game, index, 3, levelCount);
    }
  }
}

function setHistoryStars(
  childId: string,
  game: QuestGameKey,
  levelIndex: number,
  stars: number,
  levelCount = 3
) {
  if (stars <= 0) return;
  if (getTimedStarFlags(childId, game, levelCount)[levelIndex]) return;
  const next = getQuestLevelStars(childId, game, levelCount);
  next[levelIndex] = stars;
  localStorage.setItem(starsStorageKey(childId, game), JSON.stringify(next));
}

export function applyLastActivityStars(
  childId: string,
  gameCode: string,
  row: { finished: boolean; score: number; wrongAttempts?: number },
  levelCount = 3
) {
  applyHistoryStars(childId, gameCode, [row], levelCount);
}

/** Map clouds to attempt history with the same miss caps as live play. */
export function applyHistoryStars(
  childId: string,
  gameCode: string,
  attempts: Array<{ finished: boolean; score: number; wrongAttempts?: number }>,
  levelCount = 3
) {
  const game = questKeyFromGameCode(gameCode);
  if (!game || attempts.length === 0) return;
  const unlocked = getUnlockedQuestLevelCount(childId, game);
  const finished = attempts.filter((row) => row.finished);
  const lastFinished = unlocked >= 3 ? 2 : Math.max(0, unlocked - 2);

  finished.forEach((row, index) => {
    const levelIndex = lastFinished - index;
    if (levelIndex < 0) return;
    setHistoryStars(childId, game, levelIndex, starsFromLastActivity(row), levelCount);
  });

  const unfinished = attempts.find((row) => !row.finished && starsFromLastActivity(row) > 0);
  if (!unfinished) return;
  const current = Math.min(levelCount - 1, Math.max(0, unlocked - 1));
  const alreadyFinished = finished.some((_, index) => lastFinished - index === current);
  if (alreadyFinished) return;
  setHistoryStars(childId, game, current, starsFromLastActivity(unfinished), levelCount);
}

/** How many levels the child may open (1, 2, or 3). Level 1 is always open. */
export function getUnlockedQuestLevelCount(childId: string, game: QuestGameKey): number {
  const raw = Number(localStorage.getItem(storageKey(childId, game)) || "1");
  if (!Number.isFinite(raw)) return 1;
  return Math.min(3, Math.max(1, Math.floor(raw)));
}

/** After finishing 0-based `completedLevelIndex`, the next level unlocks. */
export function markQuestLevelComplete(childId: string, game: QuestGameKey, completedLevelIndex: number): number {
  const next = Math.min(3, Math.max(getUnlockedQuestLevelCount(childId, game), completedLevelIndex + 2));
  localStorage.setItem(storageKey(childId, game), String(next));
  return next;
}

export function useQuestLevelGate(gameKey: QuestGameKey, levelCount = 3) {
  const [mapOpen, setMapOpen] = useState(true);
  const [unlockedCount, setUnlockedCount] = useState(1);
  const [levelStars, setLevelStars] = useState<number[]>(() => Array.from({ length: levelCount }, () => 0));

  const refreshUnlocks = useCallback(async () => {
    const childId = await getOrCreateActiveChildId();
    if (!childId) return;
    backfillQuestStarsFromUnlocks(childId, levelCount);
    try {
      const { getRecentChildAttempts } = await import("../../../lib/supabaseData");
      const rows = await getRecentChildAttempts(childId, 200);
      const byGame = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = questKeyFromGameCode(row.gameCode);
        if (!key) continue;
        const list = byGame.get(key) ?? [];
        list.push(row);
        byGame.set(key, list);
      }
      for (const attempts of byGame.values()) {
        applyHistoryStars(childId, attempts[0].gameCode, attempts, levelCount);
      }
    } catch {
      // Offline or no history: unlocks on this device are enough.
    }
    setUnlockedCount(getUnlockedQuestLevelCount(childId, gameKey));
    setLevelStars(getQuestLevelStars(childId, gameKey, levelCount));
  }, [gameKey, levelCount]);

  useEffect(() => {
    void refreshUnlocks();
  }, [refreshUnlocks, mapOpen]);

  const recordLevelResult = useCallback(async (levelIndex: number, result: LevelStarResult) => {
    const childId = await getOrCreateActiveChildId();
    if (!childId) return;
    setLevelStars(saveQuestLevelStars(childId, gameKey, levelIndex, starsForResult(result), levelCount));
  }, [gameKey, levelCount]);

  const completeLevel = useCallback(async (levelIndex: number, result?: LevelStarResult) => {
    const childId = await getOrCreateActiveChildId();
    if (!childId) return;
    setUnlockedCount(markQuestLevelComplete(childId, gameKey, levelIndex));
    if (result) {
      setLevelStars(saveQuestLevelStars(
        childId,
        gameKey,
        levelIndex,
        starsForResult({ finished: true, ...result }),
        levelCount
      ));
    }
  }, [gameKey, levelCount]);

  return { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult, refreshUnlocks };
}

export function useStarTimeUp(
  timeUpOpen: boolean,
  levelIndex: number,
  tried: boolean,
  recordLevelResult: (levelIndex: number, result: LevelStarResult) => void | Promise<void>,
  wrongAttempts = 0
) {
  useEffect(() => {
    if (!timeUpOpen) return;
    void recordLevelResult(levelIndex, { finished: false, tried, wrongAttempts });
  }, [timeUpOpen, levelIndex, tried, recordLevelResult, wrongAttempts]);
}

export function useWrongAttemptGameOver(wrong: number, onGameOver: () => void) {
  const fired = useRef(false);
  useEffect(() => {
    if (wrong < GAME_OVER_WRONG_ATTEMPTS) {
      fired.current = false;
      return;
    }
    if (fired.current) return;
    fired.current = true;
    onGameOver();
  }, [wrong, onGameOver]);
}
