import { getActivityConfig } from "./activityConfig";
import { SUBJECT_KEYS, type SubjectKey } from "./childProgress";

export type RewardSubject = SubjectKey;

export const REWARD_SUBJECTS: Array<{
  key: RewardSubject;
  label: string;
  sticker: string;
  certificateTitle: string;
}> = [
  { key: "colors", label: "Colors", sticker: "🎨", certificateTitle: "Color Explorer" },
  { key: "shapes", label: "Shapes", sticker: "🔷", certificateTitle: "Shape Builder" },
  { key: "letters", label: "Letters", sticker: "🔤", certificateTitle: "Letter Star" },
  { key: "numbers", label: "Numbers", sticker: "🔢", certificateTitle: "Number Hero" },
  { key: "phonics", label: "Phonics", sticker: "🔊", certificateTitle: "Sound Scout" },
  { key: "logic", label: "Logic", sticker: "🧩", certificateTitle: "Pattern Pro" },
];

type RewardState = {
  stars: number;
  awardedLevels: string[];
};

function rewardKey(childId: string) {
  return `childRewards:${childId}`;
}

function unlockKey(childId: string, game: RewardSubject) {
  return `questUnlock:${childId}:${game}`;
}

function readState(childId: string): RewardState {
  try {
    const raw = JSON.parse(localStorage.getItem(rewardKey(childId)) || "{}");
    return {
      stars: Number(raw.stars) || 0,
      awardedLevels: Array.isArray(raw.awardedLevels) ? raw.awardedLevels.map(String) : [],
    };
  } catch {
    return { stars: 0, awardedLevels: [] };
  }
}

function writeState(childId: string, state: RewardState) {
  localStorage.setItem(rewardKey(childId), JSON.stringify(state));
}

export function getUnlockedQuestLevels(childId: string, game: RewardSubject): number {
  const raw = Number(localStorage.getItem(unlockKey(childId, game)) || "1");
  if (!Number.isFinite(raw)) return 1;
  return Math.min(3, Math.max(1, Math.floor(raw)));
}

export function recordLevelReward(childId: string, game: RewardSubject, levelIndex: number): number {
  const state = readState(childId);
  const awardId = `${game}:${levelIndex}`;
  if (state.awardedLevels.includes(awardId)) return 0;
  const added = Math.max(0, getActivityConfig(game).starReward);
  state.awardedLevels.push(awardId);
  state.stars += added;
  writeState(childId, state);
  return added;
}

function backfillFromUnlocks(childId: string) {
  for (const subject of SUBJECT_KEYS) {
    const finishedCount = Math.max(0, getUnlockedQuestLevels(childId, subject) - 1);
    for (let level = 0; level < finishedCount; level += 1) {
      recordLevelReward(childId, subject, level);
    }
  }
}

export type ChildRewardSummary = {
  stars: number;
  stickers: Array<{
    key: RewardSubject;
    label: string;
    icon: string;
    earned: boolean;
    complete: boolean;
  }>;
  certificates: Array<{
    key: RewardSubject | "graduate";
    title: string;
    subtitle: string;
    icon: string;
  }>;
};

export function getChildRewardSummary(childId: string | null | undefined): ChildRewardSummary {
  if (!childId) {
    return { stars: 0, stickers: [], certificates: [] };
  }
  backfillFromUnlocks(childId);
  const state = readState(childId);
  const stickers = REWARD_SUBJECTS.map((subject) => {
    const unlocked = getUnlockedQuestLevels(childId, subject.key);
    return {
      key: subject.key,
      label: subject.label,
      icon: subject.sticker,
      earned: unlocked >= 2,
      complete: unlocked >= 3,
    };
  });
  const certificates = REWARD_SUBJECTS.filter((_, index) => stickers[index].complete).map((subject) => ({
    key: subject.key as RewardSubject | "graduate",
    title: subject.certificateTitle,
    subtitle: `Completed all ${subject.label} levels`,
    icon: "📜",
  }));
  if (stickers.every((item) => item.complete)) {
    certificates.push({
      key: "graduate",
      title: "Super Learner",
      subtitle: "Finished every LearnEase quest",
      icon: "🏆",
    });
  }
  return { stars: state.stars, stickers, certificates };
}
