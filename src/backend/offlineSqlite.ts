import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite } from "@capacitor-community/sqlite";

const DATABASE_NAME = "learnease";
const LOCAL_CHILDREN_KEY = "offlineChildrenCache";
let initialization: Promise<void> | null = null;

type CachedChild = {
  id: string;
  parentId?: string | null;
  childName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  pinCode?: string | null;
  isActive?: boolean;
};

function readLocalChildren(): CachedChild[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_CHILDREN_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalChildren(children: CachedChild[]): void {
  localStorage.setItem(LOCAL_CHILDREN_KEY, JSON.stringify(children));
}

function upsertLocalChild(child: CachedChild): void {
  const existing = readLocalChildren().find(row => row.id === child.id) ?? { id: child.id };
  const merged: CachedChild = { ...existing, id: child.id };
  (Object.keys(child) as Array<keyof CachedChild>).forEach(key => {
    if (child[key] !== undefined) merged[key] = child[key] as never;
  });
  const children = readLocalChildren().filter(row => row.id !== merged.id);
  children.unshift(merged);
  writeLocalChildren(children.slice(0, 40));
}

const LOCAL_LESSONS_KEY = "offlineLessonsCache";
const LOCAL_PROGRESS_KEY = "offlineCategoryProgress";

type CachedLesson = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  grade_level: string | null;
  video_path: string;
  is_published: number;
};

function readLocalLessons(): CachedLesson[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_LESSONS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalProgress(): Record<string, Array<{ category_code: string; category_score: number }>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS app_session (
    id INTEGER PRIMARY KEY NOT NULL,
    user_id TEXT,
    role TEXT NOT NULL,
    username TEXT,
    password_hash TEXT,
    active_child_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS children (
    id TEXT PRIMARY KEY NOT NULL,
    parent_id TEXT,
    child_name TEXT,
    first_name TEXT,
    last_name TEXT,
    pin_code TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    grade_level TEXT,
    video_path TEXT,
    local_video_key TEXT,
    is_published INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS progress_queue (
    id TEXT PRIMARY KEY NOT NULL,
    child_id TEXT NOT NULL,
    game_code TEXT NOT NULL,
    score INTEGER NOT NULL,
    wrong_attempts INTEGER NOT NULL DEFAULT 0,
    finished INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS upload_queue (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    grade_level TEXT,
    file_name TEXT NOT NULL,
    file_type TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS category_progress (
    child_id TEXT NOT NULL,
    category_code TEXT NOT NULL,
    category_score INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (child_id, category_code)
  );
`;

export function initializeOfflineSqlite(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  if (initialization) return initialization;

  initialization = (async () => {
    try {
      await CapacitorSQLite.createConnection({
        database: DATABASE_NAME,
        version: 1,
        encrypted: false,
        mode: "no-encryption",
        readonly: false,
      });
    } catch (error) {
      // A connection may already exist after a hot reload or app resume.
      if (!String(error).toLowerCase().includes("already exists")) throw error;
    }

    await CapacitorSQLite.open({ database: DATABASE_NAME });
    await CapacitorSQLite.execute({ database: DATABASE_NAME, statements: SCHEMA });
    try {
      await CapacitorSQLite.execute({ database: DATABASE_NAME, statements: "ALTER TABLE app_session ADD COLUMN password_hash TEXT;" });
    } catch {
      // The column already exists on databases initialized with this version.
    }
  })().catch(error => {
    initialization = null;
    console.error("Offline SQLite initialization failed:", error);
    throw error;
  });

  return initialization;
}

async function hashSecret(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function cacheOfflineParentLogin(
  userId: string,
  username: string,
  password: string,
  activeChildId?: string | null
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await initializeOfflineSqlite();
    await CapacitorSQLite.run({
      database: DATABASE_NAME,
      statement: "INSERT OR REPLACE INTO app_session (id, user_id, role, username, password_hash, active_child_id, updated_at) VALUES (1, ?, 'parent', ?, ?, ?, ?)",
      values: [userId, username, await hashSecret(password), activeChildId ?? null, new Date().toISOString()],
    });
  } catch (error) {
    console.warn("Could not cache parent login offline:", error);
  }
}

export async function authenticateOfflineParent(username: string, password: string): Promise<{ id: string; username: string; activeChildId: string | null } | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    await initializeOfflineSqlite();
    const result = await CapacitorSQLite.query({
      database: DATABASE_NAME,
      statement: "SELECT user_id, username, password_hash, active_child_id FROM app_session WHERE id = 1 AND role = 'parent' LIMIT 1",
      values: [],
    });
    const row = result.values?.[0] as { user_id?: string; username?: string; password_hash?: string; active_child_id?: string | null } | undefined;
    const login = username.trim().toLowerCase();
    const storedName = row?.username?.toLowerCase() ?? "";
    if (!row?.user_id || !row.username || (storedName !== login && storedName !== login.split("@")[0]) || row.password_hash !== await hashSecret(password)) return null;
    return { id: row.user_id, username: row.username, activeChildId: row.active_child_id ?? null };
  } catch (error) {
    console.warn("Offline parent login skipped:", error);
    return null;
  }
}

export async function setOfflineActiveChildId(childId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !childId) return;
  await initializeOfflineSqlite();
  await CapacitorSQLite.run({
    database: DATABASE_NAME,
    statement: "UPDATE app_session SET active_child_id = ?, updated_at = ? WHERE id = 1",
    values: [childId, new Date().toISOString()],
  });
}

export async function cacheOfflineChild(child: {
  id: string;
  parentId?: string | null;
  childName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  pinCode?: string | null;
  isActive?: boolean;
}): Promise<void> {
  upsertLocalChild(child);
  if (child.firstName) localStorage.setItem(`childFirstName:${child.id}`, child.firstName);
  if (!Capacitor.isNativePlatform()) return;
  await initializeOfflineSqlite();
  await CapacitorSQLite.run({
    database: DATABASE_NAME,
    statement: `INSERT INTO children (id, parent_id, child_name, first_name, last_name, pin_code, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        parent_id = CASE WHEN ? = 1 THEN excluded.parent_id ELSE children.parent_id END,
        child_name = CASE WHEN ? = 1 THEN excluded.child_name ELSE children.child_name END,
        first_name = CASE WHEN ? = 1 THEN excluded.first_name ELSE children.first_name END,
        last_name = CASE WHEN ? = 1 THEN excluded.last_name ELSE children.last_name END,
        pin_code = CASE WHEN ? = 1 THEN excluded.pin_code ELSE children.pin_code END,
        is_active = CASE WHEN ? = 1 THEN excluded.is_active ELSE children.is_active END,
        updated_at = excluded.updated_at`,
    values: [
      child.id,
      child.parentId ?? null,
      child.childName ?? null,
      child.firstName ?? null,
      child.lastName ?? null,
      child.pinCode ?? null,
      child.isActive === false ? 0 : 1,
      new Date().toISOString(),
      child.parentId !== undefined ? 1 : 0,
      child.childName !== undefined ? 1 : 0,
      child.firstName !== undefined ? 1 : 0,
      child.lastName !== undefined ? 1 : 0,
      child.pinCode !== undefined ? 1 : 0,
      child.isActive !== undefined ? 1 : 0,
    ],
  });
}

/** Forget a child that no longer exists on the server. */
export async function removeOfflineChild(childId: string): Promise<void> {
  writeLocalChildren(readLocalChildren().filter(row => row.id !== childId));
  localStorage.removeItem(`childFirstName:${childId}`);
  if (!Capacitor.isNativePlatform()) return;
  await initializeOfflineSqlite();
  await CapacitorSQLite.run({
    database: DATABASE_NAME,
    statement: "DELETE FROM children WHERE id = ?",
    values: [childId],
  });
}

export async function findOfflineChildrenByPin(pin: string): Promise<CachedChild[]> {
  const cleanPin = pin.trim();
  const localMatches = readLocalChildren().filter(row => row.pinCode === cleanPin && row.isActive !== false);
  const byId = new Map(localMatches.map(row => [row.id, row]));
  if (Capacitor.isNativePlatform()) {
    await initializeOfflineSqlite();
    const result = await CapacitorSQLite.query({
      database: DATABASE_NAME,
      statement: "SELECT id, parent_id, child_name, first_name, last_name, pin_code, is_active FROM children WHERE pin_code = ? AND is_active = 1",
      values: [cleanPin],
    });
    for (const row of result.values ?? []) {
      const id = row.id ? String(row.id) : "";
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        parentId: row.parent_id ?? null,
        childName: row.child_name ?? null,
        firstName: row.first_name ?? null,
        lastName: row.last_name ?? null,
        pinCode: row.pin_code ?? cleanPin,
        isActive: row.is_active !== 0,
      });
    }
  }
  return [...byId.values()];
}

export async function authenticateOfflineChild(pin: string): Promise<string | null> {
  const matches = await findOfflineChildrenByPin(pin);
  return matches.length === 1 ? matches[0].id : null;
}

export async function getOfflineChildById(childId: string): Promise<CachedChild | null> {
  const local = readLocalChildren().find(row => row.id === childId);
  if (local) return local;
  if (!Capacitor.isNativePlatform()) return null;
  await initializeOfflineSqlite();
  const result = await CapacitorSQLite.query({
    database: DATABASE_NAME,
    statement: "SELECT id, parent_id, child_name, first_name, last_name, pin_code, is_active FROM children WHERE id = ? LIMIT 1",
    values: [childId],
  });
  const row = result.values?.[0] as {
    id?: string;
    parent_id?: string | null;
    child_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    pin_code?: string | null;
    is_active?: number;
  } | undefined;
  if (!row?.id) return null;
  return {
    id: String(row.id),
    parentId: row.parent_id ?? null,
    childName: row.child_name ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    pinCode: row.pin_code ?? null,
    isActive: row.is_active !== 0,
  };
}

function mapCachedChildRow(row: CachedChild) {
  return {
    id: row.id,
    parent_id: row.parentId ?? null,
    child_name: row.childName ?? null,
    first_name: row.firstName ?? null,
    last_name: row.lastName ?? null,
    pin_code: row.pinCode ?? null,
    is_active: row.isActive === false ? 0 : 1,
  };
}

export async function getOfflineChildrenFromSqlite(): Promise<Array<{
  id: string;
  parent_id: string | null;
  child_name: string | null;
  first_name: string | null;
  last_name: string | null;
  pin_code: string | null;
  is_active: number;
}>> {
  if (!Capacitor.isNativePlatform()) return readLocalChildren().map(mapCachedChildRow);
  await initializeOfflineSqlite();
  const result = await CapacitorSQLite.query({ database: DATABASE_NAME, statement: "SELECT id, parent_id, child_name, first_name, last_name, pin_code, is_active FROM children ORDER BY updated_at DESC", values: [] });
  const rows = (result.values ?? []) as Array<{ id: string; parent_id: string | null; child_name: string | null; first_name: string | null; last_name: string | null; pin_code: string | null; is_active: number }>;
  return rows.length ? rows : readLocalChildren().map(mapCachedChildRow);
}

export async function cacheOfflineLessons(lessons: Array<{
  id: string;
  title: string;
  description?: string | null;
  category: string;
  gradeLevel?: string | null;
  videoPath: string;
  isPublished?: boolean;
}>): Promise<void> {
  if (lessons.length) {
    const merged = new Map(readLocalLessons().map(lesson => [lesson.id, lesson]));
    lessons.forEach(lesson => merged.set(lesson.id, {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description ?? null,
      category: lesson.category,
      grade_level: lesson.gradeLevel ?? null,
      video_path: lesson.videoPath,
      is_published: lesson.isPublished === false ? 0 : 1,
    }));
    localStorage.setItem(LOCAL_LESSONS_KEY, JSON.stringify([...merged.values()]));
  }
  if (!Capacitor.isNativePlatform() || !lessons.length) return;
  await initializeOfflineSqlite();
  for (const lesson of lessons) {
    await CapacitorSQLite.run({
      database: DATABASE_NAME,
      statement: "INSERT OR REPLACE INTO lessons (id, title, description, category, grade_level, video_path, is_published, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      values: [lesson.id, lesson.title, lesson.description ?? null, lesson.category, lesson.gradeLevel ?? null, lesson.videoPath, lesson.isPublished === false ? 0 : 1, new Date().toISOString()],
    });
  }
}

export async function getOfflineLessonsFromSqlite(): Promise<Array<{ id: string; title: string; description: string | null; category: string; grade_level: string | null; video_path: string; is_published: number }>> {
  if (!Capacitor.isNativePlatform()) return readLocalLessons().filter(lesson => lesson.is_published !== 0);
  await initializeOfflineSqlite();
  const result = await CapacitorSQLite.query({ database: DATABASE_NAME, statement: "SELECT id, title, description, category, grade_level, video_path, is_published FROM lessons WHERE is_published = 1 ORDER BY updated_at DESC", values: [] });
  const rows = (result.values ?? []) as CachedLesson[];
  return rows.length ? rows : readLocalLessons().filter(lesson => lesson.is_published !== 0);
}

export async function cacheOfflineCategoryProgress(childId: string, rows: Array<{ categoryCode: string; categoryScore: number }>): Promise<void> {
  const cache = readLocalProgress();
  cache[childId] = rows.map(row => ({ category_code: row.categoryCode, category_score: Math.round(row.categoryScore || 0) }));
  localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(cache));
  if (!Capacitor.isNativePlatform()) return;
  await initializeOfflineSqlite();
  for (const row of rows) {
    await CapacitorSQLite.run({
      database: DATABASE_NAME,
      statement: "INSERT OR REPLACE INTO category_progress (child_id, category_code, category_score, updated_at) VALUES (?, ?, ?, ?)",
      values: [childId, row.categoryCode, Math.round(row.categoryScore || 0), new Date().toISOString()],
    });
  }
}

export async function getOfflineCategoryProgress(childId: string): Promise<Array<{ category_code: string; category_score: number }>> {
  if (!Capacitor.isNativePlatform()) return readLocalProgress()[childId] ?? [];
  await initializeOfflineSqlite();
  const result = await CapacitorSQLite.query({ database: DATABASE_NAME, statement: "SELECT category_code, category_score FROM category_progress WHERE child_id = ?", values: [childId] });
  const rows = (result.values ?? []) as Array<{ category_code: string; category_score: number }>;
  return rows.length ? rows : (readLocalProgress()[childId] ?? []);
}

export { DATABASE_NAME };
