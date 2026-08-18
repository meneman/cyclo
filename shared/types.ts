export interface Vector2 {
  x: number;
  y: number;
}

/** Raw directional keys held down by a client, sampled every input tick */
export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Space — triggers a brief collision-free hop, see JUMP_DURATION_SECONDS */
  jump: boolean;
}

/** Authoritative per-player simulation state, shared verbatim between server and client */
export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Facing direction in radians, only meaningful while moving */
  rotation: number;
  color: number;
  /** True while the collision-free jump window is active */
  jumping: boolean;
}

export type PlayerSnapshot = PlayerState;

/**
 * Per-connection jump timer bookkeeping. Deliberately NOT part of
 * PlayerState — it's local decay/edge-detection state, not something other
 * clients need synced (they only need the derived PlayerState.jumping flag).
 */
export interface JumpState {
  timeRemaining: number;
  /** Tracks the previous tick's input.jump, so holding Space triggers one
   *  jump, not a continuous re-trigger every tick. */
  keyWasHeld: boolean;
}

/**
 * Per-connection movement scratch state — persistent forward speed. Heading
 * lives in PlayerState.rotation (already synced/meaningful on its own); speed
 * is deliberately NOT part of PlayerState/PlayerSnapshot, same reasoning as
 * JumpState — remote players are purely snapshot-interpolated on x/y/rotation,
 * so only the local predicted player and the server's own sim need it.
 * Leaves room to add a lateral/slip term here later for drift.
 */
export interface MovementState {
  /** Current forward speed along `rotation`, world units/sec, in [0, PLAYER_MAX_SPEED] */
  speed: number;
}
