export interface Vector2 {
  x: number;
  y: number;
}

/**
 * Raw movement input held down by a client, sampled every input tick.
 * Generic 4-directional model: each flag moves at full speed along one
 * axis, diagonals are normalized so they are no faster than straight lines.
 */
export interface InputState {
  /** Up / W — move toward decreasing y */
  up: boolean;
  /** Down / S — move toward increasing y */
  down: boolean;
  /** Left / A — move toward decreasing x */
  left: boolean;
  /** Right / D — move toward increasing x */
  right: boolean;
  /** Space — holding charges the swing power */
  charging: boolean;
  /** Mouse aim direction (unit vector X) */
  aimDx?: number;
  /** Mouse aim direction (unit vector Y) */
  aimDy?: number;
}

/** Authoritative per-player simulation state, shared verbatim between server and client */
export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  color: number;
  /** Current swing charge from 0 (not charging) to 1 (full charge) */
  charge?: number;
  /** Current spin charge from -1 (left) to 1 (right) */
  spinCharge?: number;
  /** Power of the most recently executed swing (0 to 1) */
  swingPower?: number;
  /** Spin of the most recently executed swing (-1 to 1) */
  swingSpin?: number;
  /** Monotonic counter incremented on every swing release */
  swingSeq?: number;
  /**
   * Unit facing vector (world coords, y down) — the last movement direction,
   * one of the 8 headings. Shots fly along it. Defaults to (0, 1), south.
   */
  facingX?: number;
  facingY?: number;
  /** Seconds left in the downswing; the club meets the ball when it hits 0 */
  impactTimer?: number;
  /**
   * Set by stepPlayer on the step the downswing completes. The server
   * resolves the hit and clears it before broadcasting.
   */
  impactDue?: boolean;
  /** Seconds remaining in knockdown/despawn state after being hit by a ball */
  knockdownTimer?: number;
  /** Total frags (kills) scored by this player */
  frags?: number;
  /** Total golf holes completed by this player */
  holes?: number;
}

export type PlayerSnapshot = PlayerState;

/** Authoritative golf ball state. World coords (y down), z = height above ground. */
export interface BallState {
  id: string;
  /** Player the ball belongs to (color/label only — anyone may hit any ball) */
  ownerId: string;
  /** Owner's player color, for the ring around the ball */
  color: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** True once the ball has stopped; resting balls skip simulation */
  resting: boolean;
  /** Increments on every hit — clients use it to trigger hit effects */
  hitSeq: number;
  lastHitBy?: string;
  /** Arcade spin: negative curves left, positive curves right during flight */
  spin?: number;
}

export interface HoleState {
  id: string;
  x: number;
  y: number;
  radius: number;
}
