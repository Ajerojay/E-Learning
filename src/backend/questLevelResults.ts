import { supabase } from "./supabase";
import { rememberEarnedGameCertificate } from "./gameCertificates";

/** Quest keys match the stars saved on the child screen. Three games, three levels each. */
export const SUBJECT_QUEST_GAMES: Record<string, [string, string, string]> = {
  colors: ["colors", "colors-balloons", "colors-paint"],
  shapes: ["shapes", "shapes-shadow", "shapes-trace"],
  letters: ["letters", "letters-mama", "letters-train"],
  numbers: ["numbers", "numbers-feed", "numbers-dots"],
  phonics: ["phonics", "phonics-begin", "phonics-vowels"],
  logic: ["logic", "logic-size", "logic-odd"],
};

const LEVELS = 3;

function clampStars(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(3, Math.max(0, value));
}

function starsKey(childId: string, game: string) {
  return `questStars:${childId}:${game}`;
}

function unlockKey(childId: string, game: string) {
  return `questUnlock:${childId}:${game}`;
}

function timedKey(childId: string, game: string) {
  return `questStarsTimed:${childId}:${game}`;
}

function finishedKey(childId: string, game: string) {
  return `questFinished:${childId}:${game}`;
}

function readNumberList(key: string): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(raw) ? raw.map((value) => Number(value) || 0) : [];
  } catch {
    return [];
  }
}

/** Stars shown on the child level map, including levels already unlocked on this device. */
export function readLocalQuestStars(childId: string): Record<string, number[]> {
  if (!childId || typeof localStorage === "undefined") return {};
  const stars: Record<string, number[]> = {};
  for (const games of Object.values(SUBJECT_QUEST_GAMES)) {
    for (const game of games) {
      const saved = readNumberList(starsKey(childId, game));
      const timed = readNumberList(timedKey(childId, game));
      const unlocked = Math.min(LEVELS, Math.max(1, Math.floor(Number(localStorage.getItem(unlockKey(childId, game)) || "1"))));
      const levels = Array.from({ length: LEVELS }, (_, index) => clampStars(saved[index] ?? 0));
      const finishedCount = Math.max(0, unlocked - 1);
      for (let index = 0; index < finishedCount; index += 1) {
        if (!timed[index] && levels[index] <= 0) levels[index] = 3;
      }
      if (levels.some((value) => value > 0)) stars[game] = levels;
    }
  }
  return stars;
}

export function mergeQuestStars(groups: Array<Record<string, number[]>>): Record<string, number[]> {
  const merged: Record<string, number[]> = {};
  for (const group of groups) {
    for (const [game, levels] of Object.entries(group)) {
      const current = merged[game] ?? [0, 0, 0];
      merged[game] = current.map((value, index) => Math.max(value, clampStars(levels[index] ?? 0)));
    }
  }
  return merged;
}

/** 100% only when every level of every game has 3 stars. */
export function scoreFromQuestStars(levelsByGame: Array<number[] | undefined>) {
  let sum = 0;
  let mastered = true;
  let playedGames = 0;
  let completedGames = 0;
  for (const levels of levelsByGame) {
    const row = levels ?? [0, 0, 0];
    const played = row.some((stars) => stars > 0);
    const completed = row.every((stars) => stars > 0);
    if (played) playedGames += 1;
    if (completed) completedGames += 1;
    for (const stars of row) {
      const value = clampStars(stars);
      sum += value;
      if (value < 3) mastered = false;
    }
  }
  const possible = levelsByGame.length * LEVELS * 3;
  const categoryScore = sum <= 0 ? 0 : mastered ? 100 : Math.min(99, Math.round((sum / possible) * 100));
  return { categoryScore, playedGames, completedGames };
}

export async function persistQuestLevelResult(
  childId: string,
  game: string,
  levelIndex: number,
  stars: number,
  wrongAttempts = 0,
  finished = true
) {
  if (!childId || (stars <= 0 && !finished) || levelIndex < 0 || levelIndex > 2) return;
  let existingStars = 0;
  let existingFinished = false;
  try {
    const existing = await supabase
      .from("quest_level_results")
      .select("stars,finished")
      .eq("child_id", childId)
      .eq("game_code", game)
      .eq("level_index", levelIndex)
      .maybeSingle();
    existingStars = clampStars(Number(existing.data?.stars) || 0);
    existingFinished = Boolean(existing.data?.finished);
  } catch (error) {
    console.warn("Could not read the saved level result before syncing:", error);
  }
  try {
    const { error } = await supabase.from("quest_level_results").upsert({
      child_id: childId,
      game_code: game,
      level_index: levelIndex,
      stars: Math.max(existingStars, clampStars(stars)),
      wrong_attempts: Math.max(0, Math.round(wrongAttempts) || 0),
      finished: finished || existingFinished,
      updated_at: new Date().toISOString(),
    }, { onConflict: "child_id,game_code,level_index" });
    if (error && !/quest_level_results|schema cache|does not exist/i.test(error.message)) {
      console.warn("Level result was kept on this device:", error.message);
    }
  } catch (error) {
    console.warn("Level result was kept on this device:", error);
  }
}

export async function syncLocalQuestStars(childId: string) {
  const local = readLocalQuestStars(childId);
  const writes: Array<Promise<void>> = [];
  for (const [game, levels] of Object.entries(local)) {
    const unlocked = Math.min(LEVELS, Math.max(1, Math.floor(Number(localStorage.getItem(unlockKey(childId, game)) || "1"))));
    let finishedLevels: boolean[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(finishedKey(childId, game)) || "[]");
      if (Array.isArray(raw)) finishedLevels = raw.map(Boolean);
    } catch {
      finishedLevels = [];
    }
    levels.forEach((stars, levelIndex) => {
      const finished = Boolean(finishedLevels[levelIndex]) || levelIndex < unlocked - 1;
      if (stars > 0 || finished) {
        writes.push(persistQuestLevelResult(childId, game, levelIndex, stars, 0, finished));
      }
    });
  }
  await Promise.all(writes);
}

/** Restore server progress before the map applies its local locked-level cleanup. */
export async function restoreQuestLevelResults(childId: string) {
  if (!childId || typeof localStorage === "undefined" || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  let data: Array<{ game_code: string; level_index: number; stars: number; finished: boolean }> | null;
  try {
    const result = await supabase
      .from("quest_level_results")
      .select("game_code,level_index,stars,finished")
      .eq("child_id", childId);
    if (result.error || !result.data) {
      if (result.error && !/quest_level_results|schema cache|does not exist/i.test(result.error.message)) {
        console.warn("Saved level results could not be restored:", result.error.message);
      }
      return;
    }
    data = result.data;
  } catch (error) {
    console.warn("Saved level results could not be restored; keeping device progress:", error);
    return;
  }

  const remoteStars: Record<string, number[]> = {};
  const remoteFinished: Record<string, boolean[]> = {};
  for (const row of data) {
    const game = String(row.game_code || "");
    const index = Number(row.level_index);
    if (!game || index < 0 || index >= LEVELS) continue;
    const levels = remoteStars[game] ?? [0, 0, 0];
    levels[index] = Math.max(levels[index], clampStars(Number(row.stars) || 0));
    remoteStars[game] = levels;
    const finished = remoteFinished[game] ?? [false, false, false];
    finished[index] = finished[index] || Boolean(row.finished);
    remoteFinished[game] = finished;
  }

  for (const [game, levels] of Object.entries(remoteStars)) {
    const saved = readNumberList(starsKey(childId, game));
    const merged = Array.from({ length: LEVELS }, (_, index) =>
      Math.max(clampStars(saved[index] ?? 0), levels[index] ?? 0)
    );
    localStorage.setItem(starsKey(childId, game), JSON.stringify(merged));

    const savedFinished = readNumberList(finishedKey(childId, game)).map(Boolean);
    const finished = Array.from({ length: LEVELS }, (_, index) =>
      Boolean(savedFinished[index]) || Boolean(remoteFinished[game]?.[index])
    );
    localStorage.setItem(finishedKey(childId, game), JSON.stringify(finished));
    if (finished.every(Boolean)) {
      rememberEarnedGameCertificate(childId, game, merged);
    }

    const currentUnlocked = Math.min(LEVELS, Math.max(1, Math.floor(Number(localStorage.getItem(unlockKey(childId, game)) || "1"))));
    let restoredUnlocked = 1;
    for (let index = 0; index < LEVELS - 1 && finished[index]; index += 1) {
      restoredUnlocked = index + 2;
    }
    localStorage.setItem(unlockKey(childId, game), String(Math.max(currentUnlocked, restoredUnlocked)));

    const timed = readNumberList(timedKey(childId, game)).map(Boolean);
    for (let index = 0; index < LEVELS; index += 1) {
      if ((levels[index] ?? 0) > 0) timed[index] = true;
    }
    localStorage.setItem(timedKey(childId, game), JSON.stringify(timed));
  }
}

export async function fetchQuestLevelResults(childId: string): Promise<Record<string, number[]>> {
  const { data, error } = await supabase
    .from("quest_level_results")
    .select("game_code,level_index,stars")
    .eq("child_id", childId);
  if (error || !data) return {};
  const stars: Record<string, number[]> = {};
  for (const row of data) {
    const game = String(row.game_code || "");
    const index = Number(row.level_index);
    if (!game || index < 0 || index > 2) continue;
    const levels = stars[game] ?? [0, 0, 0];
    levels[index] = Math.max(levels[index], clampStars(Number(row.stars) || 0));
    stars[game] = levels;
  }
  return stars;
}
