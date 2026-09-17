import { supabase } from "./supabase";

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
    isActive: row.is_active !== false,
    lastActiveAt: row.last_active_at as string | null,
  };
}

export async function getSupabaseUserProfile(uid: string) {
  const { data } = await supabase.from("parents_accounts").select("username").eq("id", uid).maybeSingle();
  return data ? { username: data.username, usernameNormalized: data.username.toLowerCase(), role: "parent" as const } : null;
}

export async function getParentChildren(parentId: string): Promise<SupabaseChild[]> {
  const { data, error } = await supabase.from("children_accounts").select("*").eq("parent_id", parentId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toChild);
}

export async function getActiveChild(childId: string): Promise<SupabaseChild | null> {
  const { data, error } = await supabase.from("children_accounts").select("*").eq("id", childId).maybeSingle();
  if (error) throw error;
  return data ? toChild(data) : null;
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

export async function recordGameAttempt(attempt: SupabaseAttempt): Promise<string> {
  const { data, error } = await supabase.from("game_attempts").insert([{
    child_id: attempt.childId,
    parent_id: attempt.parentId,
    category_code: attempt.categoryCode,
    game_code: attempt.gameCode,
    game_title: attempt.gameTitle,
    score: attempt.score,
    wrong_attempts: attempt.wrongAttempts,
    finished: attempt.finished,
  }]).select("id").single();
  if (error) throw error;
  if (!data) throw new Error("Failed to record game attempt.");
  return String(data.id);
}

export async function getRecentChildAttempts(childId: string, count = 50) {
  const { data, error } = await supabase.from("game_attempts").select("*").eq("child_id", childId).order("created_at", { ascending: false }).limit(count);
  if (error) throw error;
  return (data ?? []).map(row => ({
    childId: String(row.child_id),
    parentId: String(row.parent_id),
    categoryCode: String(row.category_code ?? ""),
    gameCode: String(row.game_code ?? ""),
    gameTitle: row.game_title as string | null,
    score: Number(row.score) || 0,
    wrongAttempts: Number(row.wrong_attempts) || 0,
    finished: Boolean(row.finished),
    created_at: String(row.created_at ?? new Date().toISOString()),
  }));
}

export async function getChildCategoryProgress(childId: string) {
  const attempts = await getRecentChildAttempts(childId, 500);
  const grouped = new Map<string, number[]>();
  for (const attempt of attempts) grouped.set(attempt.categoryCode, [...(grouped.get(attempt.categoryCode) ?? []), attempt.score]);
  return [...grouped.entries()].map(([category_code, scores]) => ({
    category_code,
    category_score: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    played_games_in_category: scores.length,
    completed_games_in_category: scores.length,
    total_games_in_category: scores.length,
  }));
}

export async function getChildOverallProgress(childId: string) {
  const rows = await getChildCategoryProgress(childId);
  return rows.length ? Math.round(rows.reduce((sum, row) => sum + row.category_score, 0) / rows.length) : 0;
}

export async function getLatestChildAttempt(childId: string) {
  const attempts = await getRecentChildAttempts(childId, 1);
  return attempts[0] ?? null;
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
  if (error) throw error;
  return data?.game_code ?? null;
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

export type ParentAnnouncement = {
  id: string;
  title: string;
  body: string;
  createdAt: string | null;
};

function mapAnnouncementRows(rows: Array<Record<string, unknown>> | null): ParentAnnouncement[] {
  return (rows ?? []).map((row) => ({
    id: String(row.id ?? `${row.title ?? "announcement"}-${row.created_at ?? ""}`),
    title: String(row.title || row.headline || "Announcement"),
    body: String(row.body || row.message || row.content || ""),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  }));
}

export async function getParentAnnouncements(): Promise<ParentAnnouncement[]> {
  const tables = ["announcements", "parent_announcements", "school_announcements"];
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8);
    if (!error) {
      const published = (data as Array<Record<string, unknown>> | null)?.filter(
        (row) => row.is_published !== false && row.published !== false
      ) ?? [];
      return mapAnnouncementRows(published);
    }
  }
  return [];
}
