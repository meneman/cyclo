// One-off generator: rasterizes maps/<name>/source.svg directly at world
// resolution, classifies each pixel as walkable (street) or blocked
// (building/park/water/everything else), and writes debug PNGs plus a
// packed 1-bit-per-pixel binary collision mask.
//
// Usage: node scripts/generate-collision-map.mjs neustadt
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/generate-collision-map.mjs <map-name>");
  process.exit(1);
}

// Must match MAP_RENDER_SCALE in shared/constants.ts — the background
// texture (rasterized client-side by Pixi's SVG loader) and this collision
// mask are rasterized from the same source.svg at the same scale, so they
// share one pixel grid.
const MAP_RENDER_SCALE = 2;
// Extra margin added to the kept street network after component filtering —
// see the widen step in main() for why.
const WIDEN_RADIUS = 3;
// librsvg's default density is 72*4/3 px/unit, not 72 — 72*scale gives an
// exact `nativeViewBox * scale` pixel size (verified empirically).
const DENSITY = 72 * MAP_RENDER_SCALE;

const mapDir = join(root, "maps", name);
const sourcePath = join(mapDir, "source.svg");
const publicDir = join(root, "public", "maps", name);

function isWalkablePixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Near-neutral and bright: plain street/plaza asphalt (white/light gray).
  if (max >= 225 && delta <= 20) return true;

  // Yellow/cream casing used for primary/secondary arterial roads
  // (e.g. Bischofsweg) — still a street, just style-highlighted.
  if (r >= 225 && g >= 200 && b <= 210 && r - b >= 25) return true;

  return false;
}

async function main() {
  const { data, info } = await sharp(sourcePath, { density: DENSITY })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const rawMask = new Uint8Array(width * height); // 1 = walkable, 0 = blocked
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    rawMask[p] = isWalkablePixel(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
  }

  // Morphological close (dilate then erode) to remove small noise: thin
  // text labels / icons sitting on top of streets, and stray anti-aliased
  // border pixels. Streets are much wider than the structuring radius, so
  // real street/building boundaries survive.
  const closed = closeMask(rawMask, width, height, 2 * MAP_RENDER_SCALE);

  // Keep only the largest connected walkable component (the actual street
  // network). Drops disconnected same-colored blobs — building courtyards,
  // interior light wells, stray plaza slivers — that would otherwise pass
  // as "walkable" despite having no path to any real street.
  const network = largestConnectedComponent(closed, width, height);

  // Widen the kept network by a few pixels. The client rasterizes source.svg
  // with its own SVG renderer (browser canvas via Pixi), not sharp/librsvg —
  // anti-aliased street edges land on slightly different pixels between the
  // two, and the runtime collision disc (COLLISION_RADIUS, shared/constants.ts)
  // needs clearance on *both* sides of the centerline. Without this margin,
  // narrow residential streets read as visually walkable but block movement
  // along their edges. Runs after largestConnectedComponent so it only grows
  // the real network, not disconnected blobs.
  const streetNetwork = slidingWindow1D(
    slidingWindow1D(network, width, height, WIDEN_RADIUS, true, true),
    width,
    height,
    WIDEN_RADIUS,
    false,
    true,
  );

  // Debug visualization: pure black/white PNG, white = walkable.
  const debugBuffer = Buffer.alloc(width * height);
  for (let p = 0; p < width * height; p++)
    debugBuffer[p] = streetNetwork[p] ? 255 : 0;
  await sharp(debugBuffer, { raw: { width, height, channels: 1 } })
    .png()
    .toFile(join(mapDir, "collision-mask.png"));

  // Debug overlay: source render with blocked areas tinted red, so
  // misclassifications are easy to spot against the real map.
  const overlay = Buffer.from(data); // copy of original RGBA
  for (let p = 0; p < width * height; p++) {
    if (!streetNetwork[p]) {
      const i = p * 4;
      overlay[i] = Math.min(255, overlay[i] + 60);
      overlay[i + 1] = Math.max(0, overlay[i + 1] - 40);
      overlay[i + 2] = Math.max(0, overlay[i + 2] - 40);
    }
  }
  await sharp(overlay, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(join(mapDir, "collision-overlay.png"));

  // Packed 1-bit-per-pixel binary mask for runtime use (client fetch + server fs read).
  const packed = new Uint8Array(Math.ceil((width * height) / 8));
  for (let p = 0; p < width * height; p++) {
    if (streetNetwork[p]) packed[p >> 3] |= 1 << (p & 7);
  }

  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, "collision.bin"), Buffer.from(packed));
  writeFileSync(
    join(publicDir, "collision.meta.json"),
    JSON.stringify({ width, height }, null, 2),
  );
  copyFileSync(sourcePath, join(publicDir, "map.svg"));

  const walkableCount = streetNetwork.reduce((a, b) => a + b, 0);
  console.log(
    `${name}: ${width}x${height}, walkable ${((walkableCount / (width * height)) * 100).toFixed(1)}%`,
  );
  console.log(
    `maps/${name}/: collision-mask.png, collision-overlay.png (debug)`,
  );
  console.log(
    `public/maps/${name}/: map.svg, collision.bin, collision.meta.json (runtime)`,
  );
}

// Separable morphology: a square (2r+1)x(2r+1) dilate/erode is exactly
// equivalent to a 1D pass along X followed by a 1D pass along Y, computed
// via a sliding window sum. O(width*height) per pass instead of the
// O(width*height*radius^2) a brute-force 2D window scan costs — the
// difference between milliseconds and tens of minutes at this pixel count.
function closeMask(mask, width, height, radius) {
  let d = slidingWindow1D(mask, width, height, radius, true, true);
  d = slidingWindow1D(d, width, height, radius, false, true);
  let e = slidingWindow1D(d, width, height, radius, true, false);
  e = slidingWindow1D(e, width, height, radius, false, false);
  return e;
}

function slidingWindow1D(mask, width, height, radius, horizontal, dilate) {
  const out = new Uint8Array(mask.length);
  const outerLen = horizontal ? height : width;
  const innerLen = horizontal ? width : height;
  const index = (outer, inner) =>
    horizontal ? outer * width + inner : inner * width + outer;

  for (let o = 0; o < outerLen; o++) {
    let sum = 0;
    let windowSize = 0;
    for (let k = 0; k <= radius && k < innerLen; k++) {
      sum += mask[index(o, k)];
      windowSize++;
    }

    for (let i = 0; i < innerLen; i++) {
      if (i > 0) {
        const addIndex = i + radius;
        const removeIndex = i - radius - 1;
        if (addIndex < innerLen) {
          sum += mask[index(o, addIndex)];
          windowSize++;
        }
        if (removeIndex >= 0) {
          sum -= mask[index(o, removeIndex)];
          windowSize--;
        }
      }
      // Dilate: any 1 in window. Erode: every (in-bounds) pixel is 1.
      out[index(o, i)] = dilate ? (sum > 0 ? 1 : 0) : sum === windowSize ? 1 : 0;
    }
  }
  return out;
}

function largestConnectedComponent(mask, width, height) {
  const labels = new Int32Array(mask.length).fill(-1);
  const queue = new Int32Array(mask.length);
  let bestLabel = -1;
  let bestSize = 0;
  let label = 0;

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || labels[start] !== -1) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;

    while (head < tail) {
      const p = queue[head++];
      const x = p % width;
      const y = (p - x) / width;

      const neighbors = x > 0 ? [p - 1] : [];
      if (x < width - 1) neighbors.push(p + 1);
      if (y > 0) neighbors.push(p - width);
      if (y < height - 1) neighbors.push(p + width);

      for (const n of neighbors) {
        if (mask[n] === 1 && labels[n] === -1) {
          labels[n] = label;
          queue[tail++] = n;
        }
      }
    }

    if (tail > bestSize) {
      bestSize = tail;
      bestLabel = label;
    }
    label++;
  }

  const out = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) {
    out[p] = labels[p] === bestLabel ? 1 : 0;
  }
  return out;
}

mkdirSync(mapDir, { recursive: true });
main();
