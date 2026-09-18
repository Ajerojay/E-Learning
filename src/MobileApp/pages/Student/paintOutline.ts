export type PaintRgb = [number, number, number];

export function hexToRgb(hex: string): PaintRgb {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function pixelIndex(x: number, y: number, width: number) {
  return (y * width + x) * 4;
}

function isDarkLine(data: Uint8ClampedArray, i: number) {
  const a = data[i + 3];
  if (a < 70) return false;
  const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
  return lum < 118;
}

function isNearWhite(data: Uint8ClampedArray, i: number) {
  return data[i + 3] > 20 && data[i] > 232 && data[i + 1] > 232 && data[i + 2] > 232;
}

/** Clear extra white (or checker) background by punching from the canvas edges. */
export function punchWhiteBackground(imageData: ImageData) {
  const { data, width, height } = imageData;
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const id = y * width + x;
    if (seen[id]) return;
    const i = id * 4;
    if (data[i + 3] < 12) {
      seen[id] = 1;
      return;
    }
    if (!isNearWhite(data, i) || isDarkLine(data, i)) return;
    seen[id] = 1;
    queue.push(id);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (queue.length) {
    const id = queue.pop() as number;
    const i = id * 4;
    data[i + 3] = 0;
    const x = id % width;
    const y = Math.floor(id / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

export function floodFillAt(
  imageData: ImageData,
  x: number,
  y: number,
  rgb: PaintRgb
): boolean {
  const { data, width, height } = imageData;
  const startX = Math.floor(x);
  const startY = Math.floor(y);
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return false;

  const canFill = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return false;
    const i = pixelIndex(px, py, width);
    return data[i + 3] >= 12 && !isDarkLine(data, i);
  };

  let fillX = startX;
  let fillY = startY;
  if (!canFill(fillX, fillY)) {
    let found = false;
    for (let radius = 1; radius <= 28 && !found; radius += 1) {
      for (let dy = -radius; dy <= radius && !found; dy += 1) {
        for (let dx = -radius; dx <= radius && !found; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          if (!canFill(startX + dx, startY + dy)) continue;
          fillX = startX + dx;
          fillY = startY + dy;
          found = true;
        }
      }
    }
    if (!found) return false;
  }

  const start = pixelIndex(fillX, fillY, width);

  const matchR = data[start];
  const matchG = data[start + 1];
  const matchB = data[start + 2];
  const already =
    Math.abs(matchR - rgb[0]) < 8 &&
    Math.abs(matchG - rgb[1]) < 8 &&
    Math.abs(matchB - rgb[2]) < 8;
  if (already) return false;

  const seen = new Uint8Array(width * height);
  const queue = [fillY * width + fillX];
  seen[fillY * width + fillX] = 1;
  let filled = 0;

  const tryPush = (nx: number, ny: number) => {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
    const next = ny * width + nx;
    if (seen[next]) return;
    seen[next] = 1;
    queue.push(next);
  };

  while (queue.length) {
    const id = queue.pop() as number;
    const i = id * 4;
    if (data[i + 3] < 12 || isDarkLine(data, i)) continue;
    const closeToStart =
      Math.abs(data[i] - matchR) < 28 &&
      Math.abs(data[i + 1] - matchG) < 28 &&
      Math.abs(data[i + 2] - matchB) < 28;
    const closeToPaint =
      Math.abs(data[i] - rgb[0]) < 8 &&
      Math.abs(data[i + 1] - rgb[1]) < 8 &&
      Math.abs(data[i + 2] - rgb[2]) < 8;
    if (!closeToStart && !closeToPaint) continue;

    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
    filled += 1;

    const px = id % width;
    const py = Math.floor(id / width);
    tryPush(px + 1, py);
    tryPush(px - 1, py);
    tryPush(px, py + 1);
    tryPush(px, py - 1);
  }

  return filled > 12;
}

/** Fill every non-outline pixel inside a region so lattice cones still color in one tap. */
export function fillZone(
  imageData: ImageData,
  zone: { x: number; y: number; w: number; h: number },
  rgb: PaintRgb
) {
  const { data, width, height } = imageData;
  const x0 = Math.max(0, Math.floor(zone.x * width));
  const y0 = Math.max(0, Math.floor(zone.y * height));
  const x1 = Math.min(width, Math.ceil((zone.x + zone.w) * width));
  const y1 = Math.min(height, Math.ceil((zone.y + zone.h) * height));
  let filled = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = pixelIndex(x, y, width);
      if (data[i + 3] < 12 || isDarkLine(data, i)) continue;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
      filled += 1;
    }
  }
  return filled > 12;
}

export function zoneMatchesColor(
  imageData: ImageData,
  zone: { x: number; y: number; w: number; h: number },
  rgb: PaintRgb
) {
  const { data, width, height } = imageData;
  const x0 = Math.floor(zone.x * width);
  const y0 = Math.floor(zone.y * height);
  const x1 = Math.min(width, Math.floor((zone.x + zone.w) * width));
  const y1 = Math.min(height, Math.floor((zone.y + zone.h) * height));
  let hits = 0;
  let samples = 0;
  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = pixelIndex(x, y, width);
      if (data[i + 3] < 40 || isDarkLine(data, i)) continue;
      samples += 1;
      if (
        Math.abs(data[i] - rgb[0]) < 48 &&
        Math.abs(data[i + 1] - rgb[1]) < 48 &&
        Math.abs(data[i + 2] - rgb[2]) < 48
      ) {
        hits += 1;
      }
    }
  }
  return samples > 20 && hits / samples >= 0.45;
}
