import { supabase } from "./supabase";

export const CHILD_AVATAR_IDS = [
  "fox",
  "robot",
  "dino",
  "bee",
  "cat",
  "octopus",
  "bear",
  "hero",
  "unicorn",
] as const;

export type ChildAvatarId = (typeof CHILD_AVATAR_IDS)[number];

const avatarKey = (childId: string) => `childAvatar:${childId}`;
const skipKey = (childId: string) => `childAvatarSkip:${childId}`;
export const CHILD_AVATAR_UPDATED_EVENT = "learnease:child-avatar-updated";

export function isChildAvatarId(value: string): value is ChildAvatarId {
  return (CHILD_AVATAR_IDS as readonly string[]).includes(value);
}

export function normalizeChildAvatar(value: unknown): string {
  const id = String(value ?? "").trim();
  return isChildAvatarId(id) ? id : "";
}

export function getStoredChildAvatar(childId: string | null | undefined): string {
  if (!childId) return "";
  try {
    return normalizeChildAvatar(localStorage.getItem(avatarKey(childId)));
  } catch {
    return "";
  }
}

export function rememberChildAvatar(childId: string, avatarId: string | null | undefined): void {
  const clean = normalizeChildAvatar(avatarId);
  if (!childId || !clean) return;
  localStorage.setItem(avatarKey(childId), clean);
  localStorage.removeItem(skipKey(childId));
  window.dispatchEvent(new CustomEvent(CHILD_AVATAR_UPDATED_EVENT, { detail: { childId, avatarId: clean } }));
}

export function hasSettledChildAvatar(childId: string | null | undefined): boolean {
  if (!childId) return true;
  if (getStoredChildAvatar(childId)) return true;
  try {
    return localStorage.getItem(skipKey(childId)) === "1";
  } catch {
    return false;
  }
}

/** First PIN login after a parent creates the account, before the child has played. */
export async function childNeedsAvatarPick(childId: string): Promise<boolean> {
  if (!childId || hasSettledChildAvatar(childId)) return false;

  const check = async () => {
    const profile = await supabase.from("children_accounts").select("avatar, last_active_at").eq("id", childId).maybeSingle();
    if (!profile.error) {
      const remote = normalizeChildAvatar(profile.data?.avatar);
      if (remote) {
        rememberChildAvatar(childId, remote);
        return false;
      }
      if (profile.data?.last_active_at) {
        localStorage.setItem(skipKey(childId), "1");
        return false;
      }
    }
    const attempts = await supabase.from("game_attempts").select("id").eq("child_id", childId).limit(1);
    if (!attempts.error && (attempts.data?.length ?? 0) > 0) {
      localStorage.setItem(skipKey(childId), "1");
      return false;
    }
    return true;
  };

  try {
    return await Promise.race([
      check(),
      new Promise<boolean>((resolve) => window.setTimeout(() => resolve(true), 2500)),
    ]);
  } catch {
    return true;
  }
}

export async function saveChildAvatar(childId: string, avatarId: string): Promise<void> {
  const clean = normalizeChildAvatar(avatarId);
  if (!childId || !clean) return;
  rememberChildAvatar(childId, clean);
  try {
    const { error } = await supabase.from("children_accounts").update({ avatar: clean }).eq("id", childId);
    if (error && !/column|schema cache|could not find/i.test(error.message)) {
      console.warn("Could not save avatar:", error.message);
    }
  } catch (error) {
    console.warn("Could not save avatar:", error);
  }
}
