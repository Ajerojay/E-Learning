import { supabase } from "./supabase";

type LocalUser = {
  role?: string;
  id?: string;
};

const CHILD_ID_KEY = "activeChildId";

export const SUBJECT_KEYS = [
  "colors",
  "shapes",
  "letters",
  "numbers",
  "phonics",
  "logic",
] as const;

export type SubjectKey = (typeof SUBJECT_KEYS)[number];

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

/** Validates PIN against Supabase and sets `activeChildId` + `studentPin` for the student session. */
export async function linkChildSessionToSupabasePin(pin: string): Promise<boolean> {
  const trimmed = pin.trim();
  if (!trimmed) return false;

  const { data: row, error } = await supabase
    .from("children_accounts")
    .select("id, pin_code")
    .eq("pin_code", trimmed)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  console.log("linkChildSessionToSupabasePin: pin lookup result:", { pin: trimmed, row, error });

  if (error) {
    console.error("PIN lookup:", error.message);
    return false;
  }
  if (!row?.id) return false;

  localStorage.setItem(CHILD_ID_KEY, row.id);
  localStorage.setItem("studentPin", row.pin_code || trimmed);
  return true;
}

export async function getOrCreateActiveChildId(): Promise<string | null> {
  const cachedChildId = localStorage.getItem(CHILD_ID_KEY);
  console.log("getOrCreateActiveChildId: cachedChildId", cachedChildId);
  if (cachedChildId) return cachedChildId;

  const localUser = getLocalUser();
  console.log("getOrCreateActiveChildId: localUser", localUser);
  if (!localUser?.id || localUser.role !== "parent") {
    const pin = localStorage.getItem("studentPin");
    if (pin && (await linkChildSessionToSupabasePin(pin))) {
      return localStorage.getItem(CHILD_ID_KEY);
    }
    return null;
  }

  const { data: existingChild, error: childError } = await supabase
    .from("children_accounts")
    .select("id, pin_code")
    .eq("parent_id", localUser.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log("getOrCreateActiveChildId: existingChild query result", { existingChild, childError });
  if (childError) {
    console.error("Failed to load child account:", childError.message);
    return null;
  }

  if (existingChild?.id) {
    localStorage.setItem(CHILD_ID_KEY, existingChild.id);
    if (existingChild.pin_code) {
      localStorage.setItem("studentPin", existingChild.pin_code);
    }
    console.log("getOrCreateActiveChildId: using existingChild.id", existingChild.id);
    return existingChild.id;
  }

  const { data: newChild, error: insertError } = await supabase
    .from("children_accounts")
    .insert([
      {
        parent_id: localUser.id,
        child_name: "Child",
        grade_level: "Kinder",
        pin_code: localStorage.getItem("studentPin") || "1234",
      },
    ])
    .select("id, pin_code")
    .single();

  if (insertError) {
    console.error("Failed to create child account:", insertError.message);
    return null;
  }

  localStorage.setItem(CHILD_ID_KEY, newChild.id);
  if (newChild.pin_code) {
    localStorage.setItem("studentPin", newChild.pin_code);
  }
  console.log("getOrCreateActiveChildId: created new child", newChild);
  return newChild.id;
}

const DEVICE_LABEL_KEY = "childDeviceLabel";

export function getPlayfulNickname(
  firstName: string,
  storedNickname?: string | null
): string {
  const nick = storedNickname?.trim();
  if (nick) return nick;
  const first = firstName.trim();
  if (!first) return "Buddy";
  if (first.length <= 4) return first;
  if (first.endsWith("a") || first.endsWith("ia")) {
    return `${first.slice(0, Math.max(3, first.length - 1))}i`;
  }
  return first.slice(0, 4);
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
