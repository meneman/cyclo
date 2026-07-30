import type { Server, ServerWebSocket } from "bun";

import {
  TICK_INTERVAL_MS,
  TICK_RATE_HZ,
  WORLD_HEIGHT,
  WORLD_TOPIC,
  WORLD_WIDTH,
} from "../../shared/constants";
import { ClientMessageType, ServerMessageType } from "../../shared/protocol";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";
import { stepPlayer } from "../../shared/simulation";
import type { InputState, PlayerState } from "../../shared/types";

export interface SocketData {
  playerId: string;
}

const PLAYER_COLORS = [
  0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0xec4899, 0x14b8a6,
  0xf97316,
];

const IDLE_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
};

interface Connection {
  ws: ServerWebSocket<SocketData>;
  state: PlayerState;
  input: InputState;
  lastSeq: number;
}

/**
 * Owns all connected players and runs the fixed-rate authoritative
 * simulation tick. One instance per server process.
 */
export class World {
  private readonly connections = new Map<string, Connection>();
  private nextColor = 0;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  public addPlayer(id: string, ws: ServerWebSocket<SocketData>): void {
    const state: PlayerState = {
      id,
      name: `Player-${id.slice(0, 4)}`,
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT / 2,
      rotation: 0,
      color: PLAYER_COLORS[this.nextColor++ % PLAYER_COLORS.length],
    };

    this.connections.set(id, {
      ws,
      state,
      input: IDLE_INPUT,
      lastSeq: 0,
    });

    this.sendTo(ws, {
      type: ServerMessageType.Welcome,
      id,
      tickRateHz: TICK_RATE_HZ,
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      players: this.snapshot(),
    });

    this.broadcast({ type: ServerMessageType.PlayerJoined, player: state }, id);
  }

  public removePlayer(id: string): void {
    if (!this.connections.delete(id)) return;
    this.broadcast({ type: ServerMessageType.PlayerLeft, id });
  }

  public handleMessage(id: string, message: ClientMessage): void {
    const connection = this.connections.get(id);
    if (!connection) return;

    switch (message.type) {
      case ClientMessageType.Input:
        if (message.seq > connection.lastSeq) {
          connection.lastSeq = message.seq;
          connection.input = message.input;
        }
        break;
      case ClientMessageType.Ping:
        this.sendTo(connection.ws, {
          type: ServerMessageType.Pong,
          t: message.t,
        });
        break;
      case ClientMessageType.Join:
        connection.state.name =
          message.name.slice(0, 24) || connection.state.name;
        break;
    }
  }

  /** Start the fixed-rate simulation loop. Broadcasts run through `server.publish`. */
  public start(server: Server<SocketData>): void {
    if (this.tickHandle) return;
    this.tickHandle = setInterval(() => this.tick(server), TICK_INTERVAL_MS);
  }

  public stop(): void {
    if (!this.tickHandle) return;
    clearInterval(this.tickHandle);
    this.tickHandle = null;
  }

  private tick(server: Server<SocketData>): void {
    if (this.connections.size === 0) return;

    const dtSeconds = TICK_INTERVAL_MS / 1000;
    for (const connection of this.connections.values()) {
      stepPlayer(connection.state, connection.input, dtSeconds);
    }

    const message: ServerMessage = {
      type: ServerMessageType.State,
      players: this.snapshot(),
    };
    server.publish(WORLD_TOPIC, JSON.stringify(message));
  }

  private snapshot(): PlayerState[] {
    return Array.from(this.connections.values(), (c) => ({ ...c.state }));
  }

  private sendTo(
    ws: ServerWebSocket<SocketData>,
    message: ServerMessage,
  ): void {
    ws.send(JSON.stringify(message));
  }

  private broadcast(message: ServerMessage, excludeId?: string): void {
    const data = JSON.stringify(message);
    for (const [id, connection] of this.connections) {
      if (id === excludeId) continue;
      connection.ws.send(data);
    }
  }
}
