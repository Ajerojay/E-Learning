import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";

type CachedUser = Record<string, unknown> & { role: "teacher" | "parent" };

const DB_NAME = "learnease_offline";
let connection: SQLiteDBConnection | null = null;
const sqlite = new SQLiteConnection(CapacitorSQLite);

async function passwordHash(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username.trim().toLowerCase()}\u0000${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function database() {
  if (!Capacitor.isNativePlatform()) return null;
  if (connection) return connection;
  const existing = await sqlite.isConnection(DB_NAME, false);
  connection = existing.result
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
  const db = connection;
  if (!(await db.isDBOpen()).result) await db.open();
  await db.execute(`CREATE TABLE IF NOT EXISTS offline_logins (
    username TEXT PRIMARY KEY NOT NULL,
    password_hash TEXT NOT NULL,
    user_json TEXT NOT NULL,
    verified_at TEXT NOT NULL
  );`);
  return db;
}

export async function cacheVerifiedLogin(username: string, password: string, user: CachedUser) {
  try {
    const db = await database();
    if (!db) return;
    await db.run(
      "INSERT OR REPLACE INTO offline_logins (username, password_hash, user_json, verified_at) VALUES (?, ?, ?, ?)",
      [username.trim().toLowerCase(), await passwordHash(username, password), JSON.stringify(user), new Date().toISOString()]
    );
  } catch (error) {
    console.error("Unable to cache offline login:", error);
  }
}

export async function authenticateOffline(username: string, password: string): Promise<CachedUser | null> {
  try {
    const db = await database();
    if (!db) return null;
    const result = await db.query(
      "SELECT user_json FROM offline_logins WHERE username = ? AND password_hash = ? LIMIT 1",
      [username.trim().toLowerCase(), await passwordHash(username, password)]
    );
    const raw = result.values?.[0]?.user_json;
    if (!raw) return null;
    try { return { ...JSON.parse(raw), offline: true }; }
    catch { return null; }
  } catch (error) {
    console.error("Offline login lookup failed:", error);
    return null;
  }
}
