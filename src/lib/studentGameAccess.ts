import { SUBJECT_KEYS, type SubjectKey } from "./childProgress";

const ACCESS_KEY = "learnease.studentGameAccess";

type AccessMap = Record<string, SubjectKey[]>;

function readAccessMap(): AccessMap {
  try { return JSON.parse(localStorage.getItem(ACCESS_KEY) || "{}"); }
  catch { return {}; }
}

export function getStudentGameAccess(childId: string): SubjectKey[] {
  const saved = readAccessMap()[childId];
  return Array.isArray(saved) ? SUBJECT_KEYS.filter(key => saved.includes(key)) : [...SUBJECT_KEYS];
}

export function saveStudentGameAccess(childId: string, allowed: SubjectKey[]) {
  const current = readAccessMap();
  current[childId] = SUBJECT_KEYS.filter(key => allowed.includes(key));
  localStorage.setItem(ACCESS_KEY, JSON.stringify(current));
  window.dispatchEvent(new CustomEvent("learnease-game-access-change", { detail: { childId } }));
}

export function isStudentGameAllowed(childId: string, category: string): boolean {
  return getStudentGameAccess(childId).includes(category.toLowerCase() as SubjectKey);
}
