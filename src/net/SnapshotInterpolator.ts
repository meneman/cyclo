import type { PlayerSnapshot } from "../../shared/types";

interface BufferedSnapshot {
  /** Local receipt time (performance.now()), not the server's clock — this avoids
   *  needing any client/server clock synchronization. */
  receivedAt: number;
  players: Map<string, PlayerSnapshot>;
}

const BUFFER_SIZE = 12;

/**
 * Buffers recent state snapshots and interpolates remote players a fixed
 * delay behind "now". Smooths out the server's tick rate + network jitter
 * into motion, at the cost of `delayMs` of visible latency.
 */
export class SnapshotInterpolator {
  private readonly buffer: BufferedSnapshot[] = [];

  constructor(private readonly delayMs: number) {}

  public push(players: PlayerSnapshot[]): void {
    this.buffer.push({
      receivedAt: performance.now(),
      players: new Map(players.map((p) => [p.id, p])),
    });
    if (this.buffer.length > BUFFER_SIZE) this.buffer.shift();
  }

  /** Drops all buffered history — required on reconnect, where the server
   *  issues a new player id and old snapshots would otherwise render ghosts. */
  public clear(): void {
    this.buffer.length = 0;
  }

  public sample(id: string): PlayerSnapshot | null {
    if (this.buffer.length === 0) return null;
    const renderTime = performance.now() - this.delayMs;

    let older: BufferedSnapshot | null = null;
    let newer: BufferedSnapshot | null = null;
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (
        this.buffer[i].receivedAt <= renderTime &&
        this.buffer[i + 1].receivedAt >= renderTime
      ) {
        older = this.buffer[i];
        newer = this.buffer[i + 1];
        break;
      }
    }

    if (!older || !newer) {
      // Not enough buffered history yet (or we've caught up to the latest
      // snapshot) — snap to the freshest known state instead of stalling.
      return this.buffer[this.buffer.length - 1].players.get(id) ?? null;
    }

    const a = older.players.get(id);
    const b = newer.players.get(id);
    if (!a || !b) return b ?? a ?? null;

    const span = newer.receivedAt - older.receivedAt || 1;
    const t = (renderTime - older.receivedAt) / span;

    const result: PlayerSnapshot = {
      ...b,
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
    };

    if (
      a.facingX !== undefined &&
      a.facingY !== undefined &&
      b.facingX !== undefined &&
      b.facingY !== undefined
    ) {
      const angleA = Math.atan2(a.facingY, a.facingX);
      const angleB = Math.atan2(b.facingY, b.facingX);
      const interpolatedAngle = lerpAngle(angleA, angleB, t);
      result.facingX = Math.cos(interpolatedAngle);
      result.facingY = Math.sin(interpolatedAngle);
    }

    return result;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = b - a;
  const delta = ((d + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + (delta < -Math.PI ? delta + Math.PI * 2 : delta) * t;
}
