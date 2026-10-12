import type { SubjectKey } from "./childProgress";

const CONFIG_KEY = "learnease.activityConfig";

export type ActivityConfig = {
  open: boolean;
  passingScore: number;
  starReward: number;
  levels: string[];
  instructions: string;
  timeLimit: number;
};

const defaults: Record<SubjectKey, ActivityConfig> = {
  colors: { open: true, passingScore: 75, starReward: 15, levels: ["Easy", "Medium", "Hard"], instructions: "Sort each item into the correct color group.", timeLimit: 0 },
  letters: { open: true, passingScore: 75, starReward: 15, levels: ["Easy", "Medium", "Hard"], instructions: "Match each letter with the correct answer.", timeLimit: 0 },
  logic: { open: true, passingScore: 75, starReward: 15, levels: ["Easy", "Medium", "Hard"], instructions: "Pick a logic game, then find patterns, sort by size, or tap the odd one out.", timeLimit: 0 },
  phonics: { open: true, passingScore: 75, starReward: 15, levels: ["Easy", "Medium", "Hard"], instructions: "Listen carefully and select the matching sound.", timeLimit: 0 },
  shapes: { open: true, passingScore: 75, starReward: 15, levels: ["Easy", "Medium", "Hard"], instructions: "Match each shape to the correct place.", timeLimit: 0 },
  numbers: { open: true, passingScore: 75, starReward: 15, levels: ["Easy", "Medium", "Hard"], instructions: "Count carefully and choose the correct number.", timeLimit: 0 },
};

function readConfigs(): Partial<Record<SubjectKey, ActivityConfig>> {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"); }
  catch { return {}; }
}

export function getActivityConfig(category: SubjectKey): ActivityConfig {
  return { ...defaults[category], ...readConfigs()[category] };
}

export function saveActivityConfig(category: SubjectKey, config: ActivityConfig) {
  const current = readConfigs();
  current[category] = config;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(current));
  window.dispatchEvent(new CustomEvent("learnease-activity-config-change", { detail: { category } }));
}

export function isActivityOpen(category: SubjectKey): boolean {
  return getActivityConfig(category).open;
}
