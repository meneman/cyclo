import {
  BALL_GRAVITY,
  BALL_LAUNCH_ANGLE,
  BALL_MAX_CARRY,
  BALL_MIN_BOUNCE_SPEED,
  BALL_MIN_CARRY,
  BALL_PLAYER_RESTITUTION,
  BALL_POWER_EXP,
  BALL_RADIUS,
  BALL_REST_SPEED,
  BALL_SUBSTEP_SECONDS,
  BALL_WALL_RESTITUTION,
  HIT_OFFSET_FORWARD,
  HIT_OFFSET_RIGHT,
  HIT_RADIUS,
  KNOCKDOWN_DURATION_SECONDS,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import { COURSE_ZONES, getTerrainPropertiesAt } from "./terrain";
import type { TerrainZone } from "./terrain";
import type {
  BallState,
  HoleState,
  PlayerState,
  Vector2,
  TrampolineState,
} from "./types";

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
 * @param forgiveness Extra radius padding (e.g. for server to absorb network desync)
 */
export function findHittableBall(
  player: PlayerState,
  balls: Iterable<BallState>,
  forgiveness: number = 0,
): BallState | null {
  const point = hitPoint(player);
  const reach = HIT_RADIUS + BALL_RADIUS + forgiveness;
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
export function predictedLanding(
  player: PlayerState,
  power: number,
  zones: TerrainZone[] = COURSE_ZONES,
): Vector2 {
  const f = facingOf(player);
  const origin = hitPoint(player);
  const terrain = getTerrainPropertiesAt(origin.x, origin.y, zones);
  const carry = carryForPower(power) * terrain.carryMultiplier;
  return { x: origin.x + f.x * carry, y: origin.y + f.y * carry };
}

/** Strikes `ball` along the hitter's facing with the given power. Mutates `ball`. */
export function strikeBall(
  ball: BallState,
  hitter: PlayerState,
  power: number,
  spin: number = 0,
  zones: TerrainZone[] = COURSE_ZONES,
): BallState {
  const terrain = getTerrainPropertiesAt(ball.x, ball.y, zones);
  const carry = carryForPower(power) * terrain.carryMultiplier;
  const velocity = launchVelocity(facingOf(hitter), carry);
  ball.vx = velocity.vx;
  ball.vy = velocity.vy;
  ball.vz = velocity.vz;
  ball.z = 0;
  ball.resting = false;
  ball.hitSeq += 1;
  ball.lastHitBy = hitter.id;
  ball.spin = spin;
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
    spin: 0,
  };
}

/**
 * Resolves a collision between a moving golf ball and a player.
 * A hit occurs if:
 * - The ball is in motion (!ball.resting)
 * - The player is not already knocked down / despawned
 * - The player is not the shooter (player.id !== ball.lastHitBy)
 * - Vertical height ball.z <= PLAYER_HEIGHT (higher balls fly over head)
 * - 2D distance <= PLAYER_RADIUS + BALL_RADIUS
 *
 * When hit:
 * - Player enters knockdown / despawn state for KNOCKDOWN_DURATION_SECONDS
 * - Ongoing swing / charge is cancelled
 * - The ball bounces radially off the player's collision cylinder with BALL_PLAYER_RESTITUTION
 *
 * Mutates ball and player. Returns true if a collision occurred.
 */
export function resolveBallPlayerCollision(
  ball: BallState,
  player: PlayerState,
): boolean {
  if (ball.resting) return false;
  if ((player.knockdownTimer ?? 0) > 0) return false;
  if (ball.lastHitBy && ball.lastHitBy === player.id) return false;
  if (ball.z > PLAYER_HEIGHT) return false;

  const reach = PLAYER_RADIUS + BALL_RADIUS;
  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist > reach) return false;

  player.knockdownTimer = KNOCKDOWN_DURATION_SECONDS;
  player.charge = 0;
  player.impactTimer = 0;
  player.impactDue = false;

  const nx = dist > 1e-4 ? dx / dist : 1;
  const ny = dist > 1e-4 ? dy / dist : 0;

  ball.x = player.x + nx * reach;
  ball.y = player.y + ny * reach;

  const dot = ball.vx * nx + ball.vy * ny;
  if (dot < 0) {
    ball.vx -= (1 + BALL_PLAYER_RESTITUTION) * dot * nx;
    ball.vy -= (1 + BALL_PLAYER_RESTITUTION) * dot * ny;
    ball.vz *= 0.5;
  }

  return true;
}

/**
 * Advances a ball by `dtSeconds`, split into fixed BALL_SUBSTEP_SECONDS
 * steps so the result doesn't depend on the caller's frame/tick rate
 * (beyond the final partial step). Mutates and returns `ball`.
 */
export function stepBall(
  ball: BallState,
  dtSeconds: number,
  zones: TerrainZone[] = COURSE_ZONES,
  players?: Iterable<PlayerState>,
  onPlayerHit?: (ball: BallState, victim: PlayerState) => void,
  holes?: Iterable<HoleState>,
  onHoleScored?: (ball: BallState, hole: HoleState) => void,
  trampolines?: Iterable<TrampolineState>,
): BallState {
  let remaining = dtSeconds;
  while (remaining > 1e-9 && !ball.resting) {
    const h = Math.min(BALL_SUBSTEP_SECONDS, remaining);
    substep(
      ball,
      h,
      zones,
      players,
      onPlayerHit,
      holes,
      onHoleScored,
      trampolines,
    );
    remaining -= h;
  }
  return ball;
}

/**
 * Extensible physics solver using Semi-Implicit Euler integration.
 * 1. Accumulate forces (Gravity, Magnus effect, Rolling friction with terrain properties).
 * 2. Integrate velocity (v += a * dt).
 * 3. Check stopping conditions.
 * 4. Integrate position (p += v * dt).
 * 5. Resolve constraints (Bounces, Player collisions, Walls).
 */
function substep(
  ball: BallState,
  h: number,
  zones: TerrainZone[] = COURSE_ZONES,
  players?: Iterable<PlayerState>,
  onPlayerHit?: (ball: BallState, victim: PlayerState) => void,
  holes?: Iterable<HoleState>,
  onHoleScored?: (ball: BallState, hole: HoleState) => void,
  trampolines?: Iterable<TrampolineState>,
): void {
  // 1. Accumulate Forces (as acceleration)
  let ax = 0;
  let ay = 0;
  let az = 0;

  const isAirborne = ball.z > 0 || ball.vz > 0;

  if (isAirborne) {
    az -= BALL_GRAVITY;

    // Arcade Magnus effect (curve)
    if (ball.spin) {
      const horizontalSpeed = Math.hypot(ball.vx, ball.vy);
      if (horizontalSpeed > 0) {
        // Curve force is perpendicular to velocity: (-vy, vx) curves right
        const dirX = -ball.vy / horizontalSpeed;
        const dirY = ball.vx / horizontalSpeed;
        const curveAccel = ball.spin;
        ax += dirX * curveAccel;
        ay += dirY * curveAccel;
      }
    }
  } else {
    // Rolling friction per terrain zone
    const terrain = getTerrainPropertiesAt(ball.x, ball.y, zones);
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 0) {
      const dirX = ball.vx / speed;
      const dirY = ball.vy / speed;
      ax -= dirX * terrain.rollDecel;
      ay -= dirY * terrain.rollDecel;
    }
  }

  // 2. Integrate Velocity (Semi-Implicit Euler)
  ball.vx += ax * h;
  ball.vy += ay * h;
  ball.vz += az * h;

  // 3. Stop Condition Check (Rolling)
  if (!isAirborne) {
    const terrain = getTerrainPropertiesAt(ball.x, ball.y, zones);
    const newSpeed = Math.hypot(ball.vx, ball.vy);
    const accelMagnitude = terrain.rollDecel * h;
    const oldSpeed = Math.hypot(ball.vx - ax * h, ball.vy - ay * h);
    if (newSpeed <= BALL_REST_SPEED || accelMagnitude >= oldSpeed) {
      ball.vx = 0;
      ball.vy = 0;
      ball.vz = 0;
      ball.z = 0;
      ball.spin = 0;
      ball.resting = true;
      return;
    }
  }

  // 4. Integrate Position
  ball.x += ball.vx * h;
  ball.y += ball.vy * h;
  ball.z += ball.vz * h;

  // 5. Constraints / Collisions
  if (ball.z <= 0) {
    let trampolined = false;
    if (trampolines) {
      for (const tramp of trampolines) {
        const dist = Math.hypot(ball.x - tramp.x, ball.y - tramp.y);
        if (dist <= tramp.radius) {
          ball.vz = tramp.bounceVelocity;
          ball.z = 0.01; // Detach from ground
          ball.resting = false;
          trampolined = true;
          break;
        }
      }
    }

    if (isAirborne && !trampolined) {
      ball.z = 0;
      if (-ball.vz > BALL_MIN_BOUNCE_SPEED) {
        const terrain = getTerrainPropertiesAt(ball.x, ball.y, zones);
        ball.vz = -ball.vz * terrain.restitution;
        ball.vx *= terrain.bounceFriction;
        ball.vy *= terrain.bounceFriction;
      } else {
        ball.vz = 0;
      }
    }

    if (holes) {
      for (const hole of holes) {
        const dist = Math.hypot(ball.x - hole.x, ball.y - hole.y);
        if (dist <= hole.radius) {
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
          ball.z = 0;
          ball.resting = true;
          onHoleScored?.(ball, hole);
          return;
        }
      }
    }
  }

  if (players) {
    for (const player of players) {
      if (resolveBallPlayerCollision(ball, player)) {
        onPlayerHit?.(ball, player);
      }
    }
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
