import { normalizeAngle, shortestAngleDelta } from "./angleMath";
import {
  PLAYER_ACCELERATION,
  PLAYER_FRICTION,
  PLAYER_MAX_SPEED,
  PLAYER_MAX_TURN_RATE,
  PLAYER_MIN_TURN_RATE,
  TURN_SPEED_PENALTY_PER_RADIAN,
} from "./constants";
import type { InputState, MovementState, PlayerState } from "./types";

/**
 * Advances heading (`player.rotation`) and forward speed (`movement.speed`)
 * by one step, from held directional input. Does NOT touch x/y — callers
 * derive a target position from the resulting rotation + speed
 * (cos/sin * speed * dt) and resolve that against world bounds/collision
 * separately. Mutates `player` and `movement` in place.
 *
 * Kept free of any collision/position concerns so it stays a self-contained
 * "how does the bike want to move" system — the natural place to add
 * drift (e.g. a lateral/slip term on MovementState) later.
 */
export function stepMovement(
  player: Pick<PlayerState, "rotation">,
  movement: MovementState,
  input: InputState,
  dtSeconds: number,
): void {
  const desiredHeading = desiredHeadingFromInput(input);

  // Turn rate depends on CURRENT speed (before this tick's accel/friction):
  // a slow bike pivots quickly, a fast bike turns in a wide arc.
  const speedFraction = clamp(movement.speed / PLAYER_MAX_SPEED, 0, 1);
  const turnRate = lerp(
    PLAYER_MAX_TURN_RATE,
    PLAYER_MIN_TURN_RATE,
    speedFraction,
  );

  let appliedDelta = 0;
  if (desiredHeading !== null) {
    const delta = shortestAngleDelta(player.rotation, desiredHeading);
    const maxStep = turnRate * dtSeconds;
    appliedDelta = clamp(delta, -maxStep, maxStep);
    player.rotation = normalizeAngle(player.rotation + appliedDelta);
  }

  // Accelerate while steering somewhere; coast (friction) toward 0 with no input.
  if (desiredHeading !== null) {
    movement.speed = Math.min(
      PLAYER_MAX_SPEED,
      movement.speed + PLAYER_ACCELERATION * dtSeconds,
    );
  } else {
    movement.speed = Math.max(0, movement.speed - PLAYER_FRICTION * dtSeconds);
  }

  // Turning saps a little speed, proportional to the heading change actually
  // applied this tick.
  movement.speed = Math.max(
    0,
    movement.speed - Math.abs(appliedDelta) * TURN_SPEED_PENALTY_PER_RADIAN,
  );
}

/** Desired world-space heading from held keys, or null if nothing is held. */
function desiredHeadingFromInput(input: InputState): number | null {
  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (dx === 0 && dy === 0) return null;
  return Math.atan2(dy, dx);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
