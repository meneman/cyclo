import {
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
 * (shared/movement.ts) -> position integration, clamped to the open arena.
 * Pure function of its inputs so the server (authoritative) and the client
 * (local prediction) produce identical results given identical state.
 * Mutates and returns `player`.
 */
export function stepPlayer(
  player: PlayerState,
  input: InputState,
  dtSeconds: number,
  jumpState: JumpState,
  movement: MovementState,
): PlayerState {
  applyJump(player, input, dtSeconds, jumpState);
  stepMovement(player, movement, input, dtSeconds);

  const targetX =
    player.x + Math.cos(player.rotation) * movement.speed * dtSeconds;
  const targetY =
    player.y + Math.sin(player.rotation) * movement.speed * dtSeconds;
  resolvePosition(player, targetX, targetY);

  return player;
}

/** Rising edge only — holding Space gives one jump, not continuous jumping. */
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

/** Free movement on an open arena — just clamp to the world bounds. */
function resolvePosition(
  player: PlayerState,
  rawX: number,
  rawY: number,
): void {
  player.x = clamp(rawX, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
  player.y = clamp(rawY, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
