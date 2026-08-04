import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CollisionMap } from "../../shared/collisionMap";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Reads the same public/maps/<name>/ files the client fetches over HTTP, straight off disk. */
export function loadCollisionMap(mapName: string): CollisionMap {
  const mapDir = join(__dirname, "../../public/maps", mapName);
  const bits = new Uint8Array(readFileSync(join(mapDir, "collision.bin")));
  const meta = JSON.parse(
    readFileSync(join(mapDir, "collision.meta.json"), "utf-8"),
  ) as { width: number; height: number };

  return new CollisionMap(bits, meta.width, meta.height);
}
