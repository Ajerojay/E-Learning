import { supabase } from "./supabase";
import { getOfflineChildrenFromSqlite } from "./offlineSqlite";
import {
  SUBJECT_QUEST_GAMES,
  fetchQuestLevelResults,
  mergeQuestStars,
  readLocalQuestStars,
  scoreFromQuestStars,
  syncLocalQuestStars,
} from "./questLevelResults";

export type UserRole = "parent" | "teacher";

export type SupabaseUserProfile = {
  username: string;
  usernameNormalized: string;
  role: UserRole;
};

export type SupabaseChild = {
  id: string;
  parentId: string;
  childName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  sex?: string | null;
  gradeLevel?: string | null;
  pinCode?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  isActive: boolean;
  lastActiveAt?: string | null;
};

export type SupabaseAttempt = {
  childId: string;
  parentId: string;
  categoryCode: string;
  gameCode: string;
  gameTitle?: string | null;
  score: number;
  wrongAttempts: number;
  finished: boolean;
  createdAt?: unknown;
};

export type SupabaseLesson = {
  id: string;
  categoryCode: string;
  title: string;
  description?: string | null;
  supabaseVideoPath: string;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  isPublished: boolean;
};

function toChild(row: Record<string, unknown>): SupabaseChild {
  return {
    id: String(row.id),
    parentId: String(row.parent_id ?? ""),
    childName: row.child_name as string | null,
    firstName: row.first_name as string | null,
    lastName: row.last_name as string | null,
    dateOfBirth: row.date_of_birth as string | null,
    sex: row.sex as string | null,
    gradeLevel: row.grade_level as string | null,
    pinCode: row.pin_code as string | null,
    nickname: row.nickname as string | null,
    avatar: row.avatar as string | null,
    isActive: row.is_active !== false && row.is_active !== 0,
    lastActiveAt: row.last_active_at as string | null,
  };
}

export async function getSupabaseUserProfile(uid: string) {
  const { data } = await supabase.from("parents_accounts").select("username").eq("id", uid).maybeSingle();
  return data ? { username: data.username, usernameNormalized: data.username.toLowerCase(), role: "parent" as const } : null;
}

export async function getParentChildren(parentId: string): Promise<SupabaseChild[]> {
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase.from("children_accounts").select("*").eq("parent_id", parentId).order("created_at", { ascending: false });
      if (error) throw error;
      const children = (data ?? []).map(toChild);
      try { localStorage.setItem(`learnease-child-roster:${parentId}`, JSON.stringify(children)); } catch { /* Full storage must not prevent page loading. */ }
      return children;
    } catch { /* Fall back to this parent's saved roster. */ }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(`learnease-child-roster:${parentId}`) || "null");
    if (Array.isArray(saved)) return saved.filter(child => child && child.parentId === parentId && typeof child.id === "string");
  } catch { /* Older or damaged cache: use SQLite instead. */ }
  return (await getOfflineChildrenFromSqlite()).filter(child => child.parent_id === parentId).map(child => toChild(child));
}

export async function getActiveChild(childId: string): Promise<SupabaseChild | null> {
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase.from("children_accounts").select("*").eq("id", childId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const child = toChild(data);
      try { localStorage.setItem(`learnease-child-profile:${childId}`, JSON.stringify(child)); } catch { /* Optional cache. */ }
      return child;
    } catch { /* Existing accounts remain available offline. */ }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(`learnease-child-profile:${childId}`) || "null");
    if (saved?.id === childId && typeof saved.parentId === "string") return saved;
  } catch { /* Use the original device cache below. */ }
  const cached = (await getOfflineChildrenFromSqlite()).find(child => child.id === childId);
  return cached ? toChild(cached) : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function createChildProfile(childId: string | undefined, child: Omit<SupabaseChild, "id">): Promise<string> {
  const row: Record<string, unknown> = {
    parent_id: child.parentId,
    child_name: child.childName,
    first_name: child.firstName,
    last_name: child.lastName,
    date_of_birth: child.dateOfBirth,
    sex: child.sex,
    grade_level: child.gradeLevel,
    pin_code: child.pinCode,
    nickname: child.nickname,
    is_active: child.isActive,
  };
  if (childId && isUuid(childId)) {
    row.id = childId;
  }

  let { data, error } = await supabase.from("children_accounts").insert([row]).select("id").single();

  if (error && /column|schema|does not exist/i.test(error.message)) {
    const fallback: Record<string, unknown> = {
      parent_id: child.parentId,
      child_name: child.childName,
      grade_level: child.gradeLevel,
      pin_code: child.pinCode,
      is_active: child.isActive,
    };
    if (childId && isUuid(childId)) fallback.id = childId;
    const retry = await supabase.from("children_accounts").insert([fallback]).select("id").single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  if (!data) throw new Error("Failed to create child account.");
  return String(data.id);
}

function missingColumnError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message && /column|schema cache|could not find/i.test(error.message));
}

const GAME_CODE_BY_CATEGORY: Record<string, string> = {
  colors: "colors_sort",
  shapes: "shapes_match",
  letters: "letters_trace",
  numbers: "numbers_count",
  phonics: "phonics_sound",
  logic: "logic_pattern",
};

async function resolveLiveGame(gameCode: string) {
  const wanted = GAME_CODE_BY_CATEGORY[gameCode] || gameCode;
  const prefix = wanted.split("_")[0];
  const { data, error } = await supabase.from("learning_games").select("id,game_code,game_title");
  if (error || !data?.length) return null;
  return data.find(row => row.game_code === wanted)
    || data.find(row => row.game_code === gameCode)
    || data.find(row => String(row.game_code).startsWith(prefix))
    || null;
}

export async function recordGameAttempt(attempt: SupabaseAttempt): Promise<string> {
  const full = await supabase.from("game_attempts").insert([{
    child_id: attempt.childId,
    parent_id: attempt.parentId,
    category_code: attempt.categoryCode,
    game_code: attempt.gameCode,
    game_title: attempt.gameTitle,
    score: attempt.score,
    wrong_attempts: attempt.wrongAttempts,
    finished: attempt.finished,
  }]).select("id").single();
  if (!full.error && full.data) return String(full.data.id);
  if (full.error && !missingColumnError(full.error)) throw full.error;

  const game = await resolveLiveGame(attempt.gameCode || attempt.categoryCode);
  if (!game) throw full.error ?? new Error("Unable to match the learning game.");
  const live = await supabase.from("game_attempts").insert([{
    child_id: attempt.childId,
    game_id: game.id,
    score: attempt.score,
    wrong_attempts: attempt.wrongAttempts,
    finished: attempt.finished,
    ...(attempt.finished ? { attempt_finished_at: new Date().toISOString() } : {}),
  }]).select("id").single();
  if (live.error) throw live.error;
  if (!live.data) throw new Error("Failed to record game attempt.");
  return String(live.data.id);
}

type StoredChildAttempt = {
  childId: string;
  parentId: string;
  categoryCode: string;
  gameCode: string;
  gameTitle: string | null;
  score: number;
  wrongAttempts: number;
  finished: boolean;
  created_at: string;
};

type GameLookup = {
  gameCode: string;
  gameTitle: string | null;
  categoryCode: string;
};

let gameCatalogPromise: Promise<Map<string, GameLookup>> | null = null;

async function loadGameCatalog(): Promise<Map<string, GameLookup>> {
  if (!gameCatalogPromise) {
    gameCatalogPromise = (async () => {
      const games = await supabase.from("learning_games").select("id,game_code,game_title,category_id");
      const categories = games.error
        ? { data: [] as Array<{ id: string; code: string }> }
        : await supabase.from("learning_categories").select("id,code");
      const categoryById = new Map((categories.data ?? []).map(row => [String(row.id), String(row.code || "")]));
      const map = new Map<string, GameLookup>();
      for (const row of games.data ?? []) {
        const gameCode = String(row.game_code || "");
        map.set(String(row.id), {
          gameCode,
          gameTitle: (row.game_title as string | null) ?? null,
          categoryCode: categoryById.get(String(row.category_id || "")) || gameCode.split(/[_-\s]/)[0] || "",
        });
      }
      return map;
    })().catch((error) => {
      gameCatalogPromise = null;
      throw error;
    });
  }
  return gameCatalogPromise;
}

function mapStoredAttempt(row: Record<string, unknown>, game?: GameLookup): StoredChildAttempt {
  const gameCode = String(row.game_code || game?.gameCode || "");
  return {
    childId: String(row.child_id ?? ""),
    parentId: row.parent_id ? String(row.parent_id) : "",
    categoryCode: String(row.category_code || game?.categoryCode || gameCode.split(/[_-\s]/)[0] || ""),
    gameCode,
    gameTitle: (row.game_title as string | null) ?? game?.gameTitle ?? null,
    score: Number(row.score) || 0,
    wrongAttempts: Number(row.wrong_attempts) || 0,
    finished: Boolean(row.finished),
    created_at: String(row.created_at || row.attempt_started_at || new Date().toISOString()),
  };
}

export async function getRecentChildAttempts(childId: string, count = 50, finishedOnly = false): Promise<StoredChildAttempt[]> {
  let view = supabase
    .from("v_child_recent_activity")
    .select("child_id,parent_id,category_code,game_code,game_title,score,wrong_attempts,finished,created_at")
    .eq("child_id", childId)
    .order("created_at", { ascending: false })
    .limit(count);
  if (finishedOnly) view = view.eq("finished", true);
  const viewed = await view;
  if (!viewed.error) return (viewed.data ?? []).map(row => mapStoredAttempt(row as Record<string, unknown>));

  let attempts = supabase.from("game_attempts").select("*").eq("child_id", childId).order("created_at", { ascending: false }).limit(count);
  if (finishedOnly) attempts = attempts.eq("finished", true);
  const { data, error } = await attempts;
  if (error) throw error;
  const catalog = await loadGameCatalog();
  return (data ?? []).map(row => mapStoredAttempt(row as Record<string, unknown>, catalog.get(String((row as { game_id?: string }).game_id ?? ""))));
}

/**
 * Side games share the catalog's first game id, so a finished score is the only
 * way to tell them apart. Each entry is the score that game writes.
 */
const SIDE_GAME_SCORE: Record<string, (wrong: number) => number> = {
  colors_balloons: (wrong) => Math.max(40, 100 - wrong * 8),
  colors_paint: (wrong) => Math.max(50, 100 - wrong * 10),
  shapes_shadow: (wrong) => Math.max(40, 100 - wrong * 8),
  shapes_trace: (wrong) => Math.max(50, 100 - wrong * 10),
  letters_mama: (wrong) => Math.max(40, 100 - wrong * 8),
  letters_train: (wrong) => Math.max(40, 100 - wrong * 8),
  numbers_feed: (wrong) => Math.max(40, 100 - wrong * 8),
  numbers_dots: (wrong) => Math.max(40, 100 - wrong * 8),
  phonics_begin: (wrong) => Math.max(40, 100 - wrong * 8),
  phonics_vowels: (wrong) => Math.max(40, 100 - wrong * 8),
  logic_size: (wrong) => Math.max(40, 100 - wrong * 8),
  logic_odd: (wrong) => Math.max(40, 100 - wrong * 8),
};

const SLOT_TO_QUEST: Record<string, string> = {
  colors_sort: "colors",
  colors_balloons: "colors-balloons",
  colors_paint: "colors-paint",
  shapes_match: "shapes",
  shapes_shadow: "shapes-shadow",
  shapes_trace: "shapes-trace",
  letters_trace: "letters",
  letters_mama: "letters-mama",
  letters_train: "letters-train",
  numbers_count: "numbers",
  numbers_feed: "numbers-feed",
  numbers_dots: "numbers-dots",
  phonics_sound: "phonics",
  phonics_begin: "phonics-begin",
  phonics_vowels: "phonics-vowels",
  logic_pattern: "logic",
  logic_size: "logic-size",
  logic_odd: "logic-odd",
};

/** Same miss caps as the child level map. A finished level is treated as on time. */
function starsForWrong(wrong: number) {
  if (wrong >= 20) return 1;
  if (wrong >= 10) return 2;
  if (wrong >= 5) return 2.5;
  return 3;
}

function bestStars(rows: StoredChildAttempt[]) {
  if (!rows.length) return 0;
  return starsForWrong(Math.min(...rows.map((row) => row.wrongAttempts)));
}

function emptyLevels() {
  return [0, 0, 0];
}

/** Older saves share one catalog game, so level stars are rebuilt from those rows. */
function levelsFromAttempts(category: string, rows: StoredChildAttempt[]) {
  const quests = SUBJECT_QUEST_GAMES[category];
  const levels = new Map<string, number[]>();
  if (!quests) return levels;
  const meaningful = rows.filter((row) => row.finished || row.score > 0 || row.wrongAttempts > 0);
  const sideQuests = quests.slice(1);
  const sideRows: StoredChildAttempt[] = [];
  const mainRows: StoredChildAttempt[] = [];

  for (const row of meaningful) {
    const sideHits = sideQuests.filter((quest) => {
      const slot = Object.entries(SLOT_TO_QUEST).find(([, value]) => value === quest)?.[0];
      const formula = slot ? SIDE_GAME_SCORE[slot] : undefined;
      return formula?.(row.wrongAttempts) === row.score;
    });
    const collapsedSide = sideHits.length > 0 && (row.score < 100 || !row.finished);
    if (collapsedSide) sideRows.push(row);
    else mainRows.push(row);
  }

  if (mainRows.some((row) => row.finished && row.score > 0)) {
    const stars = bestStars(mainRows.filter((row) => row.finished && row.score > 0));
    levels.set(quests[0], [stars, stars, stars]);
  } else if (mainRows.length) {
    const maxScore = Math.max(...mainRows.map((row) => row.score));
    const completed = maxScore >= 67 ? 2 : maxScore >= 33 ? 1 : 0;
    const next = emptyLevels();
    if (completed === 0) next[0] = 1;
    for (let index = 0; index < completed; index += 1) {
      const start = index === 0 ? 33 : 67;
      const end = index === 0 ? 67 : 100;
      const band = mainRows.filter((row) => row.score >= start && row.score < end);
      next[index] = bestStars(band.length ? band : mainRows);
    }
    levels.set(quests[0], next);
  }

  const finishedSide = sideRows.filter((row) => row.finished);
  const openSide = sideRows.filter((row) => !row.finished);
  finishedSide.forEach((row, index) => {
    const quest = sideQuests[index];
    if (!quest) return;
    const stars = starsForWrong(row.wrongAttempts);
    levels.set(quest, [stars, stars, stars]);
  });
  const openQuest = sideQuests.find((quest) => !levels.has(quest)) ?? sideQuests[0];
  if (openQuest && openSide.length) {
    const next = levels.get(openQuest) ?? emptyLevels();
    openSide.slice(0, 2).forEach((row, index) => {
      next[index] = Math.max(next[index], starsForWrong(row.wrongAttempts));
    });
    levels.set(openQuest, next);
  }
  return levels;
}

function categoryKeyFromAttempt(categoryCode: string, gameCode: string) {
  const raw = `${categoryCode || gameCode || ""}`.trim().toLowerCase();
  if (!raw) return "";
  const prefix = raw.split(/[_-\s]/)[0] ?? "";
  const aliases: Record<string, string> = {
    color: "colors",
    shape: "shapes",
    letter: "letters",
    number: "numbers",
    num: "numbers",
    phonetic: "phonics",
    pattern: "logic",
  };
  const keys = ["colors", "shapes", "letters", "numbers", "phonics", "logic"];
  if (keys.includes(raw)) return raw;
  if (aliases[raw]) return aliases[raw];
  if (keys.includes(prefix)) return prefix;
  return aliases[prefix] ?? "";
}

async function loadProgressAttempts(childId: string, categories: string[]) {
  const batches = await Promise.all(categories.map(async (category) => {
    const viewed = await supabase
      .from("v_child_recent_activity")
      .select("child_id,parent_id,category_code,game_code,game_title,score,wrong_attempts,finished,created_at")
      .eq("child_id", childId)
      .eq("category_code", category)
      .order("created_at", { ascending: false })
      .limit(200);
    if (viewed.error) return [];
    return (viewed.data ?? []).map((row) => mapStoredAttempt(row as Record<string, unknown>));
  }));
  return batches.flat();
}

export async function getChildCategoryProgress(childId: string) {
  const localStars = readLocalQuestStars(childId);
  const savedStars = await fetchQuestLevelResults(childId);
  const playedStars = mergeQuestStars([savedStars, localStars]);
  const categoriesNeedingAttempts = Object.keys(SUBJECT_QUEST_GAMES).filter((category) => (
    !SUBJECT_QUEST_GAMES[category].some((game) => playedStars[game]?.some((stars) => stars > 0))
  ));
  const attempts = categoriesNeedingAttempts.length
    ? await loadProgressAttempts(childId, categoriesNeedingAttempts)
    : [];
  void syncLocalQuestStars(childId);
  const attemptsByCategory = new Map<string, StoredChildAttempt[]>();
  for (const attempt of attempts) {
    const category = categoryKeyFromAttempt(attempt.categoryCode, attempt.gameCode);
    if (!SUBJECT_QUEST_GAMES[category]) continue;
    const rows = attemptsByCategory.get(category) ?? [];
    rows.push(attempt);
    attemptsByCategory.set(category, rows);
  }

  return Object.keys(SUBJECT_QUEST_GAMES).map((category_code) => {
    const quests = SUBJECT_QUEST_GAMES[category_code];
    const hasLevelStars = quests.some((game) => playedStars[game]?.some((stars) => stars > 0));
    const fromAttempts = hasLevelStars ? new Map<string, number[]>() : levelsFromAttempts(category_code, attemptsByCategory.get(category_code) ?? []);
    const levels = quests.map((game) => {
      const saved = playedStars[game];
      if (saved?.some((stars) => stars > 0)) return saved;
      return fromAttempts.get(game) ?? [0, 0, 0];
    });
    const scored = scoreFromQuestStars(levels);
    return {
      category_code,
      category_score: scored.categoryScore,
      played_games_in_category: scored.playedGames,
      completed_games_in_category: scored.completedGames,
      total_games_in_category: quests.length,
    };
  }).filter((row) => row.category_score > 0 || row.played_games_in_category > 0);
}

export async function getChildOverallProgress(childId: string) {
  const rows = await getChildCategoryProgress(childId);
  return rows.length ? Math.round(rows.reduce((sum, row) => sum + row.category_score, 0) / rows.length) : 0;
}

export async function getLatestChildAttempt(childId: string) {
  const attempts = await getRecentChildAttempts(childId, 1);
  return attempts[0] ?? null;
}

export type RecentClassActivityRow = {
  id: string;
  childId: string;
  categoryCode: string;
  gameCode: string;
  gameTitle: string;
  score: number;
  finished: boolean;
  createdAt: string;
};

function mapActivityRow(row: Record<string, unknown>, index: number, game?: { game_code?: string | null; game_title?: string | null } | null): RecentClassActivityRow {
  const gameCode = String(row.game_code || game?.game_code || "");
  return {
    id: String(row.id ?? `${row.child_id}-${row.created_at}-${index}`),
    childId: String(row.child_id ?? ""),
    categoryCode: String(row.category_code || gameCode.split("_")[0] || ""),
    gameCode,
    gameTitle: String(row.game_title || game?.game_title || "Learning game"),
    score: Number(row.score) || 0,
    finished: Boolean(row.finished),
    createdAt: String(row.created_at || row.attempt_started_at || ""),
  };
}

export async function getRecentClassActivity(limit = 25): Promise<RecentClassActivityRow[]> {
  const view = await supabase.from("v_child_recent_activity").select("child_id,category_code,game_code,game_title,score,finished,created_at").order("created_at", { ascending: false }).limit(limit);
  if (!view.error) return (view.data ?? []).map((row, index) => mapActivityRow(row as Record<string, unknown>, index));

  const attempts = await supabase.from("game_attempts").select("*").order("created_at", { ascending: false }).limit(limit);
  if (attempts.error) {
    console.error("Teacher recent activity error:", view.error.message);
    return [];
  }
  const games = await supabase.from("learning_games").select("id,game_code,game_title");
  const gameMap = new Map((games.data ?? []).map(game => [String(game.id), game]));
  return (attempts.data ?? []).map((row, index) => mapActivityRow(row as Record<string, unknown>, index, gameMap.get(String((row as { game_id?: string }).game_id ?? ""))));
}

export async function getAllChildren(): Promise<SupabaseChild[]> {
  const { data, error } = await supabase.from("children_accounts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toChild);
}

export async function updateChild(childId: string, updates: Partial<SupabaseChild>): Promise<void> {
  const { error } = await supabase.from("children_accounts").update({
    child_name: updates.childName,
    first_name: updates.firstName,
    last_name: updates.lastName,
    date_of_birth: updates.dateOfBirth,
    sex: updates.sex,
    grade_level: updates.gradeLevel,
    pin_code: updates.pinCode,
    nickname: updates.nickname,
    is_active: updates.isActive,
  }).eq("id", childId);
  if (error) throw error;
}

export async function getPrimaryGameCode(categoryCode: string): Promise<string | null> {
  const { data, error } = await supabase.from("learning_games").select("game_code").eq("category_code", categoryCode).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!error) return data?.game_code ?? GAME_CODE_BY_CATEGORY[categoryCode] ?? null;
  if (!missingColumnError(error)) throw error;
  const game = await resolveLiveGame(categoryCode);
  return game?.game_code ?? GAME_CODE_BY_CATEGORY[categoryCode] ?? null;
}

export async function getPublishedLesson(categoryCode: string, gradeLevel?: string | null) {
  let query = supabase.from("video_lessons").select("id,title,description,grade_level,category,video_path,is_published").eq("category", categoryCode).eq("is_published", true).order("created_at", { ascending: false }).limit(10);
  if (gradeLevel) query = query.eq("grade_level", gradeLevel);
  const { data, error } = await query;
  if (error) throw error;
  const row = data?.[0];
  return row ? { id: String(row.id), categoryCode: row.category, title: row.title, description: row.description, supabaseVideoPath: row.video_path, isPublished: row.is_published } : null;
}

export async function getPublishedLessons(): Promise<SupabaseLesson[]> {
  const { data, error } = await supabase.from("video_lessons").select("id,title,description,grade_level,category,video_path,is_published").eq("is_published", true).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => ({ id: String(row.id), categoryCode: row.category, title: row.title, description: row.description, supabaseVideoPath: row.video_path, isPublished: row.is_published }));
}

export async function saveLesson(lessonId: string, lesson: Omit<SupabaseLesson, "id">): Promise<void> {
  const { error } = await supabase.from("video_lessons").upsert({ id: lessonId, title: lesson.title, description: lesson.description, category: lesson.categoryCode, video_path: lesson.supabaseVideoPath, is_published: lesson.isPublished });
  if (error) throw error;
}

export async function updateLesson(lessonId: string, updates: Partial<SupabaseLesson>): Promise<void> {
  const { error } = await supabase.from("video_lessons").update({ title: updates.title, description: updates.description, category: updates.categoryCode, video_path: updates.supabaseVideoPath, is_published: updates.isPublished }).eq("id", lessonId);
  if (error) throw error;
}

export type ParentAnnouncementKind = "classroom" | "health" | "attendance";

export type ParentAnnouncement = {
  id: string;
  title: string;
  body: string;
  createdAt: string | null;
  kind: ParentAnnouncementKind;
  pinned: boolean;
};

function isSchemaError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message && /column|schema cache|could not find/i.test(error.message));
}

function announcementKind(row: Record<string, unknown>): ParentAnnouncementKind {
  const kind = String(row.kind || row.type || "").toLowerCase();
  if (kind === "attendance") return "attendance";
  if (kind === "health") return "health";
  if (row.is_pinned === true || row.pinned === true) return "health";
  if (row.target_all === false) return "health";
  return "classroom";
}

function mapAnnouncementRows(rows: Array<Record<string, unknown>> | null): ParentAnnouncement[] {
  return (rows ?? []).map((row) => {
    const kind = announcementKind(row);
    return {
      id: String(row.id ?? `${row.title ?? "announcement"}-${row.created_at ?? ""}`),
      title: String(row.title || row.headline || "Announcement"),
      body: String(row.body || row.message || row.content || ""),
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      kind,
      pinned: kind === "health" || row.is_pinned === true || row.pinned === true,
    };
  });
}

function isForParent(row: Record<string, unknown>, parentId: string) {
  if (row.is_active === false) return false;
  const rowParentId = row.parent_id ? String(row.parent_id) : "";
  if (rowParentId) return rowParentId === parentId;
  if (row.target_all === true) return true;
  if (row.created_by && String(row.created_by) === parentId) return true;
  return row.target_all == null && !row.created_by;
}

export async function getParentAnnouncements(parentId?: string, _childId?: string): Promise<ParentAnnouncement[]> {
  if (!parentId) return [];

  const lookups = [
    () => supabase.from("parent_announcements").select("*").or(`target_all.eq.true,created_by.eq.${parentId}`).order("created_at", { ascending: false }).limit(40),
    () => supabase.from("parent_announcements").select("*").or(`parent_id.eq.${parentId},target_all.eq.true,created_by.eq.${parentId}`).order("created_at", { ascending: false }).limit(40),
  ];

  let rows: Array<Record<string, unknown>> | null = null;
  for (const lookup of lookups) {
    const { data, error } = await lookup();
    if (!error) {
      rows = (data ?? []) as Array<Record<string, unknown>>;
      break;
    }
    if (!isSchemaError(error)) {
      console.error("Parent announcements lookup error:", error.message);
      return [];
    }
  }

  if (!rows) {
    const { data, error } = await supabase.from("parent_announcements").select("*").order("created_at", { ascending: false }).limit(40);
    if (error) {
      console.error("Parent announcements lookup error:", error.message);
      return [];
    }
    rows = (data ?? []) as Array<Record<string, unknown>>;
  }

  const items = mapAnnouncementRows(rows.filter(row => isForParent(row, parentId)));
  return items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  }).slice(0, 12);
}

export async function sendParentAnnouncement(input: {
  title: string;
  message: string;
  kind: ParentAnnouncementKind;
  parentId?: string | null;
  childId?: string | null;
}): Promise<void> {
  const title = input.title.trim() || (input.kind === "health" ? "Health update" : "Announcement");
  const message = input.message.trim();
  if (!message) throw new Error("Message is required.");
  if (input.kind !== "classroom" && !input.parentId) {
    throw new Error("This learner has no linked parent account.");
  }

  const classroom = input.kind === "classroom";
  const payloads: Array<Record<string, unknown>> = classroom
    ? [
        { title, message, target_all: true, is_active: true },
        { title, message, parent_id: null, child_id: input.childId ?? null, kind: "classroom", is_pinned: false, target_all: true, is_active: true },
        { title, message },
      ]
    : input.kind === "health"
      ? [
          { title, message, target_all: false, is_active: true, created_by: input.parentId },
          { title, message, parent_id: input.parentId, child_id: input.childId ?? null, kind: "health", is_pinned: true, target_all: false, is_active: true, created_by: input.parentId },
        ]
      : [
          { title, message, parent_id: input.parentId, child_id: input.childId ?? null, kind: "attendance", is_pinned: false, target_all: false, is_active: true, created_by: input.parentId },
          { title, message, target_all: false, is_active: true, created_by: input.parentId },
        ];

  let lastError: { message?: string } | null = null;
  for (const payload of payloads) {
    const { error } = await supabase.from("parent_announcements").insert(payload);
    if (!error) return;
    lastError = error;
    if (!isSchemaError(error)) throw error;
  }
  throw lastError ?? new Error("Announcement was not sent.");
}
