import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreateActiveChildId } from "../../../../../../backend/childProgress";
import { recordGameProgressRpc } from "../../../../../../backend/gameProgressDb";
import { speakKidPrompt } from "../../../../nativeTts";
import { GameOverlay, GamePopup, GamePauseButton, GamePausePopup, GameOverPopup } from "../shared/GamePopup";
import { useQuestLevelGate, useStarTimeUp, useWrongAttemptGameOver } from "../shared/questLevelMap";
import { ColorsMiniChrome, colorsNextLevelButtons, speakNextLevelPrompt } from "./ColorsMiniChrome";
import { useColorsMiniClock, useLandscapeLock } from "../shared/useColorsMiniClock";
import type { LevelIntroContent } from "../shared/levelIntro";
import ColorConfetti from "../shared/ColorConfetti";
import { fillZone, floodFillAt, hexToRgb, punchWhiteBackground, zoneMatchesColor } from "./paintOutline";
import bear from "../../images/bear-2.png";
import carOutline from "../../images/colors/paint/car.png";
import iceCreamOutline from "../../images/colors/paint/icecream.png";
import teddyOutline from "../../images/colors/paint/teddy.png";
import "./ColorsMiniGames.css";

type PaintColor = "red" | "blue" | "yellow" | "green" | "orange" | "pink" | "brown" | "purple";
type Zone = {
  id: string;
  color: PaintColor;
  x: number;
  y: number;
  w: number;
  h: number;
  fx?: number;
  fy?: number;
  seeds?: Array<{ x: number; y: number }>;
};
type SvgPart = { id: string; color: PaintColor; d: string };
type Drawing =
  | { id: string; kind: "svg"; viewBox: string; parts: SvgPart[]; decorations?: string[] }
  | { id: string; kind: "image"; src: string; zones: Zone[]; flood?: boolean };

const PAINT: Record<PaintColor, string> = {
  red: "#ef5b6a",
  blue: "#4d9fff",
  yellow: "#ffe066",
  green: "#62d26f",
  orange: "#ff9f43",
  pink: "#ff8fb8",
  brown: "#c47a3a",
  purple: "#b07cff",
};

const INTRO: LevelIntroContent = {
  title: "Fill the canvas!",
  subtitle: "Tap a paint bucket, then tap the drawing to fill it.",
  speech: "Hi friend! Pick a paint color first. Then tap the picture to fill it.",
  compact: true,
};

const HOUSE_PARTS: SvgPart[] = [
  { id: "roof", color: "red", d: "M28 88 L120 28 L212 88 Z" },
  { id: "wall", color: "yellow", d: "M48 88 H192 V160 H48 Z" },
];

const UMBRELLA_PARTS: SvgPart[] = [
  { id: "umbrella canopy", color: "pink", d: "M20 105 A100 85 0 0 1 220 105 L170 105 Q145 75 120 105 Q95 75 70 105 Z" },
  { id: "umbrella handle", color: "brown", d: "M116 103 H124 V168 Q124 184 140 184 Q151 184 151 173 H159 Q159 192 140 192 Q116 192 116 168 Z" },
];

const SHIRT_PARTS: SvgPart[] = [
  {
    id: "shirt",
    color: "blue",
    d: "M160 25 Q171 54 220 55 Q269 54 280 25 L341 44 Q359 49 371 67 L418 136 Q424 145 415 151 L341 190 L326 166 L324 406 Q324 418 312 420 Q220 432 128 420 Q116 418 116 406 L114 166 L99 190 L25 151 Q16 145 22 136 L69 67 Q81 49 99 44 Z",
  },
];

const SHIRT_DETAILS = [
  "M160 27 Q176 62 220 63 Q264 62 280 27",
  "M169 31 Q183 54 220 55 Q257 54 271 31",
  "M116 399 Q220 410 324 399",
  "M116 408 Q220 419 324 408",
];

const ICE_CREAM_ZONES: Zone[] = [
  { id: "scoop", color: "pink", x: 0.22, y: 0.02, w: 0.56, h: 0.46 },
  { id: "cone", color: "orange", x: 0.28, y: 0.44, w: 0.44, h: 0.52 },
];

const FLOWER_PARTS: SvgPart[] = [
  {
    id: "petals",
    color: "pink",
    d: [
      "M52 38 a28 28 0 1 0 56 0 a28 28 0 1 0 -56 0",
      "M94 48 a28 28 0 1 0 56 0 a28 28 0 1 0 -56 0",
      "M82 88 a28 28 0 1 0 56 0 a28 28 0 1 0 -56 0",
      "M22 88 a28 28 0 1 0 56 0 a28 28 0 1 0 -56 0",
      "M10 48 a28 28 0 1 0 56 0 a28 28 0 1 0 -56 0",
    ].join(" "),
  },
  { id: "center", color: "yellow", d: "M56 62 a24 24 0 1 0 48 0 a24 24 0 1 0 -48 0" },
  { id: "stem", color: "green", d: "M74 84 H86 V168 H74 Z M86 118 Q138 96 90 142 Q86 132 86 124 Z" },
];

const BOAT_PARTS: SvgPart[] = [
  { id: "hull", color: "blue", d: "M18 108 L202 108 L174 150 L46 150 Z" },
  { id: "cabin", color: "yellow", d: "M42 78 H96 V108 H42 Z" },
  { id: "sail", color: "red", d: "M110 18 L110 108 L182 108 Z" },
];

const KITE_PARTS: SvgPart[] = [
  { id: "kite upper left", color: "red", d: "M28 22 L198 34 L123 101 Z" },
  { id: "kite upper right", color: "blue", d: "M198 34 L220 180 L123 101 Z" },
  { id: "kite lower right", color: "yellow", d: "M220 180 L30 125 L123 101 Z" },
  { id: "kite lower left", color: "green", d: "M30 125 L28 22 L123 101 Z" },
];

const KITE_RIBBON_DECORATIONS = [
  "M220 180 C225 189 231 194 238 198",
  "M232 201 L244 209 L232 217 Z",
  "M238 198 L244 209 L254 201 Z",
  "M254 217 C261 222 267 226 274 228",
  "M266 224 L278 232 L266 240 Z",
  "M274 228 L278 232 L288 224 Z",
  "M288 244 C295 249 301 253 308 255",
  "M300 251 L312 259 L300 267 Z",
  "M308 255 L312 259 L322 251 Z",
];

const BUTTERFLY_PARTS: SvgPart[] = [
  {
    id: "butterfly upper wings",
    color: "pink",
    d: "M112 89 C96 52 59 33 37 48 C12 65 31 105 66 111 L114 111 Z M128 89 C144 52 181 33 203 48 C228 65 209 105 174 111 L126 111 Z",
  },
  {
    id: "butterfly lower wings",
    color: "purple",
    d: "M66 111 C53 119 43 133 47 148 C54 171 88 158 114 119 L114 111 Z M174 111 C187 119 197 133 193 148 C186 171 152 158 126 119 L126 111 Z",
  },
  {
    id: "butterfly body",
    color: "orange",
    d: "M120 78 C112 78 108 86 110 96 L113 131 Q120 146 127 131 L130 96 C132 86 128 78 120 78 Z M120 65 A9 9 0 1 0 120 83 A9 9 0 1 0 120 65 Z",
  },
];

const BUTTERFLY_DETAILS = [
  "M117 68 Q110 54 101 51",
  "M123 68 Q130 54 139 51",
];

const ROCKET_PARTS: SvgPart[] = [
  { id: "rocket flame", color: "orange", d: "M66 145 Q110 160 154 145 C151 162 137 166 150 178 C135 175 130 186 122 197 C119 187 115 182 110 179 C105 182 101 187 98 197 C90 186 85 175 70 178 C83 166 69 162 66 145 Z" },
  { id: "rocket nose", color: "red", d: "M110 16 C94 35 82 54 74 76 Q110 98 146 76 C138 54 126 35 110 16 Z" },
  { id: "rocket body", color: "blue", d: "M74 76 C63 104 61 129 62 146 Q110 162 158 146 C159 129 157 104 146 76 Q110 98 74 76 Z" },
  { id: "rocket fins", color: "green", d: "M69 119 L43 155 Q57 151 64 163 L82 166 Z M151 119 L177 155 Q163 151 156 163 L138 166 Z" },
];

const ROCKET_DETAILS = [
  "M110 84 A22 22 0 1 0 110 128 A22 22 0 1 0 110 84",
  "M110 90 A16 16 0 1 0 110 122 A16 16 0 1 0 110 90",
  "M69 151 Q110 165 151 151",
  "M78 161 Q110 172 142 161",
];

const STRAWBERRY_PARTS: SvgPart[] = [
  {
    id: "strawberry",
    color: "red",
    d: "M112 57 C92 47 64 48 46 62 C25 78 24 105 38 132 C54 163 81 190 105 207 C109 210 115 210 119 207 C143 190 170 163 186 132 C200 105 199 78 178 62 C160 48 132 47 112 57 Z",
  },
  {
    id: "strawberry leaves",
    color: "green",
    d: "M111 65 C94 55 75 50 55 51 C66 65 79 72 96 73 C78 73 61 80 47 92 C68 92 86 86 102 77 C87 84 75 96 67 110 C87 104 101 93 112 79 C123 94 140 104 161 108 C152 92 140 82 124 76 C142 83 161 84 180 78 C164 66 146 61 128 64 C145 57 158 47 166 34 C145 36 127 45 113 59 L105 39 L99 42 Z",
  },
];

const STRAWBERRY_SEEDS = [
  "M65 91 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M91 86 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M121 88 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M151 86 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M174 94 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M54 112 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M80 113 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M108 111 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M138 113 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M163 112 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M67 137 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M94 140 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M123 138 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M150 137 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M84 162 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M112 166 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M139 160 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M103 185 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
  "M124 185 a2.5 4 0 1 0 5 0 a2.5 4 0 1 0 -5 0",
];

const GRAPE_BERRY_CENTERS = [
  { x: 83, y: 79 },
  { x: 111, y: 68 },
  { x: 139, y: 78 },
  { x: 68, y: 108 },
  { x: 98, y: 105 },
  { x: 128, y: 107 },
  { x: 157, y: 109 },
  { x: 80, y: 137 },
  { x: 111, y: 137 },
  { x: 141, y: 139 },
  { x: 96, y: 167 },
  { x: 125, y: 170 },
  { x: 110, y: 199 },
];

const GRAPE_PARTS: SvgPart[] = [
  {
    id: "grapes",
    color: "purple",
    d: GRAPE_BERRY_CENTERS.map(({ x, y }) => {
      const radius = 20;
      return `M ${x - radius} ${y} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`;
    }).join(" "),
  },
  {
    id: "grape leaves and stem",
    color: "green",
    d: [
      "M103 39 C83 22 64 20 45 29 C52 36 57 40 64 43 C47 40 33 48 25 65 C43 64 53 58 63 51 C50 59 43 71 42 86 C59 78 68 67 74 55 C77 69 85 80 97 88 C99 70 95 57 88 47 L103 47 Z",
      "M137 39 C157 22 176 20 195 29 C188 36 183 40 176 43 C193 40 207 48 215 65 C197 64 187 58 177 51 C190 59 197 71 198 86 C181 78 172 67 166 55 C163 69 155 80 143 88 C141 70 145 57 152 47 L137 47 Z",
      "M116 48 C116 34 113 17 117 9 L129 9 C125 22 129 36 128 50 Z",
      "M103 43 L53 34 M96 50 L48 62 M91 56 L63 78",
      "M137 43 L187 34 M144 50 L192 62 M149 56 L177 78",
    ].join(" "),
  },
];

const TREE_PARTS: SvgPart[] = [
  {
    id: "tree trunk",
    color: "brown",
    d: "M105 184 L135 184 L130 113 C141 123 154 128 169 124 C157 114 144 105 132 99 C145 95 157 86 166 74 C148 81 136 87 125 91 L125 61 L115 61 L115 91 C103 87 91 81 74 74 C83 86 95 95 108 99 C96 105 83 114 71 124 C86 128 99 123 110 113 Z",
  },
  {
    id: "tree leaves",
    color: "green",
    d: "M119 20 C105 7 83 9 73 26 C52 19 32 34 34 54 C15 59 13 83 29 94 C21 112 39 129 58 123 C70 140 96 136 109 122 L109 108 L120 117 L131 108 L131 122 C144 136 170 140 182 123 C201 129 219 112 211 94 C227 83 225 59 206 54 C208 34 188 19 167 26 C157 9 135 7 119 20 Z",
  },
];

const LEVELS: Array<{
  name: string;
  prompt: string;
  time: number;
  buckets: PaintColor[];
  pages: Drawing[][];
}> = [
  {
    name: "Level 1",
    prompt: "Paint each picture one color!",
    time: 50,
    buckets: ["red", "blue", "yellow"],
    pages: [
      [
        { id: "car", kind: "image", src: carOutline, zones: [{ id: "car", color: "yellow", x: 0, y: 0, w: 1, h: 1 }] },
      ],
      [
        { id: "shirt", kind: "svg", viewBox: "0 0 440 440", parts: SHIRT_PARTS, decorations: SHIRT_DETAILS },
      ],
      [
        { id: "apple", kind: "svg", viewBox: "0 0 200 200", parts: [{ id: "apple", color: "red", d: "M100 58 C58 25 20 63 34 119 C44 161 76 184 100 160 C124 184 156 161 166 119 C180 63 142 25 100 58 Z M100 55 C96 35 108 22 128 18" }] },
      ],
    ],
  },
  {
    name: "Level 2",
    prompt: "Paint both pictures with their colors!",
    time: 80,
    buckets: ["red", "yellow", "pink", "orange", "blue", "green", "brown", "purple"],
    pages: [
      [
        { id: "house", kind: "svg", viewBox: "0 0 240 180", parts: HOUSE_PARTS },
        { id: "ice-cream", kind: "image", src: iceCreamOutline, zones: ICE_CREAM_ZONES },
      ],
      [
        { id: "strawberry", kind: "svg", viewBox: "0 0 224 220", parts: STRAWBERRY_PARTS, decorations: STRAWBERRY_SEEDS },
        { id: "grapes", kind: "svg", viewBox: "0 0 240 230", parts: GRAPE_PARTS },
      ],
      [
        { id: "umbrella", kind: "svg", viewBox: "0 0 240 205", parts: UMBRELLA_PARTS },
        { id: "tree", kind: "svg", viewBox: "0 0 240 200", parts: TREE_PARTS },
      ],
    ],
  },
  {
    name: "Level 3",
    prompt: "Paint each picture with more colors!",
    time: 120,
    buckets: ["red", "orange", "yellow", "brown", "pink", "green", "blue", "purple"],
    pages: [[
      {
        id: "teddy",
        kind: "image",
        src: teddyOutline,
        flood: true,
        zones: [
          { id: "left ear", color: "brown", x: 0.16, y: 0.02, w: 0.22, h: 0.2, fx: 0.28, fy: 0.14 },
          { id: "right ear", color: "brown", x: 0.62, y: 0.02, w: 0.22, h: 0.2, fx: 0.72, fy: 0.14 },
          { id: "head", color: "brown", x: 0.26, y: 0.08, w: 0.48, h: 0.28, fx: 0.5, fy: 0.2 },
          { id: "left arm", color: "brown", x: 0.02, y: 0.4, w: 0.26, h: 0.28, fx: 0.22, fy: 0.52 },
          { id: "right arm", color: "brown", x: 0.72, y: 0.4, w: 0.26, h: 0.28, fx: 0.78, fy: 0.52 },
          { id: "body", color: "brown", x: 0.3, y: 0.42, w: 0.4, h: 0.28, fx: 0.5, fy: 0.56 },
          { id: "left foot", color: "orange", x: 0.16, y: 0.7, w: 0.3, h: 0.26, fx: 0.32, fy: 0.82 },
          { id: "right foot", color: "orange", x: 0.54, y: 0.7, w: 0.3, h: 0.26, fx: 0.68, fy: 0.82 },
          {
            id: "nose",
            color: "yellow",
            x: 0.38,
            y: 0.26,
            w: 0.24,
            h: 0.18,
            fx: 0.44,
            fy: 0.32,
            seeds: [
              { x: 0.44, y: 0.32 },
              { x: 0.56, y: 0.32 },
              { x: 0.5, y: 0.3 },
            ],
          },
        ],
      },
      { id: "flower", kind: "svg", viewBox: "0 0 160 180", parts: FLOWER_PARTS },
      { id: "boat", kind: "svg", viewBox: "0 0 220 170", parts: BOAT_PARTS },
    ], [
      { id: "kite", kind: "svg", viewBox: "0 0 330 280", parts: KITE_PARTS, decorations: KITE_RIBBON_DECORATIONS },
      { id: "butterfly", kind: "svg", viewBox: "0 0 240 180", parts: BUTTERFLY_PARTS, decorations: BUTTERFLY_DETAILS },
      { id: "rocket", kind: "svg", viewBox: "0 0 240 240", parts: ROCKET_PARTS, decorations: ROCKET_DETAILS },
    ]],
  },
];

function shuffleItems<T>(items: T[], previous?: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  if (previous?.length === next.length && next.length > 1 && next.every((item, index) => item === previous[index])) {
    [next[0], next[1]] = [next[1], next[0]];
  }
  return next;
}

function shuffleDrawings(drawings: Drawing[]) {
  return shuffleItems(drawings);
}

function drawingPartCount(drawing: Drawing) {
  return drawing.kind === "svg" ? drawing.parts.length : drawing.zones.length;
}

function levelPartCount(drawings: Drawing[]) {
  return drawings.reduce((sum, drawing) => sum + drawingPartCount(drawing), 0);
}

function zoneAt(zones: Zone[], nx: number, ny: number) {
  const hits = zones.filter((zone) => nx >= zone.x && nx <= zone.x + zone.w && ny >= zone.y && ny <= zone.y + zone.h);
  if (!hits.length) return null;
  return hits.reduce((smallest, zone) => (zone.w * zone.h < smallest.w * smallest.h ? zone : smallest));
}

function floodSeeds(zone: Zone, width: number, height: number) {
  const points = zone.seeds?.length ? zone.seeds : [{ x: zone.fx ?? zone.x + zone.w / 2, y: zone.fy ?? zone.y + zone.h / 2 }];
  return points.map((point) => ({ x: point.x * width, y: point.y * height }));
}

function cropTransparentContent(imageData: ImageData) {
  const { data, width, height } = imageData;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 12) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return imageData;
  const cropped = new ImageData(right - left + 1, bottom - top + 1);
  for (let y = 0; y < cropped.height; y += 1) {
    const sourceStart = ((top + y) * width + left) * 4;
    const targetStart = y * cropped.width * 4;
    cropped.data.set(data.subarray(sourceStart, sourceStart + cropped.width * 4), targetStart);
  }
  return cropped;
}

function PreviewArt({ drawing, previewMax }: { drawing: Drawing; previewMax: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (drawing.kind !== "image") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const image = new Image();
    image.src = drawing.src;
    void image.decode().then(() => {
      if (cancelled) return;
      const work = document.createElement("canvas");
      work.width = image.width;
      work.height = image.height;
      const workCtx = work.getContext("2d");
      const viewCtx = canvas.getContext("2d");
      if (!workCtx || !viewCtx) return;
      workCtx.drawImage(image, 0, 0);
      const pixels = workCtx.getImageData(0, 0, work.width, work.height);
      const paintZones = () => {
        for (const zone of drawing.zones) {
          const rgb = hexToRgb(PAINT[zone.color]);
          if (drawing.flood) {
            for (const seed of floodSeeds(zone, pixels.width, pixels.height)) {
              floodFillAt(pixels, seed.x, seed.y, rgb);
            }
          } else {
            fillZone(pixels, zone, rgb);
          }
        }
      };
      if (drawing.flood) {
        paintZones();
        punchWhiteBackground(pixels);
      } else {
        punchWhiteBackground(pixels);
        paintZones();
      }
      const content = drawing.id === "car" ? cropTransparentContent(pixels) : pixels;
      work.width = content.width;
      work.height = content.height;
      workCtx.putImageData(content, 0, 0);
      const scale = Math.min(previewMax / work.width, previewMax / work.height);
      canvas.width = Math.max(1, Math.round(work.width * scale));
      canvas.height = Math.max(1, Math.round(work.height * scale));
      viewCtx.clearRect(0, 0, canvas.width, canvas.height);
      viewCtx.drawImage(work, 0, 0, canvas.width, canvas.height);
    });
    return () => {
      cancelled = true;
    };
  }, [drawing, previewMax]);

  if (drawing.kind === "svg") {
    return (
      <svg className="cmini-goal-art" viewBox={drawing.viewBox} aria-hidden="true">
        <g transform={drawing.id === "rocket" ? "rotate(40 110 110)" : undefined}>
          {drawing.parts.map((part) => (
            <path
              key={part.id}
              d={part.d}
              fill={PAINT[part.color]}
              stroke="#24324a"
              strokeWidth="5"
              strokeLinejoin="round"
            />
          ))}
          {drawing.decorations?.map((d, index) => (
            <path
              key={`decoration-${index}`}
              d={d}
              fill="none"
              stroke="#555"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
      </svg>
    );
  }

  return <canvas ref={canvasRef} className="cmini-goal-art" />;
}

function PaintGoalPreview({ drawings, label, levelIndex }: { drawings: Drawing[]; label: string; levelIndex: number }) {
  const count = drawings.length;
  const hasCar = levelIndex === 0 && drawings.some((drawing) => drawing.id === "car");
  const previewMax = levelIndex === 2 ? 76 : hasCar ? 100 : count === 1 ? 110 : count === 2 ? 80 : 56;
  return (
    <div
      className={`cmini-goal${count === 1 ? " cmini-goal--solo" : " cmini-goal--row"}${count === 2 ? " cmini-goal--pair" : ""}${levelIndex === 2 ? " cmini-goal--level-three" : ""}${hasCar ? " cmini-goal--car" : ""}`}
      aria-label={`Finished picture: ${label}`}
    >
      {drawings.map((drawing) => (
        <PreviewArt key={drawing.id} drawing={drawing} previewMax={previewMax} />
      ))}
    </div>
  );
}

export default function ColorsPaintCanvas({ mobileApp = false }: { mobileApp?: boolean }) {
  const navigate = useNavigate();
  const { mapOpen, setMapOpen, unlockedCount, levelStars, completeLevel, recordLevelResult } = useQuestLevelGate("colors-paint");
  const isLandscape = useLandscapeLock(mobileApp);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [levelIndex, setLevelIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [drawings, setDrawings] = useState(() => shuffleDrawings(LEVELS[0].pages[0]));
  const [bucketChoices, setBucketChoices] = useState(() => shuffleItems(LEVELS[0].buckets));
  const bucketChoicesRef = useRef(bucketChoices);
  const [brush, setBrush] = useState<PaintColor | null>(null);
  const [wrong, setWrong] = useState(0);
  const [fills, setFills] = useState<Record<string, string>>({});
  const [filledCount, setFilledCount] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [message, setMessage] = useState("Pick a paint color, then tap the picture!");
  const doneRef = useRef(false);
  const pageAdvancingRef = useRef(false);
  const fillsRef = useRef<Record<string, string>>({});
  const level = LEVELS[levelIndex];
  const partCount = levelPartCount(drawings);

  const clock = useColorsMiniClock({
    intro: INTRO,
    mapOpen,
    isLandscape,
    paused,
    blocked: completeOpen || gameOverOpen || celebrate,
    timeLimit: level.time,
    levelIndex,
    soundEnabled,
  });
  useStarTimeUp(clock.timeUpOpen, levelIndex, filledCount > 0 || wrong > 0, recordLevelResult, wrong);
  const onTooManyWrong = useCallback(() => {
    doneRef.current = true;
    setGameOverOpen(true);
    void recordLevelResult(levelIndex, { finished: false, tried: true, wrongAttempts: wrong });
  }, [levelIndex, recordLevelResult, wrong]);
  useWrongAttemptGameOver(wrong, onTooManyWrong);

  useEffect(() => {
    void getOrCreateActiveChildId().then(setChildId);
  }, []);

  const countDone = useCallback((nextFills: Record<string, string>) => {
    let done = 0;
    for (const drawing of drawings) {
      if (drawing.kind === "svg") {
        done += drawing.parts.filter((part) => nextFills[part.id]).length;
        continue;
      }
      const canvas = canvasRefs.current[drawing.id];
      if (!canvas) continue;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      done += drawing.zones.filter((zone) => zoneMatchesColor(pixels, zone, hexToRgb(PAINT[zone.color]))).length;
    }
    return done;
  }, [drawings]);

  const drawOutline = useCallback(async (id: string, src: string, count: number) => {
    const canvas = canvasRefs.current[id];
    if (!canvas) return;
    const image = new Image();
    image.src = src;
    await image.decode();
    const crowded = count > 2;
    const many = count > 1;
    const maxW = Math.min(crowded ? 200 : many ? 280 : 720, Math.floor(window.innerWidth * (crowded ? 0.2 : many ? 0.28 : 0.64)));
    const maxH = Math.min(crowded ? 200 : many ? 240 : 400, Math.floor(window.innerHeight * (crowded ? 0.42 : many ? 0.5 : 0.72)));
    const scale = Math.min(maxW / image.width, maxH / image.height);
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    punchWhiteBackground(pixels);
    if (id === "car") {
      const content = cropTransparentContent(pixels);
      const source = document.createElement("canvas");
      source.width = content.width;
      source.height = content.height;
      const sourceCtx = source.getContext("2d");
      if (!sourceCtx) return;
      sourceCtx.putImageData(content, 0, 0);
      const targetScale = Math.min(180 / content.width, 132 / content.height);
      canvas.width = Math.max(1, Math.round(content.width * targetScale));
      canvas.height = Math.max(1, Math.round(content.height * targetScale));
      const croppedCtx = canvas.getContext("2d");
      if (!croppedCtx) return;
      croppedCtx.drawImage(source, 0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.putImageData(pixels, 0, 0);
  }, []);

  const resetBoard = useCallback((index: number) => {
    doneRef.current = false;
    pageAdvancingRef.current = false;
    fillsRef.current = {};
    setLevelIndex(index);
    setPageIndex(0);
    setDrawings(shuffleDrawings(LEVELS[index].pages[0]));
    const nextBucketChoices = shuffleItems(LEVELS[index].buckets, bucketChoicesRef.current);
    bucketChoicesRef.current = nextBucketChoices;
    setBucketChoices(nextBucketChoices);
    setBrush(null);
    setFills({});
    setWrong(0);
    setFilledCount(0);
    setCelebrate(false);
    setCompleteOpen(false); setGameOverOpen(false);
    setPaused(false);
    setMessage("Pick a paint color, then tap the picture!");
  }, []);

  useEffect(() => {
    const count = drawings.length;
    for (const drawing of drawings) {
      if (drawing.kind === "image") void drawOutline(drawing.id, drawing.src, count);
    }
  }, [drawOutline, drawings, levelIndex, mapOpen]);

  const finishLevel = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCelebrate(true);
    setMessage("Beautiful painting!");
    void completeLevel(levelIndex, { timeLeft: clock.timeLeftRef.current, wrongAttempts: wrong });
    if (childId) {
      void recordGameProgressRpc(childId, "colors_paint", Math.max(50, 100 - wrong * 10), wrong, levelIndex >= 2);
    }
    if (soundEnabled) speakKidPrompt("Beautiful painting!", { interrupt: true });
    window.setTimeout(() => {
      setCelebrate(false);
      setCompleteOpen(true);
      if (soundEnabled) speakNextLevelPrompt(true, levelIndex >= 2);
    }, 2600);
  }, [childId, completeLevel, levelIndex, soundEnabled, wrong]);

  const advancePage = () => {
    if (pageAdvancingRef.current) return;
    if (pageIndex >= level.pages.length - 1) {
      finishLevel();
      return;
    }
    pageAdvancingRef.current = true;
    setMessage("Great job! Next picture!");
    if (soundEnabled) speakKidPrompt("Great job! Let's paint the next pictures.", { interrupt: true });
    window.setTimeout(() => {
      const nextPage = pageIndex + 1;
      fillsRef.current = {};
      setPageIndex(nextPage);
      setDrawings(shuffleDrawings(level.pages[nextPage]));
      setFills({});
      setFilledCount(0);
      setBrush(null);
      setMessage("Pick a paint color, then tap the pictures!");
      pageAdvancingRef.current = false;
    }, 700);
  };

  const markProgress = (nextFills: Record<string, string>, partName: string) => {
    const done = countDone(nextFills);
    setFilledCount(done);
    setMessage(done === partCount ? "You colored every picture!" : `Nice! The ${partName} looks great.`);
    if (done === partCount) advancePage();
  };

  const onCanvasTap = (drawing: Extract<Drawing, { kind: "image" }>, event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (!clock.playing || doneRef.current || pageAdvancingRef.current) return;
    const canvas = canvasRefs.current[drawing.id];
    if (!canvas) return;
    if (!brush) {
      setMessage("Pick a paint color first!");
      if (soundEnabled) speakKidPrompt("Pick a paint color first.", { interrupt: true });
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const zone = zoneAt(drawing.zones, x / canvas.width, y / canvas.height);
    if (!zone) return;
    if (brush !== zone.color) {
      setWrong((count) => count + 1);
      setMessage(`Oops! Try a different color for the ${zone.id}.`);
      if (soundEnabled) speakKidPrompt("Try a different color.", { interrupt: true });
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const painted = drawing.flood
      ? floodFillAt(pixels, x, y, hexToRgb(PAINT[brush]))
      : fillZone(pixels, zone, hexToRgb(PAINT[brush]));
    if (!painted) return;
    ctx.putImageData(pixels, 0, 0);
    markProgress(fillsRef.current, zone.id);
  };

  const paintSvgPart = (part: SvgPart) => {
    if (!clock.playing || doneRef.current || pageAdvancingRef.current) return;
    if (!brush) {
      setMessage("Pick a paint color first!");
      if (soundEnabled) speakKidPrompt("Pick a paint color first.", { interrupt: true });
      return;
    }
    if (brush !== part.color) {
      setWrong((count) => count + 1);
      setMessage(`Oops! Try a different color for the ${part.id}.`);
      if (soundEnabled) speakKidPrompt("Try a different color.", { interrupt: true });
      return;
    }
    const nextFills = { ...fillsRef.current, [part.id]: PAINT[brush] };
    fillsRef.current = nextFills;
    setFills(nextFills);
    markProgress(nextFills, part.id);
  };

  return (
    <div className="colors-page cmini cmini--canvas">
      <ColorsMiniChrome
        mapTitle="Paint Quest"
        mapOpen={mapOpen}
        setMapOpen={setMapOpen}
        unlockedCount={unlockedCount}
        levelStars={levelStars}
        onSelectLevel={resetBoard}
        title={`${level.prompt} Page ${pageIndex + 1}/${level.pages.length}`}
        levelIndex={levelIndex}
        timeLeft={clock.timeLeft}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        intro={INTRO}
        introActive={clock.levelIntroActive}
        introEnabled={clock.introEnabled}
        countdown={clock.countdown}
        rotateLabel="Fill the Canvas"
        mobileApp={mobileApp}
        isLandscape={isLandscape}
        tried={filledCount > 0 || wrong > 0}
        wrong={wrong}
        extraHeader={<GamePauseButton onClick={() => setPaused(true)} />}
      >
        <PaintGoalPreview drawings={drawings} label={level.prompt} levelIndex={levelIndex} />
        <div className="cmini-stage">
          <div className={`cmini-drawings${drawings.length > 1 ? " cmini-drawings--many" : ""}${drawings.length > 2 ? " cmini-drawings--triple" : ""}`}>
            {drawings.map((drawing) =>
              drawing.kind === "svg" ? (
                <svg
                  key={drawing.id}
                  className="cmini-drawing cmini-drawing--svg"
                  viewBox={drawing.viewBox}
                  aria-label={drawing.id}
                >
                  <g transform={drawing.id === "rocket" ? "rotate(40 110 110)" : undefined}>
                    {drawing.parts.map((part) => (
                      <path
                        key={part.id}
                        d={part.d}
                        fill={fills[part.id] || "#fff"}
                        stroke="#24324a"
                        strokeWidth="5"
                        strokeLinejoin="round"
                        onPointerUp={() => paintSvgPart(part)}
                      />
                    ))}
                    {drawing.decorations?.map((d, index) => (
                      <path
                        key={`decoration-${index}`}
                        d={d}
                        fill="none"
                        stroke="#555"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                    ))}
                  </g>
                </svg>
              ) : (
                <canvas
                  key={drawing.id}
                  ref={(node) => {
                    canvasRefs.current[drawing.id] = node;
                  }}
                  className={`cmini-drawing${drawing.id === "car" ? " cmini-drawing--car" : ""}`}
                  aria-label={drawing.id}
                  onPointerUp={(event) => onCanvasTap(drawing, event)}
                />
              )
            )}
          </div>
          <div className={`cmini-buckets${level.buckets.length > 5 ? " cmini-buckets--grid" : ""}`}>
            {bucketChoices.map((color) => (
              <button
                key={color}
                type="button"
                className={`cmini-bucket${brush === color ? " is-on" : ""}`}
                style={{ background: PAINT[color] }}
                onClick={() => {
                  if (!clock.playing) return;
                  setBrush(color);
                  setMessage(`You picked ${color}! Tap the picture.`);
                  if (soundEnabled) speakKidPrompt(color, { interrupt: true });
                }}
                aria-label={`${color} paint`}
              />
            ))}
          </div>
        </div>
        <img className="cmini-bear" src={bear} alt="" />
        {!completeOpen && (
          <div className="cq-panel">
            <p className="cq-message">{message}</p>
            <p className="cq-score">
              Progress: {filledCount}/{partCount} | Wrong Attempts: {wrong}
            </p>
          </div>
        )}
      </ColorsMiniChrome>

      <ColorConfetti active={celebrate} />

      <GamePausePopup
        open={paused}
        subtitle="Your painting will wait."
        onPlay={() => setPaused(false)}
        onMap={() => { setPaused(false); setMapOpen(true); }}
      />

      <GameOverPopup
        open={gameOverOpen}
        onLesson={() => navigate("/lesson/colors")}
        onReplay={() => { resetBoard(levelIndex); clock.replayLevel(); }}
      />
      <GameOverlay isOpen={clock.timeUpOpen && !gameOverOpen}>
        <GamePopup
          title="Time's up!"
          subtitle="Let's try this picture again."
          buttons={[
            { label: "Replay Level", onClick: () => { resetBoard(levelIndex); clock.replayLevel(); } },
            { label: "Map", variant: "secondary", onClick: () => { clock.setTimeUpOpen(false); setMapOpen(true); } },
          ]}
        />
      </GameOverlay>
      <GameOverlay isOpen={completeOpen}>
        <GamePopup
          title="Awesome!"
          timeLeft={clock.timeLeft}
          wrong={wrong}
          subtitle={levelIndex >= 2 ? "You finished Fill the Canvas!" : `${level.name} complete! Proceed to the next level?`}
          buttons={colorsNextLevelButtons({
            levelIndex,
            lastIndex: 2,
            onYes: () => resetBoard(levelIndex + 1),
            onNo: () => { setCompleteOpen(false); setGameOverOpen(false); setMapOpen(true); },
            onGames: () => navigate("/quest/colors"),
          })}
        />
      </GameOverlay>
    </div>
  );
}
