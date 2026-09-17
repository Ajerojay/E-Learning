import { getActiveChild, getPrimaryGameCode, recordGameAttempt } from "./supabaseData";
import { getOfflineProgress, queueOfflineProgress, removeOfflineProgress } from "./offlineLessonStore";
import { getOfflineChildById } from "./offlineSqlite";

const GAME_CODE_CACHE_KEY = "offlineGameCodes";

const FALLBACK_GAME_CODES: Record<string, string> = {
  phonics: "phonics_sound_match",
  colors: "colors_sort",
  logic: "logic_quest",
  shapes: "shapes_quest",
  letters: "letters_quest",
  numbers: "numbers_quest",
};

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function readCachedGameCodes(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(GAME_CODE_CACHE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function cacheGameCode(categoryCode: string, gameCode: string): void {
  const cached = readCachedGameCodes();
  cached[categoryCode] = gameCode;
  localStorage.setItem(GAME_CODE_CACHE_KEY, JSON.stringify(cached));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("offline-timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadPrimaryGameCodeForCategory(
  categoryCode: string
): Promise<string | null> {
  const cached = readCachedGameCodes()[categoryCode] || FALLBACK_GAME_CODES[categoryCode] || null;
  if (!isOnline()) return cached;

  try {
    const code = await withTimeout(getPrimaryGameCode(categoryCode), 2500);
    if (code) {
      cacheGameCode(categoryCode, code);
      return code;
    }
  } catch (error) {
    console.warn("Using cached game code offline:", categoryCode, error);
  }
  return cached;
}

async function resolveChildParentId(childId: string): Promise<string | null> {
  if (isOnline()) {
    try {
      const child = await withTimeout(getActiveChild(childId), 2500);
      if (child?.parentId) return child.parentId;
    } catch (error) {
      console.warn("Active child lookup failed; using local cache:", error);
    }
  }
  const offline = await getOfflineChildById(childId);
  return offline?.parentId ?? null;
}

export async function recordGameProgressRpc(
  childId: string,
  gameCode: string,
  score: number,
  wrongAttempts: number,
  finished: boolean
): Promise<void> {
  const queue = () => queueOfflineProgress({
    id: `progress-${Date.now()}-${Math.random()}`,
    childId,
    gameCode,
    score,
    wrongAttempts,
    finished,
    createdAt: Date.now(),
  });

  if (!isOnline()) {
    await queue();
    return;
  }

  await syncOfflineProgress();
  const parentId = await resolveChildParentId(childId);
  if (!parentId) {
    await queue();
    return;
  }
  try {
    await recordGameAttempt({ childId, parentId, categoryCode: gameCode.split("_")[0], gameCode, score, wrongAttempts, finished });
  } catch (error) {
    await queue();
    console.error("Game progress queued for later sync:", error);
  }
}

export async function syncOfflineProgress(): Promise<void> {
  if (!isOnline()) return;
  const queued = await getOfflineProgress();
  for (const progress of queued) {
    const parentId = await resolveChildParentId(progress.childId);
    if (!parentId) continue;
    try {
      await recordGameAttempt({
        childId: progress.childId,
        parentId,
        categoryCode: progress.gameCode.split("_")[0],
        gameCode: progress.gameCode,
        score: progress.score,
        wrongAttempts: progress.wrongAttempts,
        finished: progress.finished,
      });
      await removeOfflineProgress(progress.id);
    } catch (error) {
      console.error("Offline progress sync paused:", error);
      return;
    }
  }
}
