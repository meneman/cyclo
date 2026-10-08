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
  /** Power of the most recently executed swing (0 to 1) */
  swingPower?: number;
  /** Monotonic counter incremented on every swing release */
  swingSeq?: number;
}

export type PlayerSnapshot = PlayerState;
