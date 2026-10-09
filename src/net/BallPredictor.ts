import { stepBall } from "../../shared/ballPhysics";
import type { BallState, TrampolineState } from "../../shared/types";

export interface RenderBall {
  id: string;
  ownerId: string;
  color: number;
  x: number;
  y: number;
  z: number;
  resting: boolean;
}

interface TrackedBall {
  sim: BallState;
  renderX: number;
  renderY: number;
  renderZ: number;
}

const SNAP_DISTANCE = 100;
const BLEND_RATE = 20; // 1 - exp(-dt * 20) smoothly closes ~90% of gap in 115ms

/**
 * Predicts ball motion on the client between server snapshots (dead reckoning)
 * and smoothly blends rendered positions toward authoritative coordinates
 * without sudden visual snaps.
 */
export class BallPredictor {
  private readonly balls = new Map<string, TrackedBall>();

  public onSnapshot(serverBalls: BallState[]): void {
    const aliveIds = new Set<string>();

    for (const serverBall of serverBalls) {
      aliveIds.add(serverBall.id);
      const existing = this.balls.get(serverBall.id);

      if (!existing) {
        this.balls.set(serverBall.id, {
          sim: { ...serverBall },
          renderX: serverBall.x,
          renderY: serverBall.y,
          renderZ: serverBall.z,
        });
        continue;
      }

      // Hit detected or both resting: sync immediately
      const wasHit = serverBall.hitSeq > existing.sim.hitSeq;
      existing.sim = { ...serverBall };

      if (wasHit) {
        const dist = Math.hypot(
          existing.renderX - serverBall.x,
          existing.renderY - serverBall.y,
        );
        if (dist > 30) {
          existing.renderX = serverBall.x;
          existing.renderY = serverBall.y;
          existing.renderZ = serverBall.z;
        }
      } else if (
        serverBall.resting &&
        Math.hypot(
          existing.renderX - serverBall.x,
          existing.renderY - serverBall.y,
        ) < 1
      ) {
        existing.renderX = serverBall.x;
        existing.renderY = serverBall.y;
        existing.renderZ = serverBall.z;
      }
    }

    // Remove balls that are no longer in the snapshot
    for (const id of this.balls.keys()) {
      if (!aliveIds.has(id)) {
        this.balls.delete(id);
      }
    }
  }

  public update(
    dtSeconds: number,
    trampolines?: Iterable<TrampolineState>,
  ): void {
    const blend = 1 - Math.exp(-dtSeconds * BLEND_RATE);

    for (const ball of this.balls.values()) {
      if (!ball.sim.resting) {
        stepBall(
          ball.sim,
          dtSeconds,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          trampolines,
        );
      }

      const dx = ball.sim.x - ball.renderX;
      const dy = ball.sim.y - ball.renderY;
      const dz = ball.sim.z - ball.renderZ;
      const dist = Math.hypot(dx, dy);

      if (dist > SNAP_DISTANCE) {
        ball.renderX = ball.sim.x;
        ball.renderY = ball.sim.y;
        ball.renderZ = ball.sim.z;
      } else {
        ball.renderX += dx * blend;
        ball.renderY += dy * blend;
        ball.renderZ += dz * blend;
      }

      if (ball.sim.resting && dist < 0.05 && Math.abs(dz) < 0.05) {
        ball.renderX = ball.sim.x;
        ball.renderY = ball.sim.y;
        ball.renderZ = 0;
      }
    }
  }

  public getBalls(): RenderBall[] {
    const result: RenderBall[] = [];
    for (const b of this.balls.values()) {
      result.push({
        id: b.sim.id,
        ownerId: b.sim.ownerId,
        color: b.sim.color,
        x: b.renderX,
        y: b.renderY,
        z: Math.max(0, b.renderZ),
        resting: b.sim.resting,
      });
    }
    return result;
  }

  public getSimBalls(): BallState[] {
    return Array.from(this.balls.values(), (b) => b.sim);
  }

  public clear(): void {
    this.balls.clear();
  }
}
