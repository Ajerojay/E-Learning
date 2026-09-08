import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "MobileApp");
const markers = ["ðŸ", "â˜", "â€", "â­", "âš", "â—", "âœ", "â", "Â", "Ã", "ð"];
const exts = new Set([".tsx", ".ts", ".css", ".jsx", ".js"]);

// Inverse of Windows-1252 for bytes 0x80–0x9F.
const CP1252_FROM_UNICODE = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

function hasMarker(text) {
  return markers.some((marker) => text.includes(marker));
}

function encodeCp1252(text) {
  const bytes = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0xff) {
      bytes[i] = code;
      continue;
    }
    const mapped = CP1252_FROM_UNICODE.get(code);
    if (mapped === undefined) {
      throw new Error(`unmappable U+${code.toString(16)}`);
    }
    bytes[i] = mapped;
  }
  return bytes;
}

function fixText(text, depth = 0) {
  if (depth > 3) return text;
  try {
    const fixed = encodeCp1252(text).toString("utf8");
    if (fixed !== text && !fixed.includes("\uFFFD")) {
      return fixText(fixed, depth + 1);
    }
  } catch {
    return text;
  }
  return text;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (exts.has(extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

const files = await walk(root);
const changed = [];
for (const file of files) {
  const original = await readFile(file, "utf8");
  const fixed = fixText(original);
  if (fixed !== original) {
    await writeFile(file, fixed, "utf8");
    changed.push(file);
  }
}
console.log(`files_fixed ${changed.length}`);
for (const file of changed) console.log(file);
