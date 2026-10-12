import { certificateMessageFor, type CertificateKind } from "../../../../backend/gameCertificates";
import certificateImage from "./certificates/certificate.jpg";
import appreciationImage from "./certificates/certificate-appreciation.jpg";
import graduationImage from "./certificates/certificate-graduation.jpg";

export const CERTIFICATE_DOWNLOAD_EVENT = "learnease:certificate-download";
export const CERTIFICATE_REDOWNLOAD_EVENT = "learnease:certificate-redownload";
export const CERTIFICATE_DOWNLOAD_ERROR_EVENT = "learnease:certificate-download-error";
const downloadedCertificatesKey = "learnease:downloaded-certificates";
const activeCertificateDownloads = new Set<string>();

const IMAGES: Record<CertificateKind, string> = {
  certificate: certificateImage,
  appreciation: appreciationImage,
  graduation: graduationImage,
};

/** Positions measured on the 1024×765 certificate artwork. */
export const CERTIFICATE_LAYOUT = {
  nameBaseline: 440 / 765,
  gameY: 498 / 765,
  messageY: 512 / 765,
  starsY: 558 / 765,
  earnedY: 592 / 765,
  dateBaseline: 640 / 765,
  dateX: 773 / 1024,
  nameMaxWidth: 520 / 1024,
  dateMaxWidth: 180 / 1024,
};

const PAPER = "#fffaf4";
const INK = "#1d3f73";
const GOLD = "#e39b18";
const GOLD_EDGE = "#c98412";
const EMPTY = "#e7d7b0";

export function certificateImageFor(kind: CertificateKind) {
  return IMAGES[kind];
}

export function certificateDateText(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fileName(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "game";
  return `LearnEase-${slug}-certificate.png`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Certificate artwork failed to load"));
    image.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, weight: string) {
  let size = startSize;
  while (size > 16) {
    ctx.font = `${weight} ${size}px Nunito, "Trebuchet MS", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  ctx.font = `${weight} ${size}px Nunito, "Trebuchet MS", sans-serif`;
  return size;
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number) {
  let rot = -Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
  for (let point = 0; point < 5; point += 1) {
    rot += Math.PI / 5;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
    rot += Math.PI / 5;
    ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
  }
  ctx.closePath();
}

function drawStarRow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  starTotal: number,
  starMax: number,
  radius: number
) {
  const gap = radius * 2.35;
  const count = Math.max(1, starMax);
  const start = cx - ((count - 1) * gap) / 2;
  const full = Math.floor(starTotal);
  const half = starTotal - full >= 0.5;
  for (let index = 0; index < count; index += 1) {
    const x = start + index * gap;
    ctx.save();
    if (index < full) {
      starPath(ctx, x, cy, radius, radius * 0.42);
      ctx.fillStyle = GOLD;
      ctx.strokeStyle = GOLD_EDGE;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    } else if (index === full && half) {
      starPath(ctx, x, cy, radius, radius * 0.42);
      ctx.fillStyle = EMPTY;
      ctx.strokeStyle = GOLD_EDGE;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - radius, cy - radius, radius, radius * 2);
      ctx.clip();
      starPath(ctx, x, cy, radius, radius * 0.42);
      ctx.fillStyle = GOLD;
      ctx.fill();
      ctx.restore();
    } else {
      starPath(ctx, x, cy, radius, radius * 0.42);
      ctx.fillStyle = "#fffdf8";
      ctx.strokeStyle = EMPTY;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

export async function renderCertificateCanvas(input: {
  childName: string;
  title: string;
  message?: string;
  subtitle?: string;
  kind?: CertificateKind;
  starsLine?: string;
  starTotal?: number;
  starMax?: number;
  dateText?: string;
}) {
  const kind = input.kind ?? "certificate";
  const image = await loadImage(certificateImageFor(kind));
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = image.width * scale;
  canvas.height = image.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const name = input.childName.trim() || "Learner";
  const nameSize = fitFont(ctx, name, canvas.width * CERTIFICATE_LAYOUT.nameMaxWidth, canvas.width * 0.042, "800");
  const nameWidth = ctx.measureText(name).width;
  const nameY = canvas.height * CERTIFICATE_LAYOUT.nameBaseline;
  ctx.fillStyle = PAPER;
  ctx.fillRect(canvas.width / 2 - nameWidth / 2 - 12, nameY - nameSize - 6, nameWidth + 24, nameSize + 14);
  ctx.fillStyle = INK;
  ctx.fillText(name, canvas.width / 2, nameY);

  const message = input.message?.trim() || certificateMessageFor({
    title: input.title,
    starTotal: input.starTotal ?? 0,
    starMax: input.starMax ?? 9,
    kind,
    childName: input.childName,
  });
  const messageSize = fitFont(ctx, message, canvas.width * 0.78, canvas.width * 0.02, "italic 700");
  ctx.fillStyle = INK;
  ctx.font = `italic 700 ${messageSize}px Nunito, "Trebuchet MS", sans-serif`;
  const messageLines = wrapText(ctx, message, canvas.width * 0.78);
  const messageY = canvas.height * CERTIFICATE_LAYOUT.messageY;
  messageLines.forEach((line, index) => {
    ctx.fillText(line, canvas.width / 2, messageY + index * (messageSize + 6));
  });

  const starMax = input.starMax && input.starMax > 0 ? input.starMax : 9;
  const starTotal = Math.max(0, Number(input.starTotal) || 0);
  if (input.starsLine || input.starTotal != null) {
    const rowMax = starMax > 12 ? 10 : Math.round(starMax);
    const rowTotal = starMax > 12 ? (starTotal / starMax) * rowMax : Math.min(starTotal, rowMax);
    drawStarRow(
      ctx,
      canvas.width / 2,
      canvas.height * CERTIFICATE_LAYOUT.starsY,
      rowTotal,
      rowMax,
      canvas.width * (rowMax > 9 ? 0.014 : 0.016)
    );
    const line = input.starsLine || `Earned ${starTotal} of ${starMax} stars`;
    const lineSize = fitFont(ctx, line, canvas.width * 0.7, canvas.width * 0.024, "800");
    ctx.fillStyle = INK;
    ctx.font = `800 ${lineSize}px Nunito, "Trebuchet MS", sans-serif`;
    ctx.fillText(line, canvas.width / 2, canvas.height * CERTIFICATE_LAYOUT.earnedY);
  }

  const dateText = input.dateText ?? certificateDateText();
  const dateSize = fitFont(ctx, dateText, canvas.width * CERTIFICATE_LAYOUT.dateMaxWidth, canvas.width * 0.018, "700");
  const dateX = canvas.width * CERTIFICATE_LAYOUT.dateX;
  const dateY = canvas.height * CERTIFICATE_LAYOUT.dateBaseline;
  const dateWidth = ctx.measureText(dateText).width;
  ctx.fillStyle = PAPER;
  ctx.fillRect(dateX - dateWidth / 2 - 6, dateY - dateSize - 4, dateWidth + 12, dateSize + 10);
  ctx.fillStyle = INK;
  ctx.fillText(dateText, dateX, dateY);

  return canvas;
}

export type CertificateDownloadInput = {
  childName: string;
  title: string;
  message?: string;
  subtitle?: string;
  kind?: CertificateKind;
  certificateId?: string;
  starsLine?: string;
  starTotal?: number;
  starMax?: number;
  dateText?: string;
  allowRepeat?: boolean;
};

function certificateDownloadId(input: CertificateDownloadInput) {
  return input.certificateId || `${input.childName.trim().toLowerCase()}:${input.title.trim().toLowerCase()}`;
}

function readDownloadedCertificates() {
  const stored = localStorage.getItem(downloadedCertificatesKey);
  if (!stored) return new Set<string>();
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) {
    throw new Error("Saved certificate download history is invalid.");
  }
  return new Set(parsed);
}

export async function downloadCertificatePng(input: CertificateDownloadInput) {
  const certificateId = certificateDownloadId(input);
  if (activeCertificateDownloads.has(certificateId)) return;
  activeCertificateDownloads.add(certificateId);
  try {
    const downloaded = readDownloadedCertificates();
    if (downloaded.has(certificateId) && !input.allowRepeat) {
      window.dispatchEvent(new CustomEvent<CertificateDownloadInput>(CERTIFICATE_REDOWNLOAD_EVENT, { detail: input }));
      return;
    }
    const canvas = await renderCertificateCanvas(input);
    if (!canvas) throw new Error("Certificate could not be prepared for download.");
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Certificate image could not be created.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(input.title);
    downloaded.add(certificateId);
    localStorage.setItem(downloadedCertificatesKey, JSON.stringify([...downloaded]));
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.dispatchEvent(new Event(CERTIFICATE_DOWNLOAD_EVENT));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Certificate download failed.";
    window.dispatchEvent(new CustomEvent<string>(CERTIFICATE_DOWNLOAD_ERROR_EVENT, { detail: message }));
  } finally {
    activeCertificateDownloads.delete(certificateId);
  }
}
