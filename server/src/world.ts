import type { Server, ServerWebSocket } from "bun";

import type { CollisionMap } from "../../shared/collisionMap";
import {
  SPAWN_CLEARANCE_RADIUS,
  TICK_INTERVAL_MS,
  TICK_RATE_HZ,
  WORLD_HEIGHT,
  WORLD_TOPIC,
  WORLD_WIDTH,
} from "../../shared/constants";
import { ClientMessageType, ServerMessageType } from "../../shared/protocol";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";
import { stepPlayer } from "../../shared/simulation";
import type {
  InputState,
  JumpState,
  MovementState,
  PlayerState,
} from "../../shared/types";

export interface SocketData {
  playerId: string;
}

const CHAT_MAX_LENGTH = 200;
const SYSTEM_SENDER_ID = "system";
const SYSTEM_SENDER_NAME = "System";

const PLAYER_COLORS = [
  0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0xec4899, 0x14b8a6,
  0xf97316,
];

const IDLE_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  jump: false,
};

interface Connection {
  ws: ServerWebSocket<SocketData>;
  state: PlayerState;
  input: InputState;
  lastSeq: number;
  jump: JumpState;
  movement: MovementState;
  /** Set once this connection has sent a real name via Join — gates the join/leave chat announcements */
  announcedName: boolean;
}

/**
 * Owns all connected players and runs the fixed-rate authoritative
 * simulation tick. One instance per server process.
 */
export class World {
  private readonly connections = new Map<string, Connection>();
  private nextColor = 0;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly collisionMap: CollisionMap) {}

  public addPlayer(id: string, ws: ServerWebSocket<SocketData>): void {
    const spawn = this.collisionMap.findNearestWalkable(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      SPAWN_CLEARANCE_RADIUS,
    ) ?? { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };

    const state: PlayerState = {
      id,
      name: `Player-${id.slice(0, 4)}`,
      x: spawn.x,
      y: spawn.y,
      rotation: 0,
      color: PLAYER_COLORS[this.nextColor++ % PLAYER_COLORS.length],
      jumping: false,
    };

    this.connections.set(id, {
      ws,
      state,
      input: IDLE_INPUT,
      lastSeq: 0,
      jump: { timeRemaining: 0, keyWasHeld: false },
      movement: { speed: 0 },
      announcedName: false,
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
    const connection = this.connections.get(id);
    if (!connection) return;
    this.connections.delete(id);
    this.broadcast({ type: ServerMessageType.PlayerLeft, id });
    if (connection.announcedName) {
      this.announce(
        `cyclist fallen off the server: "${connection.state.name}"`,
      );
    }
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
        if (!connection.announcedName) {
          connection.announcedName = true;
          this.announce(`new cyclist here: "${connection.state.name}"`);
        }
        break;
      case ClientMessageType.Chat: {
        const text = message.text.trim().slice(0, CHAT_MAX_LENGTH);
        if (!text) break;
        this.broadcast({
          type: ServerMessageType.Chat,
          id,
          name: connection.state.name,
          text,
        });
        break;
      }
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
      stepPlayer(
        connection.state,
        connection.input,
        dtSeconds,
        connection.jump,
        connection.movement,
        this.collisionMap,
      );
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

  /** Broadcasts a system chat line (join/leave announcements) to everyone */
  private announce(text: string): void {
    this.broadcast({
      type: ServerMessageType.Chat,
      id: SYSTEM_SENDER_ID,
      name: SYSTEM_SENDER_NAME,
      text,
    });
  }

  private broadcast(message: ServerMessage, excludeId?: string): void {
    const data = JSON.stringify(message);
    for (const [id, connection] of this.connections) {
      if (id === excludeId) continue;
      connection.ws.send(data);
    }
  }
}
