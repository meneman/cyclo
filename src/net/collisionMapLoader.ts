import { CollisionMap } from "../../shared/collisionMap";

/** Fetches the same public/maps/<name>/ files the server reads straight off disk. */
export async function loadCollisionMap(mapName: string): Promise<CollisionMap> {
  const [buffer, meta] = await Promise.all([
    fetch(`/maps/${mapName}/collision.bin`).then((r) => r.arrayBuffer()),
    fetch(`/maps/${mapName}/collision.meta.json`).then(
      (r) => r.json() as Promise<{ width: number; height: number }>,
    ),
  ]);

  return new CollisionMap(new Uint8Array(buffer), meta.width, meta.height);
}
