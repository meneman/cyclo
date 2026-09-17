import type { InputState, PlayerSnapshot } from "./types";

/**
 * Plain string-literal unions instead of TS enums: safe under `isolatedModules`
 * (required by both esbuild/Vite on the client and Bun's transpiler on the server).
 */
export const ClientMessageType = {
  Join: "join",
  Input: "input",
  Ping: "ping",
  Chat: "chat",
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
} as const;
export type ServerMessageType =
  (typeof ServerMessageType)[keyof typeof ServerMessageType];

export type ClientMessage =
  | { type: typeof ClientMessageType.Join; name: string }
  | { type: typeof ClientMessageType.Input; seq: number; input: InputState }
  | { type: typeof ClientMessageType.Ping; t: number }
  | { type: typeof ClientMessageType.Chat; text: string };

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
  return {
    up: Boolean(record.up),
    down: Boolean(record.down),
    left: Boolean(record.left),
    right: Boolean(record.right),
    jump: Boolean(record.jump),
  };
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
    case ClientMessageType.Join:
      return typeof record.name === "string"
        ? { type: ClientMessageType.Join, name: record.name }
        : null;
    case ClientMessageType.Ping:
      return typeof record.t === "number" && Number.isFinite(record.t)
        ? { type: ClientMessageType.Ping, t: record.t }
        : null;
    case ClientMessageType.Chat:
      return typeof record.text === "string"
        ? { type: ClientMessageType.Chat, text: record.text }
        : null;
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
    }
  | { type: typeof ServerMessageType.State; players: PlayerSnapshot[] }
  | { type: typeof ServerMessageType.PlayerJoined; player: PlayerSnapshot }
  | { type: typeof ServerMessageType.PlayerLeft; id: string }
  | { type: typeof ServerMessageType.Pong; t: number }
  | {
      type: typeof ServerMessageType.Chat;
      id: string;
      name: string;
      text: string;
    };
