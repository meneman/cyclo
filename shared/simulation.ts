import type { CollisionMap } from "./collisionMap";
import {
  COLLISION_RADIUS,
  JUMP_DURATION_SECONDS,
  PLAYER_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import { stepMovement } from "./movement";
import type {
  InputState,
  JumpState,
  MovementState,
  PlayerState,
} from "./types";

/**
 * Advances a player by one simulation step: jump timer -> heading/speed
 * (shared/movement.ts) -> position integration + collision resolution. Pure
 * function of its inputs so the server (authoritative) and the client (local
 * prediction) produce identical results given identical state. Mutates and
 * returns `player`.
 */
export function stepPlayer(
  player: PlayerState,
  input: InputState,
  dtSeconds: number,
  jumpState: JumpState,
  movement: MovementState,
  collisionMap?: CollisionMap,
): PlayerState {
  applyJump(player, input, dtSeconds, jumpState);
  stepMovement(player, movement, input, dtSeconds);

  const targetX =
    player.x + Math.cos(player.rotation) * movement.speed * dtSeconds;
  const targetY =
    player.y + Math.sin(player.rotation) * movement.speed * dtSeconds;
  resolvePosition(player, targetX, targetY, collisionMap);

  return player;
}

/** Rising edge only — holding Space gives one jump, not continuous noclip. */
function applyJump(
  player: PlayerState,
  input: InputState,
  dtSeconds: number,
  jumpState: JumpState,
): void {
  if (input.jump && !jumpState.keyWasHeld && jumpState.timeRemaining <= 0) {
    jumpState.timeRemaining = JUMP_DURATION_SECONDS;
  }
  jumpState.keyWasHeld = input.jump;
  jumpState.timeRemaining = Math.max(0, jumpState.timeRemaining - dtSeconds);
  player.jumping = jumpState.timeRemaining > 0;
}

/**
 * World-bounds clamp + wall-slide collision (try the full diagonal move,
 * then each axis alone, so bumping into a building doesn't kill movement
 * along the street). While jumping, collision is ignored entirely (still
 * clamped to world bounds).
 */
function resolvePosition(
  player: PlayerState,
  rawX: number,
  rawY: number,
  collisionMap?: CollisionMap,
): void {
  const targetX = clamp(rawX, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
  const targetY = clamp(rawY, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);

  if (player.jumping || !collisionMap) {
    player.x = targetX;
    player.y = targetY;
    return;
  }

  if (collisionMap.isWalkableDisc(targetX, targetY, COLLISION_RADIUS)) {
    player.x = targetX;
    player.y = targetY;
  } else if (collisionMap.isWalkableDisc(targetX, player.y, COLLISION_RADIUS)) {
    player.x = targetX;
  } else if (collisionMap.isWalkableDisc(player.x, targetY, COLLISION_RADIUS)) {
    player.y = targetY;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
