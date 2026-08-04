import { Sprite, Texture } from "pixi.js";

import type { CollisionMap } from "../../../../shared/collisionMap";

/** Blocked pixels tinted red, walkable pixels left transparent. */
const BLOCKED_COLOR: [number, number, number, number] = [220, 40, 40, 130];

/** Renders a CollisionMap's walkability mask as a semi-transparent overlay, 1 world unit = 1 pixel. */
export function createCollisionMapDebugOverlay(collisionMap: CollisionMap): Sprite {
  const { width, height, bits } = collisionMap;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const image = ctx.createImageData(width, height);
  const [r, g, b, a] = BLOCKED_COLOR;
  for (let i = 0; i < width * height; i++) {
    const walkable = ((bits[i >> 3] >> (i & 7)) & 1) === 1;
    if (walkable) continue;
    const offset = i * 4;
    image.data[offset] = r;
    image.data[offset + 1] = g;
    image.data[offset + 2] = b;
    image.data[offset + 3] = a;
  }
  ctx.putImageData(image, 0, 0);

  const sprite = new Sprite(Texture.from(canvas));
  sprite.width = width;
  sprite.height = height;
  sprite.visible = false;
  return sprite;
}
