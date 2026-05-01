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

export function getLocalUser(): LocalUser | null {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export async function getOrCreateActiveChildId(): Promise<string | null> {
  const cachedChildId = localStorage.getItem(CHILD_ID_KEY);
  if (cachedChildId) return cachedChildId;

  const localUser = getLocalUser();
  if (!localUser?.id || localUser.role !== "parent") {
    return null;
  }

  const { data: existingChild, error: childError } = await supabase
    .from("children_accounts")
    .select("id, pin_code")
    .eq("parent_id", localUser.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (childError) {
    console.error("Failed to load child account:", childError.message);
    return null;
  }

  if (existingChild?.id) {
    localStorage.setItem(CHILD_ID_KEY, existingChild.id);
    if (existingChild.pin_code) {
      localStorage.setItem("studentPin", existingChild.pin_code);
    }
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
  return newChild.id;
}
