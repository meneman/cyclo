import type {
  BallState,
  InputState,
  PlayerSnapshot,
  HoleState,
  TrampolineState,
  MatchState,
} from "./types";

/**
 * Plain string-literal unions instead of TS enums: safe under `isolatedModules`
 * (required by both esbuild/Vite on the client and Bun's transpiler on the server).
 */
export const ClientMessageType = {
  Join: "join",
  Input: "input",
  Ping: "ping",
  Chat: "chat",
  SetColor: "setColor",
  Rematch: "rematch",
} as const;
export type ClientMessageType =
  (typeof ClientMessageType)[keyof typeof ClientMessageType];

export const ServerMessageType = {
  Welcome: "welcome",
  State: "state",
  PlayerJoined: "playerJoined",
  PlayerLeft: "playerLeft",
  Pong: "pong",
  Chat: "chat",
  Kill: "kill",
  HoleScored: "holeScored",
  MatchState: "matchState",
} as const;
export type ServerMessageType =
  (typeof ServerMessageType)[keyof typeof ServerMessageType];

export type ClientMessage =
  | {
      type: typeof ClientMessageType.Join;
      name: string;
      color?: number;
      roomId?: string;
    }
  | { type: typeof ClientMessageType.Input; seq: number; input: InputState }
  | { type: typeof ClientMessageType.Ping; t: number }
  | { type: typeof ClientMessageType.Chat; text: string }
  | { type: typeof ClientMessageType.SetColor; color: number }
  | { type: typeof ClientMessageType.Rematch };

/**
 * Coerces an untrusted value into an InputState — any truthy flag counts as
 * held. The server runs this on every input payload so a malformed or
 * malicious message can never throw (or poison) the simulation.
 */
export function sanitizeInputState(value: unknown): InputState {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};

  const state: InputState = {
    up: Boolean(record.up),
    down: Boolean(record.down),
    left: Boolean(record.left),
    right: Boolean(record.right),
    charging: Boolean(record.charging),
  };

  if (typeof record.aimDx === "number" && Number.isFinite(record.aimDx)) {
    state.aimDx = record.aimDx;
  }
  if (typeof record.aimDy === "number" && Number.isFinite(record.aimDy)) {
    state.aimDy = record.aimDy;
  }

  return state;
}

/**
 * Parses and structurally validates a raw WebSocket payload. Returns null for
 * anything that is not a well-formed client message — callers drop it without
 * touching game state. Sanitizes the input flags of `input` messages so the
 * world step only ever sees a valid InputState.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string") return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;

  switch (record.type) {
    case ClientMessageType.Input: {
      if (
        typeof record.seq !== "number" ||
        !Number.isFinite(record.seq) ||
        typeof record.input !== "object" ||
        record.input === null
      ) {
        return null;
      }
      return {
        type: ClientMessageType.Input,
        seq: record.seq,
        input: sanitizeInputState(record.input),
      };
    }
    case ClientMessageType.Join: {
      if (typeof record.name !== "string") return null;
      const joinMsg: {
        type: typeof ClientMessageType.Join;
        name: string;
        color?: number;
        roomId?: string;
      } = {
        type: ClientMessageType.Join,
        name: record.name,
      };
      if (typeof record.color === "number" && Number.isFinite(record.color)) {
        joinMsg.color = record.color;
      }
      if (
        typeof record.roomId === "string" &&
        record.roomId.trim().length > 0
      ) {
        joinMsg.roomId = record.roomId.trim();
      }
      return joinMsg;
    }
    case ClientMessageType.Ping:
      return typeof record.t === "number" && Number.isFinite(record.t)
        ? { type: ClientMessageType.Ping, t: record.t }
        : null;
    case ClientMessageType.Chat:
      return typeof record.text === "string"
        ? { type: ClientMessageType.Chat, text: record.text }
        : null;
    case ClientMessageType.SetColor:
      return typeof record.color === "number" && Number.isFinite(record.color)
        ? { type: ClientMessageType.SetColor, color: record.color }
        : null;
    case ClientMessageType.Rematch:
      return { type: ClientMessageType.Rematch };
    default:
      return null;
  }
}

export type ServerMessage =
  | {
      type: typeof ServerMessageType.Welcome;
      id: string;
      tickRateHz: number;
      world: { width: number; height: number };
      players: PlayerSnapshot[];
      balls: BallState[];
      holes: HoleState[];
      trampolines: TrampolineState[];
      match: MatchState;
    }
  | {
      type: typeof ServerMessageType.State;
      players: PlayerSnapshot[];
      balls: BallState[];
      holes: HoleState[];
      trampolines: TrampolineState[];
    }
  | { type: typeof ServerMessageType.PlayerJoined; player: PlayerSnapshot }
  | { type: typeof ServerMessageType.PlayerLeft; id: string }
  | { type: typeof ServerMessageType.Pong; t: number }
  | {
      type: typeof ServerMessageType.Chat;
      id: string;
      name: string;
      text: string;
    }
  | {
      type: typeof ServerMessageType.Kill;
      killerId: string;
      killerName: string;
      victimId: string;
      victimName: string;
    }
  | {
      type: typeof ServerMessageType.HoleScored;
      playerId: string;
      playerName: string;
      holeId: string;
    }
  | {
      type: typeof ServerMessageType.MatchState;
      match: MatchState;
    };
