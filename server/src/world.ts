import type { Server, ServerWebSocket } from "bun";
import {
  createBall,
  findHittableBall,
  hitPoint,
  stepBall,
  strikeBall,
} from "../../shared/ballPhysics";
import {
  MATCH_COUNTDOWN_SECONDS,
  MATCH_TARGET_SCORE,
  MATCH_TEE_1_SPAWN,
  MATCH_TEE_2_SPAWN,
  PLAYER_COLORS,
  TICK_INTERVAL_MS,
  TICK_RATE_HZ,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../shared/constants";
import { ClientMessageType, ServerMessageType } from "../../shared/protocol";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";
import { stepPlayer } from "../../shared/simulation";
import { COURSE_ZONES } from "../../shared/terrain";
import { MatchStatus } from "../../shared/types";
import type {
  BallState,
  InputState,
  PlayerState,
  HoleState,
  MatchPlayerInfo,
  MatchState,
  TrampolineState,
} from "../../shared/types";
import type { BotPlayer, BotSpawnOptions } from "./bot";
import { createBotPlayer, DEFAULT_BOT_SPAWNS, stepBot } from "./bot";

export interface SocketData {
  playerId: string;
  roomId?: string;
  requestedRoom?: string;
}

const CHAT_MAX_LENGTH = 200;
const SYSTEM_SENDER_ID = "system";
const SYSTEM_SENDER_NAME = "System";

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
 * Owns connected players for a room and runs the fixed-rate authoritative
 * simulation tick. One instance per room.
 */
export class World {
  public readonly id: string;
  public readonly topic: string;
  private readonly connections = new Map<string, Connection>();
  private readonly bots = new Map<string, BotPlayer>();
  private readonly balls = new Map<string, BallState>();
  private readonly holes = new Map<string, HoleState>();
  private readonly trampolines = new Map<string, TrampolineState>();
  private nextColor = 0;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private matchStatus: MatchStatus = MatchStatus.Waiting;
  private countdownTimer: number | null = null;
  private winnerId?: string;
  private winnerName?: string;

  constructor(id: string = "default") {
    this.id = id;
    this.topic = `room:${id}`;
    for (let i = 0; i < 30; i++) {
      const id = `hole-${i}`;
      this.holes.set(id, {
        id,
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        radius: 30 + Math.random() * 20,
      });
    }

    for (let i = 0; i < 5; i++) {
      const id = `trampoline-${i}`;
      // Put the first trampoline right next to the spawn point so it's easy to test
      const x = i === 0 ? WORLD_WIDTH / 2 + 100 : Math.random() * WORLD_WIDTH;
      const y = i === 0 ? WORLD_HEIGHT / 2 : Math.random() * WORLD_HEIGHT;
      this.trampolines.set(id, {
        id,
        x,
        y,
        radius: 40,
        bounceVelocity: 800,
      });
    }

    this.initDefaultBots();
  }

  private initDefaultBots(): void {
    for (const config of DEFAULT_BOT_SPAWNS) {
      this.spawnBot(config);
    }
  }

  public spawnBot(options: BotSpawnOptions = {}): BotPlayer {
    const color = PLAYER_COLORS[this.nextColor++ % PLAYER_COLORS.length];
    const bot = createBotPlayer(options, color);
    this.bots.set(bot.state.id, bot);

    const ballPos = hitPoint(bot.state);
    const ball = createBall(
      `ball-${bot.state.id}`,
      bot.state.id,
      bot.state.color,
      ballPos.x,
      ballPos.y,
    );
    this.balls.set(ball.id, ball);

    console.log(
      `[golfi:server] +bot ${bot.state.id} "${bot.state.name}" at (${bot.state.x.toFixed(0)}, ${bot.state.y.toFixed(0)}) bots=${this.bots.size}`,
    );

    this.broadcast({
      type: ServerMessageType.PlayerJoined,
      player: bot.state,
    });

    return bot;
  }

  public spawnRandomBots(count: number): void {
    for (let i = 0; i < count; i++) {
      const margin = 300;
      const x = margin + Math.random() * (WORLD_WIDTH - margin * 2);
      const y = margin + Math.random() * (WORLD_HEIGHT - margin * 2);
      this.spawnBot({
        x,
        y,
        patrolRadius: 200 + Math.random() * 300,
      });
    }
  }

  public clearBots(): number {
    const count = this.bots.size;
    for (const bot of this.bots.values()) {
      this.balls.delete(`ball-${bot.state.id}`);
      this.broadcast({
        type: ServerMessageType.PlayerLeft,
        id: bot.state.id,
      });
    }
    this.bots.clear();
    console.log(`[golfi:server] cleared all bots (count=${count})`);
    return count;
  }

  public getPlayerCount(): number {
    return this.connections.size;
  }

  public getMatchState(): MatchState {
    const players: MatchPlayerInfo[] = [];
    for (const c of this.connections.values()) {
      const frags = c.state.frags ?? 0;
      const holes = c.state.holes ?? 0;
      players.push({
        id: c.state.id,
        name: c.state.name,
        color: c.state.color,
        frags,
        holes,
        score: frags + holes,
      });
    }
    return {
      roomId: this.id,
      status: this.matchStatus,
      countdownSeconds:
        this.countdownTimer !== null
          ? Math.max(0, Math.ceil(this.countdownTimer))
          : null,
      targetScore: MATCH_TARGET_SCORE,
      winnerId: this.winnerId,
      winnerName: this.winnerName,
      players,
    };
  }

  public broadcastMatchState(): void {
    this.broadcast({
      type: ServerMessageType.MatchState,
      match: this.getMatchState(),
    });
  }

  public addPlayer(id: string, ws: ServerWebSocket<SocketData>): void {
    const randomColor =
      PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
    const state: PlayerState = {
      id,
      name: `Player-${id.slice(0, 4)}`,
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT / 2,
      color: randomColor,
      facingX: 0,
      facingY: 1,
      frags: 0,
      holes: 0,
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
      `[golfi:server] +player ${id} at (${state.x}, ${state.y}) players=${this.connections.size} balls=${this.balls.size}`,
    );

    this.sendTo(ws, {
      type: ServerMessageType.Welcome,
      id,
      roomId: this.id,
      tickRateHz: TICK_RATE_HZ,
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      players: this.snapshot(),
      balls: this.ballSnapshot(),
      holes: this.holeSnapshot(),
      trampolines: this.trampolineSnapshot(),
      match: this.getMatchState(),
    });

    this.broadcast({ type: ServerMessageType.PlayerJoined, player: state }, id);

    // If 2 players are now in the room and we are waiting, start 10s countdown!
    if (
      this.connections.size === 2 &&
      this.matchStatus === MatchStatus.Waiting
    ) {
      this.matchStatus = MatchStatus.Countdown;
      this.countdownTimer = MATCH_COUNTDOWN_SECONDS;
      this.announce("2 players joined! Match starting in 10 seconds...");
      this.broadcastMatchState();
    } else {
      this.broadcastMatchState();
    }
  }

  public removePlayer(id: string): void {
    const connection = this.connections.get(id);
    if (!connection) {
      console.log(`[golfi:server] -player ${id} (unknown)`);
      return;
    }
    this.connections.delete(id);
    this.balls.delete(`ball-${id}`);
    console.log(
      `[golfi:server] -player ${id} "${connection.state.name}" players=${this.connections.size} balls=${this.balls.size}`,
    );
    this.broadcast({ type: ServerMessageType.PlayerLeft, id });
    if (connection.announcedName) {
      this.announce(`player left: "${connection.state.name}"`);
    }

    if (this.matchStatus === MatchStatus.Countdown) {
      this.matchStatus = MatchStatus.Waiting;
      this.countdownTimer = null;
      this.announce("Opponent left. Countdown cancelled.");
      this.broadcastMatchState();
    } else if (this.matchStatus === MatchStatus.Playing) {
      if (this.connections.size === 1) {
        const remaining = this.connections.values().next().value;
        if (remaining) {
          this.matchStatus = MatchStatus.Finished;
          this.winnerId = remaining.state.id;
          this.winnerName = remaining.state.name;
          this.announce(`${remaining.state.name} won by forfeit!`);
          this.broadcastMatchState();
        }
      }
    } else {
      this.broadcastMatchState();
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
            `[golfi:server] stale input from ${id} seq=${message.seq} last=${connection.lastSeq}`,
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
          `[golfi:server] join ${id} as "${name || connection.state.name}"`,
        );
        if (name) {
          connection.state.name = name;
          this.broadcastMatchState();
        }
        if (
          message.color !== undefined &&
          PLAYER_COLORS.includes(message.color)
        ) {
          connection.state.color = message.color;
          const ball = this.balls.get(`ball-${id}`);
          if (ball) ball.color = message.color;
        }
        if (!connection.announcedName) {
          connection.announcedName = true;
          this.announce(`new player here: "${connection.state.name}"`);
        }
        break;
      }
      case ClientMessageType.Rematch: {
        if (
          this.matchStatus === MatchStatus.Finished &&
          this.connections.size === 2
        ) {
          this.matchStatus = MatchStatus.Countdown;
          this.countdownTimer = MATCH_COUNTDOWN_SECONDS;
          this.winnerId = undefined;
          this.winnerName = undefined;
          this.announce("Rematch accepted! Starting in 10 seconds...");
          this.broadcastMatchState();
        }
        break;
      }
      case ClientMessageType.SetColor: {
        if (PLAYER_COLORS.includes(message.color)) {
          connection.state.color = message.color;
          const ball = this.balls.get(`ball-${id}`);
          if (ball) ball.color = message.color;
          console.log(
            `[golfi:server] player ${id} color changed to 0x${message.color.toString(16)}`,
          );
        }
        break;
      }
      case ClientMessageType.Chat: {
        const text = message.text.trim().slice(0, CHAT_MAX_LENGTH);
        if (!text) break;
        if (text.startsWith("/spawn") || text.startsWith("/bot")) {
          const parts = text.split(/\s+/);
          const count = Math.min(20, Math.max(1, parseInt(parts[1], 10) || 1));
          this.spawnRandomBots(count);
          this.announce(
            `${connection.state.name} spawned ${count} random golf player${count > 1 ? "s" : ""}!`,
          );
          break;
        }
        if (text === "/clearbots") {
          const removed = this.clearBots();
          this.announce(
            `${connection.state.name} cleared ${removed} bot${removed === 1 ? "" : "s"}.`,
          );
          break;
        }
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

    if (
      this.matchStatus === MatchStatus.Countdown &&
      this.countdownTimer !== null
    ) {
      const prevSeconds = Math.ceil(this.countdownTimer);
      this.countdownTimer -= dtSeconds;
      const currentSeconds = Math.max(0, Math.ceil(this.countdownTimer));
      if (currentSeconds !== prevSeconds) {
        this.broadcastMatchState();
      }
      if (this.countdownTimer <= 0) {
        this.startMatch();
      }
    }

    for (const connection of this.connections.values()) {
      stepPlayer(
        connection.state,
        connection.input,
        dtSeconds,
        this.trampolines.values(),
      );
      if (connection.state.impactDue) {
        connection.state.impactDue = false;
        const hittable = findHittableBall(
          connection.state,
          this.balls.values(),
          30, // Forgiveness: absorb network prediction desync
        );
        if (hittable) {
          strikeBall(
            hittable,
            connection.state,
            connection.state.swingPower ?? 1,
            (connection.state.swingSpin ?? 0) * 120, // Spin value maps to curve strength
          );
        }
      }
    }

    for (const bot of this.bots.values()) {
      stepBot(
        bot,
        dtSeconds,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        this.trampolines.values(),
      );
    }

    const playerStates = [
      ...Array.from(this.connections.values(), (c) => c.state),
      ...Array.from(this.bots.values(), (b) => b.state),
    ];
    for (const ball of this.balls.values()) {
      if (!ball.resting) {
        stepBall(
          ball,
          dtSeconds,
          COURSE_ZONES,
          playerStates,
          (b, victim) => {
            this.handlePlayerKill(b, victim);
          },
          this.holes.values(),
          (b, hole) => {
            this.handleHoleScored(b, hole);
          },
          this.trampolines.values(),
        );
      }

      // Also capture resting balls that contact a hole
      if (ball.resting) {
        for (const hole of this.holes.values()) {
          const dist = Math.hypot(ball.x - hole.x, ball.y - hole.y);
          if (dist <= hole.radius) {
            this.handleHoleScored(ball, hole);
            break;
          }
        }
      }
    }

    if (this.ticks === 1 || this.ticks % (TICK_RATE_HZ * 10) === 0) {
      const first = this.connections.values().next().value;
      console.debug(
        `[golfi:server] tick ${this.ticks}: ${this.connections.size} players, ${this.bots.size} bots, ${this.balls.size} balls` +
          (first
            ? ` e.g. "${first.state.name}" at (${first.state.x.toFixed(0)}, ${first.state.y.toFixed(0)})`
            : ""),
      );
    }

    const message: ServerMessage = {
      type: ServerMessageType.State,
      players: this.snapshot(),
      balls: this.ballSnapshot(),
      holes: this.holeSnapshot(),
      trampolines: this.trampolineSnapshot(),
    };
    server.publish(this.topic, JSON.stringify(message));
  }

  private startMatch(): void {
    this.matchStatus = MatchStatus.Playing;
    this.countdownTimer = null;
    this.winnerId = undefined;
    this.winnerName = undefined;

    const conns = Array.from(this.connections.values());
    if (conns[0]) {
      conns[0].state.x = MATCH_TEE_1_SPAWN.x;
      conns[0].state.y = MATCH_TEE_1_SPAWN.y;
      conns[0].state.facingX = 0;
      conns[0].state.facingY = 1;
      conns[0].state.frags = 0;
      conns[0].state.holes = 0;
      const b1 = this.balls.get(`ball-${conns[0].state.id}`);
      if (b1) {
        const hp = hitPoint(conns[0].state);
        b1.x = hp.x;
        b1.y = hp.y;
        b1.z = 0;
        b1.vx = 0;
        b1.vy = 0;
        b1.vz = 0;
        b1.resting = true;
        b1.hitSeq += 1;
        b1.lastHitBy = undefined;
      }
    }
    if (conns[1]) {
      conns[1].state.x = MATCH_TEE_2_SPAWN.x;
      conns[1].state.y = MATCH_TEE_2_SPAWN.y;
      conns[1].state.facingX = 0;
      conns[1].state.facingY = 1;
      conns[1].state.frags = 0;
      conns[1].state.holes = 0;
      const b2 = this.balls.get(`ball-${conns[1].state.id}`);
      if (b2) {
        const hp = hitPoint(conns[1].state);
        b2.x = hp.x;
        b2.y = hp.y;
        b2.z = 0;
        b2.vx = 0;
        b2.vy = 0;
        b2.vz = 0;
        b2.resting = true;
        b2.hitSeq += 1;
        b2.lastHitBy = undefined;
      }
    }
    this.announce("MATCH START! First to 10 points wins! GO!");
    this.broadcastMatchState();
  }

  private snapshot(): PlayerState[] {
    const list: PlayerState[] = [];
    for (const c of this.connections.values()) {
      list.push({ ...c.state });
    }
    for (const b of this.bots.values()) {
      list.push({ ...b.state });
    }
    return list;
  }

  private ballSnapshot(): BallState[] {
    return Array.from(this.balls.values(), (b) => ({ ...b }));
  }

  private holeSnapshot(): HoleState[] {
    return Array.from(this.holes.values(), (h) => ({ ...h }));
  }

  private trampolineSnapshot(): TrampolineState[] {
    return Array.from(this.trampolines.values(), (t) => ({ ...t }));
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

  private getPlayerState(id: string): PlayerState | undefined {
    return this.connections.get(id)?.state ?? this.bots.get(id)?.state;
  }

  private handlePlayerKill(ball: BallState, victim: PlayerState): void {
    const killerId = ball.lastHitBy;
    if (!killerId) return;
    const killer = this.getPlayerState(killerId);
    if (!killer) return;

    killer.frags = (killer.frags ?? 0) + 1;
    console.log(
      `[golfi:server] kill! "${killer.name}" eliminated "${victim.name}" (frags=${killer.frags})`,
    );

    this.broadcast({
      type: ServerMessageType.Kill,
      killerId: killer.id,
      killerName: killer.name,
      victimId: victim.id,
      victimName: victim.name,
    });
    this.announce(`${killer.name} killed ${victim.name}!`);

    if (this.matchStatus === MatchStatus.Playing) {
      const score = (killer.frags ?? 0) + (killer.holes ?? 0);
      if (score >= MATCH_TARGET_SCORE) {
        this.matchStatus = MatchStatus.Finished;
        this.winnerId = killer.id;
        this.winnerName = killer.name;
        this.announce(
          `MATCH OVER! ${killer.name} reached 10 points and WON THE MATCH!`,
        );
      }
      this.broadcastMatchState();
    }
  }

  private handleHoleScored(ball: BallState, hole: HoleState): void {
    const scorerId = ball.lastHitBy ?? ball.ownerId;
    const scorer = this.getPlayerState(scorerId);
    if (!scorer) return;

    scorer.holes = (scorer.holes ?? 0) + 1;
    console.log(
      `[golfi:server] hole scored! "${scorer.name}" in ${hole.id} (holes=${scorer.holes})`,
    );

    this.broadcast({
      type: ServerMessageType.HoleScored,
      playerId: scorer.id,
      playerName: scorer.name,
      holeId: hole.id,
    });
    this.announce(`${scorer.name} sunk a hole! (${scorer.holes} total)`);

    // Reset ball to the player's hit point
    const resetPos = hitPoint(scorer);
    ball.x = resetPos.x;
    ball.y = resetPos.y;
    ball.z = 0;
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
    ball.resting = true;
    ball.spin = 0;
    ball.hitSeq += 1;
    ball.lastHitBy = undefined;

    // Relocate the scored hole to a fresh random position on the course
    hole.x = 200 + Math.random() * (WORLD_WIDTH - 400);
    hole.y = 200 + Math.random() * (WORLD_HEIGHT - 400);

    if (this.matchStatus === MatchStatus.Playing) {
      const score = (scorer.frags ?? 0) + (scorer.holes ?? 0);
      if (score >= MATCH_TARGET_SCORE) {
        this.matchStatus = MatchStatus.Finished;
        this.winnerId = scorer.id;
        this.winnerName = scorer.name;
        this.announce(
          `MATCH OVER! ${scorer.name} reached 10 points and WON THE MATCH!`,
        );
      }
      this.broadcastMatchState();
    }
  }

  private broadcast(message: ServerMessage, excludeId?: string): void {
    const data = JSON.stringify(message);
    for (const [id, connection] of this.connections) {
      if (id === excludeId) continue;
      connection.ws.send(data);
    }
  }
}
