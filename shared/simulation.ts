import {
  PLAYER_RADIUS,
  PLAYER_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import type { InputState, PlayerState } from "./types";

/**
 * Advances a player by one simulation step: constant-speed 4-directional
 * movement, clamped to the world bounds. Pure function of its inputs so the
 * server (authoritative) and the client (local prediction) produce identical
 * results given identical state. Mutates and returns `player`.
 */
export function stepPlayer(
  player: PlayerState,
  input: InputState,
  dtSeconds: number,
): PlayerState {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    player.x += (dx / length) * PLAYER_SPEED * dtSeconds;
    player.y += (dy / length) * PLAYER_SPEED * dtSeconds;
  }
  player.x = clamp(player.x, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
  player.y = clamp(player.y, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);
  return player;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
