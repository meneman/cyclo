import {
  BALL_BOUNCE_FRICTION,
  BALL_GRAVITY,
  BALL_LAUNCH_ANGLE,
  BALL_MAX_CARRY,
  BALL_MIN_BOUNCE_SPEED,
  BALL_MIN_CARRY,
  BALL_POWER_EXP,
  BALL_RADIUS,
  BALL_REST_SPEED,
  BALL_RESTITUTION,
  BALL_ROLL_DECEL,
  BALL_SUBSTEP_SECONDS,
  BALL_WALL_RESTITUTION,
  HIT_OFFSET_FORWARD,
  HIT_OFFSET_RIGHT,
  HIT_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import type { BallState, PlayerState, Vector2 } from "./types";

/**
 * Golf ball physics and swing→ball interaction. Every function here is pure
 * (or mutates only its explicit argument), so the server — which owns all
 * decisions — and the client — which only predicts motion between snapshots
 * — compute identical results.
 *
 * Coordinates follow the shared sim: x right, y DOWN, z up (height).
 */

/** Player facing as a unit vector, defaulting to south (0, 1) */
export function facingOf(player: PlayerState): Vector2 {
  const x = player.facingX ?? 0;
  const y = player.facingY ?? 1;
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 1 };
}

/**
 * Center of a player's hit zone: HIT_OFFSET_FORWARD along the facing plus
 * HIT_OFFSET_RIGHT toward the club hand. With y down, the right of heading
 * (fx, fy) is (-fy, fx) — facing south (0,1) puts the right hand at -x,
 * which is screen-left, as seen from the top-down camera.
 */
export function hitPoint(player: PlayerState): Vector2 {
  const f = facingOf(player);
  return {
    x: player.x + f.x * HIT_OFFSET_FORWARD - f.y * HIT_OFFSET_RIGHT,
    y: player.y + f.y * HIT_OFFSET_FORWARD + f.x * HIT_OFFSET_RIGHT,
  };
}

/** A ball is hittable only while on the ground — resting or rolling */
export function isOnGround(ball: BallState): boolean {
  return ball.z <= 0 && ball.vz === 0;
}

/**
 * The ball the player's club would strike right now: the grounded ball
 * nearest to the hit point whose edge overlaps the hit zone, else null
 * (a whiff). Any player can hit any ball.
 */
export function findHittableBall(
  player: PlayerState,
  balls: Iterable<BallState>,
): BallState | null {
  const point = hitPoint(player);
  const reach = HIT_RADIUS + BALL_RADIUS;
  let best: BallState | null = null;
  let bestDistance = Infinity;
  for (const ball of balls) {
    if (!isOnGround(ball)) continue;
    const distance = Math.hypot(ball.x - point.x, ball.y - point.y);
    if (distance <= reach && distance < bestDistance) {
      best = ball;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Carry distance (to first ground contact) for a swing power in 0..1. Shots
 * are designed in distance, not velocity — tune BALL_MIN/MAX_CARRY directly.
 */
export function carryForPower(power: number): number {
  const p = Math.min(Math.max(power, 0), 1);
  return (
    BALL_MIN_CARRY + (BALL_MAX_CARRY - BALL_MIN_CARRY) * p ** BALL_POWER_EXP
  );
}

/**
 * Launch velocity that makes a ball starting on the ground land exactly
 * `carry` units away along `direction` (unit vector): projectile range
 * R = v²·sin(2θ)/g, solved for v.
 */
export function launchVelocity(
  direction: Vector2,
  carry: number,
): { vx: number; vy: number; vz: number } {
  const speed = Math.sqrt(
    (Math.max(carry, 0) * BALL_GRAVITY) / Math.sin(2 * BALL_LAUNCH_ANGLE),
  );
  const horizontal = speed * Math.cos(BALL_LAUNCH_ANGLE);
  return {
    vx: direction.x * horizontal,
    vy: direction.y * horizontal,
    vz: speed * Math.sin(BALL_LAUNCH_ANGLE),
  };
}

/** Where a shot of `power` from `player` would first touch down (landing marker) */
export function predictedLanding(player: PlayerState, power: number): Vector2 {
  const f = facingOf(player);
  const origin = hitPoint(player);
  const carry = carryForPower(power);
  return { x: origin.x + f.x * carry, y: origin.y + f.y * carry };
}

/** Strikes `ball` along the hitter's facing with the given power. Mutates `ball`. */
export function strikeBall(
  ball: BallState,
  hitter: PlayerState,
  power: number,
): BallState {
  const velocity = launchVelocity(facingOf(hitter), carryForPower(power));
  ball.vx = velocity.vx;
  ball.vy = velocity.vy;
  ball.vz = velocity.vz;
  ball.z = 0;
  ball.resting = false;
  ball.hitSeq += 1;
  ball.lastHitBy = hitter.id;
  return ball;
}

export function createBall(
  id: string,
  ownerId: string,
  color: number,
  x: number,
  y: number,
): BallState {
  return {
    id,
    ownerId,
    color,
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    resting: true,
    hitSeq: 0,
  };
}

/**
 * Advances a ball by `dtSeconds`, split into fixed BALL_SUBSTEP_SECONDS
 * steps so the result doesn't depend on the caller's frame/tick rate
 * (beyond the final partial step). Mutates and returns `ball`.
 */
export function stepBall(ball: BallState, dtSeconds: number): BallState {
  let remaining = dtSeconds;
  while (remaining > 1e-9 && !ball.resting) {
    const h = Math.min(BALL_SUBSTEP_SECONDS, remaining);
    substep(ball, h);
    remaining -= h;
  }
  return ball;
}

function substep(ball: BallState, h: number): void {
  if (ball.z > 0 || ball.vz > 0) {
    // Airborne: exact constant-gravity integration for this step.
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    ball.z += ball.vz * h - 0.5 * BALL_GRAVITY * h * h;
    ball.vz -= BALL_GRAVITY * h;
    if (ball.z <= 0) {
      ball.z = 0;
      if (-ball.vz > BALL_MIN_BOUNCE_SPEED) {
        ball.vz = -ball.vz * BALL_RESTITUTION;
        ball.vx *= BALL_BOUNCE_FRICTION;
        ball.vy *= BALL_BOUNCE_FRICTION;
      } else {
        ball.vz = 0;
      }
    }
  } else {
    // Rolling: constant deceleration until it stops.
    ball.z = 0;
    ball.vz = 0;
    const speed = Math.hypot(ball.vx, ball.vy);
    const next = speed - BALL_ROLL_DECEL * h;
    if (speed <= BALL_REST_SPEED || next <= 0) {
      ball.vx = 0;
      ball.vy = 0;
      ball.resting = true;
      return;
    }
    const scale = next / speed;
    ball.vx *= scale;
    ball.vy *= scale;
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
  }
  bounceOffWalls(ball);
}

function bounceOffWalls(ball: BallState): void {
  const minX = BALL_RADIUS;
  const maxX = WORLD_WIDTH - BALL_RADIUS;
  const minY = BALL_RADIUS;
  const maxY = WORLD_HEIGHT - BALL_RADIUS;
  if (ball.x < minX) {
    ball.x = minX;
    ball.vx = Math.abs(ball.vx) * BALL_WALL_RESTITUTION;
  } else if (ball.x > maxX) {
    ball.x = maxX;
    ball.vx = -Math.abs(ball.vx) * BALL_WALL_RESTITUTION;
  }
  if (ball.y < minY) {
    ball.y = minY;
    ball.vy = Math.abs(ball.vy) * BALL_WALL_RESTITUTION;
  } else if (ball.y > maxY) {
    ball.y = maxY;
    ball.vy = -Math.abs(ball.vy) * BALL_WALL_RESTITUTION;
  }
}
