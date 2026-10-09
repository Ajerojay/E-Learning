import { getActiveChild, getParentChildren, type SupabaseChild } from "./supabaseData";
import { supabase } from "./supabase";
import { authenticateOfflineChild, cacheOfflineChild, findOfflineChildrenByPin, setOfflineActiveChildId } from "./offlineSqlite";
import { getStoredChildAvatar, normalizeChildAvatar, rememberChildAvatar } from "./childAvatar";

type LocalUser = {
  role?: string;
  id?: string;
};

const CHILD_ID_KEY = "activeChildId";
const LAST_CHILD_NAME_KEY = "lastChildFirstName";

export const SUBJECT_KEYS = [
  "colors",
  "shapes",
  "letters",
  "numbers",
  "phonics",
  "logic",
] as const;

export type SubjectKey = (typeof SUBJECT_KEYS)[number];

const SUBJECT_ALIASES: Record<string, SubjectKey> = {
  color: "colors",
  shape: "shapes",
  letter: "letters",
  number: "numbers",
  num: "numbers",
  phonetic: "phonics",
  pattern: "logic",
};

export function normalizeSubjectKey(value: string | null | undefined): SubjectKey | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if ((SUBJECT_KEYS as readonly string[]).includes(raw)) return raw as SubjectKey;
  if (SUBJECT_ALIASES[raw]) return SUBJECT_ALIASES[raw];
  const prefix = raw.split(/[_-\s]/)[0] ?? "";
  if ((SUBJECT_KEYS as readonly string[]).includes(prefix)) return prefix as SubjectKey;
  return SUBJECT_ALIASES[prefix] ?? null;
}

export function getFirstName(name: string): string {
  const clean = name.trim();
  if (!clean) return "Child";
  return clean.split(/\s+/)[0];
}

export type ChildNameRow = {
  first_name?: string | null;
  last_name?: string | null;
  child_name?: string | null;
};

/** Prefer stored first_name; fall back to first word of child_name. */
export function getChildDisplayFirstName(row: ChildNameRow | null): string {
  if (!row) return "Child";
  const first = row.first_name?.trim();
  if (first) return first;
  return getFirstName(row.child_name || "");
}

/** Full label for parent views: "First Last" when available. */
export function getChildDisplayName(row: ChildNameRow | null): string {
  if (!row) return "Child";
  const first = row.first_name?.trim();
  const last = row.last_name?.trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  const full = row.child_name?.trim();
  return full || "Child";
}

export function getLocalUser(): LocalUser | null {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export function rememberChildFirstName(childId: string, name: string): void {
  const clean = name.trim();
  if (!childId || !clean) return;
  localStorage.setItem(`childFirstName:${childId}`, clean);
  localStorage.setItem(LAST_CHILD_NAME_KEY, clean);
}

export function getRememberedChildFirstName(childId?: string | null): string {
  if (childId) {
    return localStorage.getItem(`childFirstName:${childId}`)?.trim() || "";
  }
  return localStorage.getItem(LAST_CHILD_NAME_KEY)?.trim() || "";
}

function firstNameFromCachedChild(child: {
  firstName?: string | null;
  childName?: string | null;
} | null): string {
  if (!child) return "";
  return getChildDisplayFirstName({
    first_name: child.firstName,
    child_name: child.childName,
  });
}

export type PinChildMatch = {
  id: string;
  parentId?: string | null;
  childName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  pinCode?: string | null;
  avatar?: string | null;
};

export async function activateChildPinSession(child: PinChildMatch, pin: string): Promise<void> {
  const cleanPin = pin.trim();
  const name = getChildDisplayFirstName({
    first_name: child.firstName,
    child_name: child.childName,
  });
  localStorage.setItem(CHILD_ID_KEY, child.id);
  localStorage.setItem("studentPin", String(child.pinCode ?? cleanPin));
  rememberChildFirstName(child.id, name);
  await cacheOfflineChild({
    id: child.id,
    parentId: child.parentId ?? null,
    childName: child.childName,
    firstName: child.firstName,
    lastName: child.lastName,
    pinCode: child.pinCode ?? cleanPin,
  });
  await setOfflineActiveChildId(child.id);
}

export async function findChildrenByPin(pin: string): Promise<PinChildMatch[]> {
  const cleanPin = pin.trim();
  if (!cleanPin) return [];

  const byId = new Map<string, PinChildMatch>();
  const offlineMatches = await findOfflineChildrenByPin(cleanPin);
  for (const child of offlineMatches) {
    byId.set(child.id, {
      id: child.id,
      parentId: child.parentId,
      childName: child.childName,
      firstName: child.firstName,
      lastName: child.lastName,
      pinCode: child.pinCode ?? cleanPin,
      avatar: getStoredChildAvatar(child.id) || null,
    });
  }

  try {
    const result = await supabase
      .from("children_accounts")
      .select("id, pin_code, child_name, first_name, last_name, parent_id, avatar")
      .eq("pin_code", cleanPin)
      .eq("is_active", true);
    let rows = result.data ?? [];
    let queryError = result.error;
    if (result.error && /column|schema cache|could not find/i.test(result.error.message)) {
      const fallbackResult = await supabase
        .from("children_accounts")
        .select("id, pin_code, child_name, first_name, last_name, parent_id")
        .eq("pin_code", cleanPin)
        .eq("is_active", true);
      rows = (fallbackResult.data ?? []).map(row => ({ ...row, avatar: null }));
      queryError = fallbackResult.error;
    }
    if (queryError) {
      console.error("PIN lookup:", queryError.message);
    } else {
      for (const row of rows) {
        const id = String(row.id);
        const remoteAvatar = normalizeChildAvatar(row.avatar);
        const avatar = remoteAvatar || getStoredChildAvatar(id) || null;
        if (avatar) rememberChildAvatar(id, avatar);
        byId.set(id, {
          id,
          parentId: row.parent_id ? String(row.parent_id) : null,
          childName: row.child_name,
          firstName: row.first_name,
          lastName: row.last_name,
          pinCode: row.pin_code ?? cleanPin,
          avatar,
        });
      }
    }
  } catch (error) {
    console.warn("PIN lookup unavailable; using offline cache only.", error);
  }

  const matches = [...byId.values()];
  await Promise.all(matches.map(child => cacheOfflineChild({
    id: child.id,
    parentId: child.parentId ?? null,
    childName: child.childName,
    firstName: child.firstName,
    lastName: child.lastName,
    pinCode: child.pinCode ?? cleanPin,
  })));
  return matches.sort((a, b) => getChildDisplayName({
    first_name: a.firstName,
    last_name: a.lastName,
    child_name: a.childName,
  }).localeCompare(getChildDisplayName({
    first_name: b.firstName,
    last_name: b.lastName,
    child_name: b.childName,
  })));
}

export async function linkChildSessionToSupabasePin(pin: string, childId?: string): Promise<boolean> {
  const matches = await findChildrenByPin(pin);
  const child = childId ? matches.find(row => row.id === childId) : matches.length === 1 ? matches[0] : null;
  if (!child) return false;
  await activateChildPinSession(child, pin);
  return true;
}

function childLooksLikePlaceholder(child: {
  childName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
}): boolean {
  const name = getChildDisplayName({
    child_name: child.childName,
    first_name: child.firstName,
    last_name: child.lastName,
  });
  return !name || name === "Child";
}

function pickPreferredChild(children: SupabaseChild[], preferredId?: string | null): SupabaseChild | undefined {
  const active = children.filter((child) => child.isActive !== false);
  const pool = active.length ? active : children;
  if (!pool.length) return undefined;
  if (preferredId) {
    const match = pool.find((child) => child.id === preferredId);
    if (match && !childLooksLikePlaceholder(match)) return match;
  }
  return pool.find((child) => !childLooksLikePlaceholder(child)) || pool[0];
}

function rememberActiveChild(child: SupabaseChild): void {
  localStorage.setItem(CHILD_ID_KEY, child.id);
  if (child.pinCode) localStorage.setItem("studentPin", child.pinCode);
  const name = firstNameFromCachedChild(child);
  if (name && name !== "Child") rememberChildFirstName(child.id, name);
}

export async function getOrCreateActiveChildId(): Promise<string | null> {
  const cachedChildId = localStorage.getItem(CHILD_ID_KEY);
  const localUser = getLocalUser();
  const online = typeof navigator === "undefined" || navigator.onLine;

  if (localUser?.id && localUser.role === "parent" && online) {
    try {
      const existingChildren = await getParentChildren(localUser.id);
      const chosen = pickPreferredChild(existingChildren, cachedChildId);
      if (chosen?.id) {
        rememberActiveChild(chosen);
        return chosen.id;
      }
    } catch (error) {
      console.warn("Could not load children while reconciling the active child.", error);
    }
  }

  if (cachedChildId) return cachedChildId;

  const pin = localStorage.getItem("studentPin");
  if (pin) {
    const offlineChildId = await authenticateOfflineChild(pin);
    if (offlineChildId) {
      localStorage.setItem(CHILD_ID_KEY, offlineChildId);
      return offlineChildId;
    }
  }

  if (!online) return localStorage.getItem(CHILD_ID_KEY);

  if (!localUser?.id || localUser.role !== "parent") {
    if (pin && (await linkChildSessionToSupabasePin(pin))) {
      return localStorage.getItem(CHILD_ID_KEY);
    }
    return null;
  }

  return localStorage.getItem(CHILD_ID_KEY);
}

export async function resolveActiveParentChild(): Promise<SupabaseChild | null> {
  const childId = await getOrCreateActiveChildId();
  const localUser = getLocalUser();
  if (localUser?.id && localUser.role === "parent") {
    try {
      const children = await getParentChildren(localUser.id);
      const chosen = pickPreferredChild(children, childId);
      if (chosen) {
        rememberActiveChild(chosen);
        return chosen;
      }
    } catch (error) {
      console.warn("Could not resolve the parent child roster.", error);
    }
  }
  if (!childId) return null;
  return getActiveChild(childId);
}

const DEVICE_LABEL_KEY = "childDeviceLabel";

export function getPlayfulNickname(
  _firstName: string,
  storedNickname?: string | null
): string {
  const nick = storedNickname?.trim();
  if (nick && nick.toLowerCase() !== "n/a") return nick;
  return "n/a";
}

export function formatChildBirthday(isoDate: string | null | undefined): string {
  if (!isoDate) return "Not set";
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
}

export function getChildAgeLabel(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const born = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(born.getTime())) return "—";
  const today = new Date();
  let years = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) years -= 1;
  if (years < 1) return "Less than 1 year old";
  return years === 1 ? "1 Year Old" : `${years} Years Old`;
}

function detectDeviceLabel(): string {
  const ua = navigator.userAgent;
  const isTablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua);
  const isMobile = /Mobile|iPhone|Android.*Mobile/i.test(ua);
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua)
      ? "Chrome"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "Browser";
  const device = isTablet ? "Tablet" : isMobile ? "Phone" : "Desktop";
  return `${browser} - ${device} (Active)`;
}

export function saveChildDeviceLabel(childId?: string): void {
  const id = childId || localStorage.getItem(CHILD_ID_KEY);
  if (!id) return;
  localStorage.setItem(`${DEVICE_LABEL_KEY}:${id}`, detectDeviceLabel());
}

export function getChildDeviceLabel(childId: string): string | null {
  return localStorage.getItem(`${DEVICE_LABEL_KEY}:${childId}`);
}

export function clearChildDeviceLabel(childId: string): void {
  localStorage.removeItem(`${DEVICE_LABEL_KEY}:${childId}`);
}

export type ChildActivityRow = {
  category_code: string;
  game_code: string;
  game_title: string | null;
  score: number;
  finished: boolean;
  created_at: string;
};

export type ChildCategoryProgressRow = {
  category_code: string;
  category_label?: string | null;
  category_score: number;
  total_games_in_category?: number | null;
  played_games_in_category?: number | null;
  completed_games_in_category?: number | null;
};

export type ChildAchievement = {
  id: string;
  icon: string;
  text: string;
};

function formatCategoryLabel(code: string, label?: string | null): string {
  const trimmed = label?.trim();
  if (trimmed) return trimmed;
  return code.charAt(0).toUpperCase() + code.slice(1);
}

/** Build earned achievement lines from Supabase activity + category progress views. */
export function buildChildAchievements(
  activity: ChildActivityRow[],
  categories: ChildCategoryProgressRow[]
): ChildAchievement[] {
  const earned: ChildAchievement[] = [];
  const addedIds = new Set<string>();

  const push = (item: ChildAchievement) => {
    if (addedIds.has(item.id)) return;
    addedIds.add(item.id);
    earned.push(item);
  };

  const hasFirstFinish =
    activity.some((row) => row.finished) ||
    categories.some((row) => (row.completed_games_in_category ?? 0) > 0);

  if (hasFirstFinish) {
    push({
      id: "first-lesson",
      icon: "✨",
      text: "First lesson complete",
    });
  }

  const modulesCompleted = new Set<string>();

  for (const code of SUBJECT_KEYS) {
    const cat = categories.find((row) => row.category_code === code);
    if (!cat) continue;

    const label = formatCategoryLabel(code, cat.category_label);
    const score = Math.round(cat.category_score ?? 0);

    if (score >= 100) {
      push({
        id: `perfect-${code}`,
        icon: "🏅",
        text: `Perfect Score in ${label}`,
      });
    }

    const total = cat.total_games_in_category ?? 0;
    const completed = cat.completed_games_in_category ?? 0;
    if (total > 0 && completed >= total) {
      modulesCompleted.add(code);
      push({
        id: `module-${code}`,
        icon: "🎆",
        text: `Completed ${label} Module`,
      });
    }
  }

  for (const row of activity) {
    if (!row.finished || row.score < 100) continue;
    const code = row.category_code;
    if (addedIds.has(`perfect-${code}`)) continue;
    const cat = categories.find((c) => c.category_code === code);
    push({
      id: `perfect-${code}`,
      icon: "🏅",
      text: `Perfect Score in ${formatCategoryLabel(code, cat?.category_label)}`,
    });
  }

  const finishedGames = new Map<string, { title: string; category: string }>();
  for (const row of activity) {
    if (!row.finished || !row.game_code) continue;
    if (!finishedGames.has(row.game_code)) {
      finishedGames.set(row.game_code, {
        title: row.game_title?.trim() || formatCategoryLabel(row.category_code),
        category: row.category_code,
      });
    }
  }

  for (const [gameCode, meta] of finishedGames) {
    if (modulesCompleted.has(meta.category)) continue;
    push({
      id: `game-${gameCode}`,
      icon: "⭐",
      text: `Completed ${meta.title}`,
    });
  }

  return earned;
}
