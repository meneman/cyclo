import {
  MAX_CHARGE_DURATION_SECONDS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import type { InputState, PlayerState, Vector2 } from "./types";

/** Diagonal component so diagonals run at the same speed as cardinals */
const DIAGONAL_COMPONENT = Math.SQRT1_2;

/**
 * Resolves held keys to one of 8 unit movement vectors (4 cardinal + 4
 * in-between from two-key chords), or null when idle. Opposite keys cancel
 * before diagonal detection, so three-key chords reduce to the surviving
 * axis (Up+Left+Down resolves to Left). Shared by server and client, so both
 * sides always agree on the direction.
 */
export function directionFromInput(input: InputState): Vector2 | null {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0) {
    return { x: dx * DIAGONAL_COMPONENT, y: dy * DIAGONAL_COMPONENT };
  }
  return { x: dx, y: dy };
}

/**
 * Advances a player by one simulation step: constant-speed 8-vector
 * movement, clamped to the world bounds.
 *
 * Holding Space (`charging: true`) loads the golf swing, locking movement.
 * Releasing Space triggers a swing with the accumulated power (0..1).
 *
 * Pure function of its inputs so the server (authoritative) and the client
 * (local prediction) produce identical results given identical state.
 * Mutates and returns `player`.
 */
export function stepPlayer(
  player: PlayerState,
  input: InputState,
  dtSeconds: number,
): PlayerState {
  if (input.charging) {
    const currentCharge = player.charge ?? 0;
    player.charge = Math.min(
      1,
      currentCharge + dtSeconds / MAX_CHARGE_DURATION_SECONDS,
    );
  } else {
    if ((player.charge ?? 0) > 0) {
      // Releasing space executes the swing
      player.swingPower = player.charge;
      player.swingSeq = (player.swingSeq ?? 0) + 1;
      player.charge = 0;
    }

    const direction = directionFromInput(input);
    if (direction) {
      player.x += direction.x * PLAYER_SPEED * dtSeconds;
      player.y += direction.y * PLAYER_SPEED * dtSeconds;
    }
  }

  player.x = clamp(player.x, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
  player.y = clamp(player.y, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);
  return player;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
