import type { Server, ServerWebSocket } from "bun";
import {
  createBall,
  findHittableBall,
  hitPoint,
  stepBall,
  strikeBall,
} from "../../shared/ballPhysics";
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
import type { BallState, InputState, PlayerState } from "../../shared/types";

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
  charging: false,
};

interface Connection {
  ws: ServerWebSocket<SocketData>;
  state: PlayerState;
  input: InputState;
  lastSeq: number;
  /** Set once this connection has sent a real name via Join — gates the join/leave chat announcements */
  announcedName: boolean;
}

/**
 * Owns all connected players and runs the fixed-rate authoritative
 * simulation tick. One instance per server process.
 */
export class World {
  private readonly connections = new Map<string, Connection>();
  private readonly balls = new Map<string, BallState>();
  private nextColor = 0;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;

  public addPlayer(id: string, ws: ServerWebSocket<SocketData>): void {
    const state: PlayerState = {
      id,
      name: `Player-${id.slice(0, 4)}`,
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT / 2,
      color: PLAYER_COLORS[this.nextColor++ % PLAYER_COLORS.length],
      facingX: 0,
      facingY: 1,
    };

    const ballPos = hitPoint(state);
    const ball = createBall(
      `ball-${id}`,
      id,
      state.color,
      ballPos.x,
      ballPos.y,
    );
    this.balls.set(ball.id, ball);

    this.connections.set(id, {
      ws,
      state,
      // Clone: sharing the frozen-looking IDLE_INPUT reference across
      // connections would let one mutation corrupt every idle player.
      input: { ...IDLE_INPUT },
      lastSeq: 0,
      announcedName: false,
    });
    console.log(
      `[cyclo:server] +player ${id} at (${state.x}, ${state.y}) players=${this.connections.size} balls=${this.balls.size}`,
    );

    this.sendTo(ws, {
      type: ServerMessageType.Welcome,
      id,
      tickRateHz: TICK_RATE_HZ,
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      players: this.snapshot(),
      balls: this.ballSnapshot(),
    });

    this.broadcast({ type: ServerMessageType.PlayerJoined, player: state }, id);
  }

  public removePlayer(id: string): void {
    const connection = this.connections.get(id);
    if (!connection) {
      console.log(`[cyclo:server] -player ${id} (unknown)`);
      return;
    }
    this.connections.delete(id);
    this.balls.delete(`ball-${id}`);
    console.log(
      `[cyclo:server] -player ${id} "${connection.state.name}" players=${this.connections.size} balls=${this.balls.size}`,
    );
    this.broadcast({ type: ServerMessageType.PlayerLeft, id });
    if (connection.announcedName) {
      this.announce(`player left: "${connection.state.name}"`);
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
        } else {
          console.debug(
            `[cyclo:server] stale input from ${id} seq=${message.seq} last=${connection.lastSeq}`,
          );
        }
        break;
      case ClientMessageType.Ping:
        this.sendTo(connection.ws, {
          type: ServerMessageType.Pong,
          t: message.t,
        });
        break;
      case ClientMessageType.Join: {
        const name = message.name.trim().slice(0, 24);
        console.log(
          `[cyclo:server] join ${id} as "${name || connection.state.name}"`,
        );
        if (name) connection.state.name = name;
        if (!connection.announcedName) {
          connection.announcedName = true;
          this.announce(`new player here: "${connection.state.name}"`);
        }
        break;
      }
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
    this.ticks++;

    const dtSeconds = TICK_INTERVAL_MS / 1000;
    for (const connection of this.connections.values()) {
      stepPlayer(connection.state, connection.input, dtSeconds);
      if (connection.state.impactDue) {
        connection.state.impactDue = false;
        const hittable = findHittableBall(
          connection.state,
          this.balls.values(),
        );
        if (hittable) {
          strikeBall(
            hittable,
            connection.state,
            connection.state.swingPower ?? 1,
          );
        }
      }
    }

    for (const ball of this.balls.values()) {
      if (!ball.resting) {
        stepBall(ball, dtSeconds);
      }
    }

    if (this.ticks === 1 || this.ticks % (TICK_RATE_HZ * 10) === 0) {
      const first = this.connections.values().next().value;
      console.debug(
        `[cyclo:server] tick ${this.ticks}: ${this.connections.size} players, ${this.balls.size} balls` +
          (first
            ? ` e.g. "${first.state.name}" at (${first.state.x.toFixed(0)}, ${first.state.y.toFixed(0)})`
            : ""),
      );
    }

    const message: ServerMessage = {
      type: ServerMessageType.State,
      players: this.snapshot(),
      balls: this.ballSnapshot(),
    };
    server.publish(WORLD_TOPIC, JSON.stringify(message));
  }

  private snapshot(): PlayerState[] {
    return Array.from(this.connections.values(), (c) => ({ ...c.state }));
  }

  private ballSnapshot(): BallState[] {
    return Array.from(this.balls.values(), (b) => ({ ...b }));
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
