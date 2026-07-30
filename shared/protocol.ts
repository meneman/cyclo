import type { InputState, PlayerSnapshot } from "./types";

/**
 * Plain string-literal unions instead of TS enums: safe under `isolatedModules`
 * (required by both esbuild/Vite on the client and Bun's transpiler on the server).
 */
export const ClientMessageType = {
  Join: "join",
  Input: "input",
  Ping: "ping",
} as const;
export type ClientMessageType =
  (typeof ClientMessageType)[keyof typeof ClientMessageType];

export const ServerMessageType = {
  Welcome: "welcome",
  State: "state",
  PlayerJoined: "playerJoined",
  PlayerLeft: "playerLeft",
  Pong: "pong",
} as const;
export type ServerMessageType =
  (typeof ServerMessageType)[keyof typeof ServerMessageType];

export type ClientMessage =
  | { type: typeof ClientMessageType.Join; name: string }
  | { type: typeof ClientMessageType.Input; seq: number; input: InputState }
  | { type: typeof ClientMessageType.Ping; t: number };

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
  | { type: typeof ServerMessageType.Pong; t: number };
