import {
  PLAYER_RADIUS,
  PLAYER_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import type { InputState, PlayerState } from "./types";

/**
 * Advances a player's position by one simulation step. Pure function of
 * (state, input, dt) so it produces identical results on the server
 * (authoritative) and on the client (local prediction) given the same input.
 * Mutates and returns `player`.
 */
export function stepPlayer(
  player: PlayerState,
  input: InputState,
  dtSeconds: number,
): PlayerState {
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

  player.x = clamp(
    player.x + dx * PLAYER_SPEED * dtSeconds,
    PLAYER_RADIUS,
    WORLD_WIDTH - PLAYER_RADIUS,
  );
  player.y = clamp(
    player.y + dy * PLAYER_SPEED * dtSeconds,
    PLAYER_RADIUS,
    WORLD_HEIGHT - PLAYER_RADIUS,
  );

  return player;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
