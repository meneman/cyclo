import type { Vector2 } from "./types";

/** Spiral-search step, in world units — small enough to not skip past narrow gaps. */
const SEARCH_STEP = 4;

/**
 * Queries a 1-bit-per-pixel walkability mask generated from a map SVG (see
 * scripts/generate-collision-map.mjs). The mask is rasterized directly at
 * world resolution, so world coordinates map straight onto mask pixels — no
 * scale conversion. Identical logic runs on server (authoritative) and
 * client (prediction) — only how the bytes are loaded differs (fs read vs
 * fetch).
 */
export class CollisionMap {
  constructor(
    public readonly bits: Uint8Array,
    public readonly width: number,
    public readonly height: number,
  ) {}

  public isWalkablePixel(px: number, py: number): boolean {
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return false;
    const bitIndex = py * this.width + px;
    return ((this.bits[bitIndex >> 3] >> (bitIndex & 7)) & 1) === 1;
  }

  public isWalkableWorld(x: number, y: number): boolean {
    return this.isWalkablePixel(Math.floor(x), Math.floor(y));
  }

  /** Approximates a solid disc by sampling its center plus points around the rim. */
  public isWalkableDisc(x: number, y: number, radius: number): boolean {
    if (!this.isWalkableWorld(x, y)) return false;
    const samples = 8;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      if (
        !this.isWalkableWorld(
          x + Math.cos(angle) * radius,
          y + Math.sin(angle) * radius,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  /** Spirals outward from (x, y) to find the nearest walkable world point — used to pick spawn points. */
  public findNearestWalkable(
    x: number,
    y: number,
    radius: number,
    maxSearchRadius = 800,
  ): Vector2 | null {
    if (this.isWalkableDisc(x, y, radius)) return { x, y };

    for (let r = SEARCH_STEP; r <= maxSearchRadius; r += SEARCH_STEP) {
      for (let dy = -r; dy <= r; dy += SEARCH_STEP) {
        for (let dx = -r; dx <= r; dx += SEARCH_STEP) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (this.isWalkableDisc(nx, ny, radius)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }
}
