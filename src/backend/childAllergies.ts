import { supabase } from "./supabase";
import { CLASSROOM_TEACHER_RECIPIENT, sendAppNotifications } from "./appNotifications";

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

function missingSchema(error: { message?: string } | null | undefined) {
  return Boolean(error?.message && /column|schema cache|could not find|relation|does not exist/i.test(error.message));
}

async function teacherRecipients() {
  const ids = new Set<string>([CLASSROOM_TEACHER_RECIPIENT]);
  const { data, error } = await supabase.from("teacher_profiles").select("teacher_id,full_name");
  if (!error) {
    for (const row of data ?? []) {
      const id = String(row.teacher_id || "").trim();
      if (id) ids.add(id);
      const name = String(row.full_name || "").trim().toLowerCase();
      if (name) ids.add(`username:${name}`);
    }
  }
  return [...ids].map((id) => ({ role: "teacher" as const, id }));
}

async function notifyTeachers(childId: string, items: ChildAllergy[]) {
  if (!items.length) return;
  try {
    const profile = await supabase
      .from("children_accounts")
      .select("child_name,first_name,last_name")
      .eq("id", childId)
      .maybeSingle();
    const childName = String(profile.data?.child_name || "").trim()
      || `${profile.data?.first_name || ""} ${profile.data?.last_name || ""}`.trim()
      || "a learner";
    const body = formatChildAllergies(items);
    await sendAppNotifications({
      recipients: await teacherRecipients(),
      senderRole: "parent",
      senderName: "Parent",
      childId,
      childName,
      kind: "health",
      title: `Allergy card — ${childName}`,
      body: `${childName}'s parent listed: ${body}`,
    });
  } catch (error) {
    console.warn("Could not notify teachers about allergies:", error);
  }
}

async function readRemote(childId: string): Promise<ChildAllergy[] | null> {
  const table = await supabase.from("child_allergies").select("items").eq("child_id", childId).maybeSingle();
  if (!table.error) return parseChildAllergies(table.data?.items);
  const column = await supabase.from("children_accounts").select("parent_allergies").eq("id", childId).maybeSingle();
  if (!column.error) return parseChildAllergies(column.data?.parent_allergies);
  return null;
}

async function writeRemote(childId: string, items: ChildAllergy[]): Promise<boolean> {
  const table = await supabase.from("child_allergies").upsert({
    child_id: childId,
    items,
    updated_at: new Date().toISOString(),
  });
  if (!table.error) {
    await supabase.from("children_accounts").update({ parent_allergies: items }).eq("id", childId);
    return true;
  }
  const column = await supabase.from("children_accounts").update({ parent_allergies: items }).eq("id", childId);
  return !column.error;
}

export async function loadChildAllergies(childId: string): Promise<ChildAllergy[]> {
  const local = readLocalChildAllergies(childId);
  if (!childId) return [];
  try {
    const remote = await readRemote(childId);
    if (remote) {
      writeLocalChildAllergies(childId, remote, false);
      return remote;
    }
  } catch {
    return local;
  }
  return local;
}

export async function saveChildAllergies(childId: string, items: ChildAllergy[]): Promise<{ remote: boolean }> {
  const clean = parseChildAllergies(items);
  writeLocalChildAllergies(childId, clean, true);
  let remote = false;
  try {
    remote = await writeRemote(childId, clean);
    if (!remote) console.warn("Allergy saved on this device only. Run the child_allergies migration so teachers can see it.");
    else if (clean.length) await notifyTeachers(childId, clean);
  } catch (error) {
    console.warn("Could not save allergies:", error);
  }
  return { remote };
}

export async function loadChildAllergyMap(childIds: string[]): Promise<Record<string, ChildAllergy[]>> {
  const map: Record<string, ChildAllergy[]> = {};
  for (const childId of childIds) map[childId] = readLocalChildAllergies(childId);
  if (!childIds.length) return map;
  try {
    const table = await supabase.from("child_allergies").select("child_id, items").in("child_id", childIds);
    if (!table.error) {
      for (const row of table.data ?? []) {
        const childId = String(row.child_id);
        const remote = parseChildAllergies(row.items);
        writeLocalChildAllergies(childId, remote, false);
        map[childId] = remote;
      }
      return map;
    }
    const column = await supabase.from("children_accounts").select("id, parent_allergies").in("id", childIds);
    if (column.error || missingSchema(column.error)) return map;
    for (const row of column.data ?? []) {
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
