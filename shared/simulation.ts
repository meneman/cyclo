import type { CollisionMap } from "./collisionMap";
import {
  COLLISION_RADIUS,
  JUMP_DURATION_SECONDS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import type { InputState, JumpState, PlayerState } from "./types";

/**
 * Advances a player's position by one simulation step. Pure function of
 * (state, input, dt, jumpState, collisionMap) so it produces identical
 * results on the server (authoritative) and on the client (local prediction)
 * given the same input. Mutates and returns `player`.
 */
export function stepPlayer(
  player: PlayerState,
  input: InputState,
  dtSeconds: number,
  jumpState: JumpState,
  collisionMap?: CollisionMap,
): PlayerState {
  // Rising edge only — holding Space gives one jump, not continuous noclip.
  if (input.jump && !jumpState.keyWasHeld && jumpState.timeRemaining <= 0) {
    jumpState.timeRemaining = JUMP_DURATION_SECONDS;
  }
  jumpState.keyWasHeld = input.jump;
  jumpState.timeRemaining = Math.max(0, jumpState.timeRemaining - dtSeconds);
  player.jumping = jumpState.timeRemaining > 0;

  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
    player.rotation = Math.atan2(dy, dx);
  }

  const targetX = clamp(
    player.x + dx * PLAYER_SPEED * dtSeconds,
    PLAYER_RADIUS,
    WORLD_WIDTH - PLAYER_RADIUS,
  );
  const targetY = clamp(
    player.y + dy * PLAYER_SPEED * dtSeconds,
    PLAYER_RADIUS,
    WORLD_HEIGHT - PLAYER_RADIUS,
  );

  // While jumping, collision is ignored entirely (still clamped to world bounds above).
  if (player.jumping || !collisionMap) {
    player.x = targetX;
    player.y = targetY;
    return player;
  }

  // Slide along walls: try the full diagonal move, then each axis alone,
  // so bumping into a building doesn't kill movement along the street.
  if (collisionMap.isWalkableDisc(targetX, targetY, COLLISION_RADIUS)) {
    player.x = targetX;
    player.y = targetY;
  } else if (collisionMap.isWalkableDisc(targetX, player.y, COLLISION_RADIUS)) {
    player.x = targetX;
  } else if (collisionMap.isWalkableDisc(player.x, targetY, COLLISION_RADIUS)) {
    player.y = targetY;
  }

  return player;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
