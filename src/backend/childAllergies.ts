import { supabase } from "./supabase";

export type ChildAllergy = {
  id: string;
  name: string;
  description: string;
};

export const CHILD_ALLERGIES_UPDATED_EVENT = "learnease:child-allergies-updated";

const storageKey = (childId: string) => `learnease.childAllergies:${childId}`;

export function parseChildAllergies(value: unknown): ChildAllergy[] {
  const rows = Array.isArray(value) ? value : [];
  const items: ChildAllergy[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const name = String((row as { name?: unknown }).name ?? "").trim().slice(0, 80);
    const description = String((row as { description?: unknown }).description ?? "").trim().slice(0, 280);
    if (!name) continue;
    const id = String((row as { id?: unknown }).id ?? "").trim() || `${name}-${items.length}`;
    items.push({ id, name, description });
    if (items.length >= 20) break;
  }
  return items;
}

export function formatChildAllergies(items: ChildAllergy[]): string {
  return items
    .map((item) => (item.description ? `${item.name} — ${item.description}` : item.name))
    .join("; ");
}

function writeLocalChildAllergies(childId: string, items: ChildAllergy[], notify: boolean) {
  localStorage.setItem(storageKey(childId), JSON.stringify(items));
  if (notify) {
    window.dispatchEvent(new CustomEvent(CHILD_ALLERGIES_UPDATED_EVENT, { detail: { childId } }));
  }
}

export function readLocalChildAllergies(childId: string): ChildAllergy[] {
  if (!childId) return [];
  try {
    return parseChildAllergies(JSON.parse(localStorage.getItem(storageKey(childId)) || "[]"));
  } catch {
    return [];
  }
}

function missingColumn(error: { message?: string } | null | undefined) {
  return Boolean(error?.message && /column|schema cache|could not find/i.test(error.message));
}

export async function loadChildAllergies(childId: string): Promise<ChildAllergy[]> {
  const local = readLocalChildAllergies(childId);
  if (!childId) return [];
  try {
    const { data, error } = await supabase
      .from("children_accounts")
      .select("parent_allergies")
      .eq("id", childId)
      .maybeSingle();
    if (error || !data) return local;
    const remote = parseChildAllergies(data.parent_allergies);
    if (remote.length) {
      writeLocalChildAllergies(childId, remote, false);
      return remote;
    }
  } catch {
    return local;
  }
  return local;
}

export async function saveChildAllergies(childId: string, items: ChildAllergy[]): Promise<void> {
  const clean = parseChildAllergies(items);
  writeLocalChildAllergies(childId, clean, true);
  try {
    const { error } = await supabase
      .from("children_accounts")
      .update({ parent_allergies: clean })
      .eq("id", childId);
    if (error && !missingColumn(error)) {
      console.warn("Could not save allergies:", error.message);
    }
  } catch (error) {
    console.warn("Could not save allergies:", error);
  }
}

export async function loadChildAllergyMap(childIds: string[]): Promise<Record<string, ChildAllergy[]>> {
  const map: Record<string, ChildAllergy[]> = {};
  for (const childId of childIds) map[childId] = readLocalChildAllergies(childId);
  if (!childIds.length) return map;
  try {
    const { data, error } = await supabase
      .from("children_accounts")
      .select("id, parent_allergies")
      .in("id", childIds);
    if (error || !data) return map;
    for (const row of data) {
      const childId = String(row.id);
      const remote = parseChildAllergies(row.parent_allergies);
      if (!remote.length) continue;
      writeLocalChildAllergies(childId, remote, false);
      map[childId] = remote;
    }
  } catch {
    return map;
  }
  return map;
}
