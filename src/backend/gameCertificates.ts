export const GAME_CERTIFICATE_EVENT = "learnease:game-certificate";

export type GameCertificate = {
  key: string;
  title: string;
  subject: string;
};

export const GAME_CERTIFICATES: GameCertificate[] = [
  { key: "colors", title: "Color Baskets", subject: "Colors" },
  { key: "colors-balloons", title: "Balloon Pop", subject: "Colors" },
  { key: "colors-paint", title: "Fill the Canvas", subject: "Colors" },
  { key: "shapes", title: "Build the House", subject: "Shapes" },
  { key: "shapes-shadow", title: "Shadow Match", subject: "Shapes" },
  { key: "shapes-trace", title: "Tracing the Stars", subject: "Shapes" },
  { key: "letters", title: "Letter Baskets", subject: "Letters" },
  { key: "letters-mama", title: "Mama and Baby", subject: "Letters" },
  { key: "letters-train", title: "Alphabet Train", subject: "Letters" },
  { key: "numbers", title: "Count the Raindrops", subject: "Numbers" },
  { key: "numbers-feed", title: "Feeding Time", subject: "Numbers" },
  { key: "numbers-dots", title: "Connect the Dots", subject: "Numbers" },
  { key: "phonics", title: "Listen and Match", subject: "Phonics" },
  { key: "phonics-begin", title: "Beginning Sounds", subject: "Phonics" },
  { key: "phonics-vowels", title: "The Singing Vowels", subject: "Phonics" },
  { key: "logic", title: "What Comes Next?", subject: "Logic" },
  { key: "logic-size", title: "Big vs. Small", subject: "Logic" },
  { key: "logic-odd", title: "Odd One Out", subject: "Logic" },
];

export function gameCertificateByKey(gameKey: string): GameCertificate | null {
  return GAME_CERTIFICATES.find((game) => game.key === gameKey) ?? null;
}

export function earnedGameCertificates(starsByGame: Record<string, number[]>): GameCertificate[] {
  return GAME_CERTIFICATES.filter((game) => {
    const levels = starsByGame[game.key] ?? [];
    return levels.length >= 3 && levels.slice(0, 3).every((stars) => stars > 0);
  });
}

export type CertificateKind = "certificate" | "appreciation" | "graduation";

function seenKey(childId: string) {
  return `questCertSeen:${childId}`;
}

function readSeen(childId: string): Record<string, CertificateKind> {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey(childId)) || "{}");
    if (Array.isArray(raw)) {
      return Object.fromEntries(raw.map((key) => [String(key), "appreciation" as CertificateKind]));
    }
    if (!raw || typeof raw !== "object") return {};
    const next: Record<string, CertificateKind> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === "certificate" || value === "appreciation" || value === "graduation") next[key] = value;
      else if (value) next[key] = "appreciation";
    }
    return next;
  } catch {
    return {};
  }
}

function writeSeen(childId: string, seen: Record<string, CertificateKind>) {
  localStorage.setItem(seenKey(childId), JSON.stringify(seen));
}

export type GameCertificateAward = {
  childId: string;
  gameKey: string;
  starTotal: number;
  starMax: number;
  perfect: boolean;
};

export function formatStarCount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A perfect game uses Certificate. Any other finish uses Certificate of Appreciation. */
export function certificateKindForGame(perfect: boolean): CertificateKind {
  return perfect ? "certificate" : "appreciation";
}

export function starsEarnedLine(starTotal: number, starMax: number) {
  return `Earned ${formatStarCount(starTotal)} of ${formatStarCount(starMax)} stars`;
}

export function summarizeLevelStars(levels: number[]) {
  const earned = levels.slice(0, 3).map((value) => Number(value) || 0);
  const starTotal = earned.reduce((sum, value) => sum + value, 0);
  const starMax = 9;
  const perfect = earned.length >= 3 && earned.every((value) => value >= 3);
  return { levels: earned, starTotal, starMax, perfect, starsLine: starsEarnedLine(starTotal, starMax) };
}

function firstNameOnly(name: string) {
  return name.trim().split(/\s+/)[0] || "";
}

/** Praise line written from the stars first. A teacher can replace it later. */
export function certificateMessageFor(input: {
  title: string;
  starTotal: number;
  starMax: number;
  kind?: CertificateKind;
  childName?: string;
}) {
  const game = input.title.trim() ? `“${input.title.trim()}”` : "this game";
  const stars = formatStarCount(input.starTotal);
  const max = formatStarCount(input.starMax);
  const first = firstNameOnly(input.childName || "");
  const hi = first ? `, ${first}` : "";
  const ratio = input.starMax > 0 ? input.starTotal / input.starMax : 0;
  if (input.kind === "graduation") {
    if (ratio >= 0.95) return `Congratulations${hi}! You completed every LearnEase game with flying colors!`;
    return `Good job${hi} finishing every game and earning ${stars} of ${max} stars!`;
  }
  if (ratio >= 1 || input.kind === "certificate") {
    return `Congratulations${hi}! You completed ${game} with flying colors!`;
  }
  if (ratio >= 0.8) return `Great job${hi}! You earned ${stars} of ${max} stars in ${game}!`;
  if (ratio >= 0.55) return `Good job${hi} finishing ${game} and earning ${stars} of ${max} stars!`;
  return `You completed ${game}${first ? `, ${first}` : ""}. Keep shining and collect even more stars!`;
}

export type CertificateEdit = {
  kind?: CertificateKind;
  title?: string;
  message?: string;
  date?: string;
};

function editKey(childId: string, certKey: string) {
  return `questCertEdit:${childId}:${certKey}`;
}

export function readCertificateEdit(childId: string, certKey: string): CertificateEdit | null {
  if (!childId || !certKey || typeof localStorage === "undefined") return null;
  try {
    const raw = JSON.parse(localStorage.getItem(editKey(childId, certKey)) || "null");
    if (!raw || typeof raw !== "object") return null;
    return {
      kind: raw.kind === "appreciation" || raw.kind === "graduation" || raw.kind === "certificate" ? raw.kind : undefined,
      title: typeof raw.title === "string" ? raw.title : undefined,
      message: typeof raw.message === "string" ? raw.message : undefined,
      date: typeof raw.date === "string" ? raw.date : undefined,
    };
  } catch {
    return null;
  }
}

export function saveCertificateEdit(childId: string, certKey: string, edit: CertificateEdit) {
  if (!childId || !certKey || typeof localStorage === "undefined") return;
  const current = readCertificateEdit(childId, certKey) ?? {};
  localStorage.setItem(editKey(childId, certKey), JSON.stringify({ ...current, ...edit }));
}

export function resolveCertificateCopy(input: {
  childId?: string | null;
  certKey: string;
  title: string;
  starTotal: number;
  starMax: number;
  kind: CertificateKind;
  childName?: string;
}) {
  const generated = certificateMessageFor(input);
  const saved = input.childId ? readCertificateEdit(input.childId, input.certKey) : null;
  return {
    kind: saved?.kind ?? input.kind,
    title: saved?.title?.trim() || input.title,
    message: saved?.message?.trim() || generated,
    generated,
    date: saved?.date,
  };
}

export const PROGRAM_STAR_MAX = GAME_CERTIFICATES.length * 9;

/** First finish shows Appreciation or Certificate. A later perfect run still shows the gold certificate. */
export function announceGameCertificate(childId: string, gameKey: string, levelStars: number[]) {
  if (!childId || !gameCertificateByKey(gameKey)) return;
  const earned = levelStars.slice(0, 3).map((value) => Number(value) || 0);
  if (earned.length < 3 || earned.some((value) => value <= 0)) return;
  const perfect = earned.every((value) => value >= 3);
  const kind = certificateKindForGame(perfect);
  const seen = readSeen(childId);
  const previous = seen[gameKey];
  if (previous === "certificate" || previous === "graduation") return;
  if (previous && !perfect) return;
  seen[gameKey] = kind;
  writeSeen(childId, seen);
  const detail: GameCertificateAward = {
    childId,
    gameKey,
    starTotal: earned.reduce((sum, value) => sum + value, 0),
    starMax: 9,
    perfect,
  };
  window.dispatchEvent(new CustomEvent(GAME_CERTIFICATE_EVENT, { detail }));
}

/** Rebuild the local award guard from completed levels restored from the server. */
export function rememberEarnedGameCertificate(childId: string, gameKey: string, levelStars: number[]) {
  if (!childId || !gameCertificateByKey(gameKey)) return;
  const earned = levelStars.slice(0, 3).map((value) => Number(value) || 0);
  if (earned.length < 3 || earned.some((value) => value <= 0)) return;
  const kind = certificateKindForGame(earned.every((value) => value >= 3));
  const seen = readSeen(childId);
  if (seen[gameKey] === "certificate" || seen[gameKey] === "graduation") return;
  if (seen[gameKey] === "appreciation" && kind === "appreciation") return;
  seen[gameKey] = kind;
  writeSeen(childId, seen);
}
