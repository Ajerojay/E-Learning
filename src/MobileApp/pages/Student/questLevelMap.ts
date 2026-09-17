import { useCallback, useEffect, useState } from "react";
import { getOrCreateActiveChildId } from "../../../lib/childProgress";

export type QuestGameKey = "colors" | "shapes" | "letters" | "numbers" | "phonics" | "logic";

function storageKey(childId: string, game: QuestGameKey) {
  return `questUnlock:${childId}:${game}`;
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

export function useQuestLevelGate(gameKey: QuestGameKey) {
  const [mapOpen, setMapOpen] = useState(true);
  const [unlockedCount, setUnlockedCount] = useState(1);

  const refreshUnlocks = useCallback(async () => {
    const childId = await getOrCreateActiveChildId();
    if (childId) setUnlockedCount(getUnlockedQuestLevelCount(childId, gameKey));
  }, [gameKey]);

  useEffect(() => {
    void refreshUnlocks();
  }, [refreshUnlocks, mapOpen]);

  const completeLevel = useCallback(async (levelIndex: number) => {
    const childId = await getOrCreateActiveChildId();
    if (!childId) return;
    setUnlockedCount(markQuestLevelComplete(childId, gameKey, levelIndex));
  }, [gameKey]);

  return { mapOpen, setMapOpen, unlockedCount, completeLevel, refreshUnlocks };
}
