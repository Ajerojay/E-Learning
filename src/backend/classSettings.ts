import { supabase } from "./supabase";
import { SUBJECT_KEYS, type SubjectKey } from "./childProgress";
import { getActivityConfig, saveActivityConfig, type ActivityConfig } from "./activityConfig";
import { getStudentGameAccess, saveStudentGameAccess } from "./studentGameAccess";

const PENDING_KEY = "learnease.classSettingsPending";
const ROW_ID = "classroom";

type Pending = {
  activities: SubjectKey[];
  access: string[];
};

function readPending(): Pending {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) || "{}") as Partial<Pending>;
    return {
      activities: Array.isArray(raw.activities) ? raw.activities.filter((key): key is SubjectKey => SUBJECT_KEYS.includes(key)) : [],
      access: Array.isArray(raw.access) ? raw.access.map(String) : [],
    };
  } catch {
    return { activities: [], access: [] };
  }
}

function writePending(pending: Pending) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function queueActivityConfig(category: SubjectKey, config: ActivityConfig) {
  saveActivityConfig(category, config);
  const pending = readPending();
  if (!pending.activities.includes(category)) pending.activities.push(category);
  writePending(pending);
}

export function queueStudentAccess(childId: string, allowed: SubjectKey[]) {
  saveStudentGameAccess(childId, allowed);
  const pending = readPending();
  if (!pending.access.includes(childId)) pending.access.push(childId);
  writePending(pending);
}

export async function syncQueuedClassSettings(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const pending = readPending();
  if (!pending.activities.length && !pending.access.length) return true;

  const current = await supabase.from("class_settings").select("activity_config, student_access").eq("id", ROW_ID).maybeSingle();
  if (current.error) {
    console.error("Class settings sync error:", current.error.message);
    return false;
  }

  const activity = { ...((current.data?.activity_config as Record<string, ActivityConfig> | null) || {}) };
  const access = { ...((current.data?.student_access as Record<string, SubjectKey[]> | null) || {}) };
  pending.activities.forEach(key => { activity[key] = getActivityConfig(key); });
  pending.access.forEach(childId => { access[childId] = getStudentGameAccess(childId); });

  const saved = await supabase.from("class_settings").upsert({
    id: ROW_ID,
    activity_config: activity,
    student_access: access,
    updated_at: new Date().toISOString(),
  });
  if (saved.error) {
    console.error("Class settings save error:", saved.error.message);
    return false;
  }
  writePending({ activities: [], access: [] });
  return true;
}

export async function pullSharedClassSettings(): Promise<void> {
  if (!navigator.onLine) return;
  const { data, error } = await supabase.from("class_settings").select("activity_config, student_access").eq("id", ROW_ID).maybeSingle();
  if (error || !data) {
    if (error) console.warn("Class settings lookup skipped:", error.message);
    return;
  }

  const pending = readPending();
  const activity = (data.activity_config || {}) as Partial<Record<SubjectKey, ActivityConfig>>;
  SUBJECT_KEYS.forEach(key => {
    if (pending.activities.includes(key) || !activity[key]) return;
    saveActivityConfig(key, { ...getActivityConfig(key), ...activity[key] });
  });

  const access = (data.student_access || {}) as Record<string, SubjectKey[]>;
  Object.entries(access).forEach(([childId, allowed]) => {
    if (pending.access.includes(childId) || !Array.isArray(allowed)) return;
    saveStudentGameAccess(childId, allowed);
  });
}

export async function publishActivityConfig(category: SubjectKey, config: ActivityConfig): Promise<"synced" | "queued"> {
  queueActivityConfig(category, config);
  if (!navigator.onLine) return "queued";
  return await syncQueuedClassSettings() ? "synced" : "queued";
}

export async function publishStudentAccess(childId: string, allowed: SubjectKey[]): Promise<"synced" | "queued"> {
  queueStudentAccess(childId, allowed);
  if (!navigator.onLine) return "queued";
  return await syncQueuedClassSettings() ? "synced" : "queued";
}

export function classSettingsStatusMessage(status: "synced" | "queued", syncedText: string) {
  if (status === "synced") return syncedText;
  return navigator.onLine
    ? "Saved on this browser. It will reach students when the classroom connection succeeds."
    : "Saved on this browser. Students will see it when you are back online.";
}
