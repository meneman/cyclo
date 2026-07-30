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
}

export type PlayerSnapshot = PlayerState;
