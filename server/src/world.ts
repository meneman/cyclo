import type { Server, ServerWebSocket } from "bun";
import {
  createBall,
  findHittableBall,
  hitPoint,
  stepBall,
  strikeBall,
} from "../../shared/ballPhysics";
import {
  ITEM_PICKUP_RADIUS,
  ITEM_PICKUP_Y_OFFSET,
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
import {
  BASE_STATS,
  ITEM_PICKUP_SPAWNS,
  MAX_STACKS_PER_ITEM,
  addToInventoryFifo,
  getItem,
  isValidItemForSlot,
  normalizeInventory,
  normalizeStacks,
  removeFromInventory,
  resolveBallColor,
  resolveStats,
} from "../../shared/items";
import type { EffectiveStats, ItemSlot } from "../../shared/items";
import { stepPlayer } from "../../shared/simulation";
import { COURSE_ZONES } from "../../shared/terrain";
import { MatchStatus } from "../../shared/types";
import type {
  BallState,
  InputState,
  PlayerLoadout,
  PlayerState,
  HoleState,
  ItemPickupState,
  MatchPlayerInfo,
  MatchState,
} from "../../shared/types";

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
  /** Set of pickup IDs the player is currently inside, preventing continuous tick farming */
  insidePickups: Set<string>;
}

/**
 * Owns connected players for a room and runs the fixed-rate authoritative
 * simulation tick. One instance per room.
 */
export class World {
  public readonly id: string;
  public readonly topic: string;
  private readonly connections = new Map<string, Connection>();
  private readonly balls = new Map<string, BallState>();
  private readonly holes = new Map<string, HoleState>();
  private readonly pickups = new Map<string, ItemPickupState>();
  /** Aufgelöste Item-Stats pro Spieler */
  private readonly statsCache = new Map<string, EffectiveStats>();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private matchStatus: MatchStatus = MatchStatus.Waiting;
  private countdownTimer: number | null = null;
  private winnerId?: string;
  private winnerName?: string;

  constructor(id: string = "default") {
    this.id = id;
    this.topic = `room:${id}`;
    for (let i = 0; i < 10; i++) {
      const id = `hole-${i}`;
      this.holes.set(id, {
        id,
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        radius: 30 + Math.random() * 20,
      });
    }

    // One pickup per effect card, side by side above the world center.
    // Pickups persist — every player can grab each card once per slot.
    for (const spawn of ITEM_PICKUP_SPAWNS) {
      const id = `pickup-${spawn.itemId}`;
      this.pickups.set(id, {
        id,
        itemId: spawn.itemId,
        x: WORLD_WIDTH / 2 + spawn.dx,
        y: WORLD_HEIGHT / 2 - ITEM_PICKUP_Y_OFFSET,
        radius: ITEM_PICKUP_RADIUS,
      });
    }
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

  public getStats(playerId: string): EffectiveStats {
    return this.statsCache.get(playerId) ?? BASE_STATS;
  }

  private refreshStats(
    id: string,
    loadout?: PlayerLoadout,
    itemStacks?: Record<string, number>,
  ): void {
    this.statsCache.set(id, resolveStats(loadout, itemStacks));
  }

  private syncOwnedBallColor(id: string): void {
    const connection = this.connections.get(id);
    if (!connection) return;
    const ball = this.balls.get(`ball-${id}`);
    if (!ball) return;
    ball.color = resolveBallColor(this.getStats(id), connection.state.color);
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
      loadout: {},
      inventory: [],
      itemStacks: {},
    };
    this.refreshStats(id, state.loadout, state.itemStacks);

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
      insidePickups: new Set<string>(),
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
      pickups: this.pickupSnapshot(),
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
    this.statsCache.delete(id);
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
          this.syncOwnedBallColor(id);
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
          this.syncOwnedBallColor(id);
          console.log(
            `[golfi:server] player ${id} color changed to 0x${message.color.toString(16)}`,
          );
        }
        break;
      }
      case ClientMessageType.EquipItem: {
        const slot = message.slot as ItemSlot;
        if (
          (slot === "ball" || slot === "club" || slot === "outfit") &&
          isValidItemForSlot(message.itemId, slot)
        ) {
          // Menu equips also collect into the inventory — full means the
          // oldest item drops out (FIFO), never a silent reject.
          // Menu grant mints the first copy (stacks = 1) only, never stacks beyond 1.
          const owned = normalizeInventory(connection.state.inventory);
          const stacksMap = normalizeStacks(connection.state.itemStacks);
          const isAlreadyOwned = owned.includes(message.itemId);

          let evictedItem: string | undefined;
          if (!isAlreadyOwned) {
            const result = addToInventoryFifo(owned, message.itemId);
            connection.state.inventory = result.inventory;
            evictedItem = result.evicted;
            stacksMap[message.itemId] = 1;
            if (evictedItem) {
              delete stacksMap[evictedItem];
            }
          }

          const loadout: PlayerLoadout = {
            ...connection.state.loadout,
            [slot]: message.itemId,
          };
          if (evictedItem) {
            const evictedDef = getItem(evictedItem);
            if (evictedDef && loadout[evictedDef.slot] === evictedItem) {
              delete loadout[evictedDef.slot];
            }
          }
          connection.state.loadout = loadout;
          connection.state.itemStacks = stacksMap;
          this.refreshStats(id, loadout, stacksMap);
          this.syncOwnedBallColor(id);
          console.log(
            `[golfi:server] player ${id} equipped ${message.itemId} in ${slot}`,
          );
          if (evictedItem) {
            this.announce(
              `${connection.state.name} dropped ${getItem(evictedItem)?.name ?? evictedItem} — inventory full!`,
            );
          }
        } else {
          console.debug(
            `[golfi:server] rejected equip from ${id} slot=${message.slot} item=${message.itemId}`,
          );
        }
        break;
      }
      case ClientMessageType.UnequipItem: {
        const slot = message.slot as ItemSlot;
        if (
          (slot === "ball" || slot === "club" || slot === "outfit") &&
          connection.state.loadout?.[slot] !== undefined
        ) {
          const loadout: PlayerLoadout = { ...connection.state.loadout };
          delete loadout[slot];
          connection.state.loadout = loadout;
          this.refreshStats(id, loadout, connection.state.itemStacks);
          this.syncOwnedBallColor(id);
          console.log(`[golfi:server] player ${id} unequipped ${slot}`);
        }
        break;
      }
      case ClientMessageType.DropItem: {
        const item = getItem(message.itemId);
        if (!item) {
          console.debug(
            `[golfi:server] rejected drop from ${id} item=${message.itemId}`,
          );
          break;
        }
        const owned = normalizeInventory(connection.state.inventory);
        if (!owned.includes(item.id)) break;
        const stacksMap = normalizeStacks(connection.state.itemStacks);
        const currentStacks = stacksMap[item.id] ?? 1;

        if (currentStacks > 1) {
          const newStacks = currentStacks - 1;
          stacksMap[item.id] = newStacks;
          connection.state.itemStacks = stacksMap;
          this.refreshStats(
            id,
            connection.state.loadout,
            connection.state.itemStacks,
          );
          console.log(
            `[golfi:server] player ${id} dropped 1 stack of ${item.id} (${newStacks} left)`,
          );
        } else {
          delete stacksMap[item.id];
          connection.state.itemStacks = stacksMap;
          connection.state.inventory = removeFromInventory(owned, item.id);
          if (connection.state.loadout?.[item.slot] === item.id) {
            const loadout: PlayerLoadout = { ...connection.state.loadout };
            delete loadout[item.slot];
            connection.state.loadout = loadout;
          }
          this.refreshStats(
            id,
            connection.state.loadout,
            connection.state.itemStacks,
          );
          this.syncOwnedBallColor(id);
          console.log(`[golfi:server] player ${id} dropped ${item.id}`);
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

    const getVictimStats = (playerId: string): EffectiveStats | undefined =>
      this.statsCache.get(playerId);

    for (const connection of this.connections.values()) {
      const stats = this.getStats(connection.state.id);
      stepPlayer(connection.state, connection.input, dtSeconds, stats);
      if (connection.state.impactDue) {
        connection.state.impactDue = false;
        const hittable = findHittableBall(
          connection.state,
          this.balls.values(),
          30, // Forgiveness: absorb network prediction desync
          stats,
        );
        if (hittable) {
          strikeBall(
            hittable,
            connection.state,
            connection.state.swingPower ?? 1,
            (connection.state.swingSpin ?? 0) * 120, // Spin value maps to curve strength
            COURSE_ZONES,
            stats,
          );
          hittable.color = resolveBallColor(stats, connection.state.color);
        }
      }
    }

    // Walking into a pickup circle equips or stacks the item.
    // Stepping off and walking back on allows re-acquiring / stacking immediately without despawning.
    for (const connection of this.connections.values()) {
      for (const pickup of this.pickups.values()) {
        const dist = Math.hypot(
          connection.state.x - pickup.x,
          connection.state.y - pickup.y,
        );
        const isInside = dist <= pickup.radius;
        const wasInside = connection.insidePickups.has(pickup.id);

        if (isInside) {
          if (!wasInside) {
            connection.insidePickups.add(pickup.id);
            this.grantPickup(connection.state.id, pickup);
          }
        } else if (wasInside) {
          connection.insidePickups.delete(pickup.id);
        }
      }
    }

    const playerStates = Array.from(this.connections.values(), (c) => c.state);
    for (const ball of this.balls.values()) {
      if (!ball.resting) {
        const shooterStats = ball.lastHitBy
          ? this.statsCache.get(ball.lastHitBy)
          : undefined;
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
          shooterStats,
          getVictimStats,
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
        `[golfi:server] tick ${this.ticks}: ${this.connections.size} players, ${this.balls.size} balls` +
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
      pickups: this.pickupSnapshot(),
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
    for (const c of this.connections.values()) {
      c.insidePickups.clear();
    }
    this.announce("MATCH START! First to 10 points wins! GO!");
    this.broadcastMatchState();
  }

  private snapshot(): PlayerState[] {
    const list: PlayerState[] = [];
    for (const c of this.connections.values()) {
      list.push({
        ...c.state,
        loadout: c.state.loadout ? { ...c.state.loadout } : undefined,
        inventory: c.state.inventory ? [...c.state.inventory] : undefined,
        itemStacks: c.state.itemStacks ? { ...c.state.itemStacks } : undefined,
      });
    }
    return list;
  }

  private ballSnapshot(): BallState[] {
    return Array.from(this.balls.values(), (b) => ({ ...b }));
  }

  private holeSnapshot(): HoleState[] {
    return Array.from(this.holes.values(), (h) => ({ ...h }));
  }

  private pickupSnapshot(): ItemPickupState[] {
    return Array.from(this.pickups.values());
  }

  /**
   * Equips or increments stacks for the pickup's item.
   * If inventory is full when collecting a new item, the oldest drops out (FIFO).
   */
  private grantPickup(playerId: string, pickup: ItemPickupState): void {
    const connection = this.connections.get(playerId);
    const item = getItem(pickup.itemId);
    if (!connection || !item) return;

    const owned = normalizeInventory(connection.state.inventory);
    const stacksMap = normalizeStacks(connection.state.itemStacks);
    const isOwned = owned.includes(item.id);
    const currentStacks = stacksMap[item.id] ?? (isOwned ? 1 : 0);

    let announceText = "";

    if (!isOwned) {
      const { inventory, evicted } = addToInventoryFifo(owned, item.id);
      stacksMap[item.id] = 1;
      const loadout: PlayerLoadout = {
        ...connection.state.loadout,
        [item.slot]: item.id,
      };
      if (evicted) {
        delete stacksMap[evicted];
        const evictedDef = getItem(evicted);
        if (evictedDef && loadout[evictedDef.slot] === evicted) {
          delete loadout[evictedDef.slot];
        }
        announceText = `${connection.state.name} picked up ${item.name}! (${getItem(evicted)?.name ?? evicted} dropped — inventory full)`;
      } else {
        announceText = `${connection.state.name} picked up ${item.name}!`;
      }
      connection.state.inventory = inventory;
      connection.state.loadout = loadout;
    } else {
      if (currentStacks < MAX_STACKS_PER_ITEM) {
        const newStacks = currentStacks + 1;
        stacksMap[item.id] = newStacks;
        const loadout: PlayerLoadout = {
          ...connection.state.loadout,
          [item.slot]: item.id,
        };
        connection.state.loadout = loadout;
        announceText = `${connection.state.name} stacked ${item.name} (x${newStacks})!`;
      } else {
        announceText = `${connection.state.name} is already at max stacks for ${item.name} (x${MAX_STACKS_PER_ITEM})!`;
      }
    }

    connection.state.itemStacks = stacksMap;
    this.refreshStats(
      playerId,
      connection.state.loadout,
      connection.state.itemStacks,
    );
    this.syncOwnedBallColor(playerId);
    if (announceText) {
      this.announce(announceText);
    }
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
    return this.connections.get(id)?.state;
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
