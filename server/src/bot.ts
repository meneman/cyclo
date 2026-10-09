import {
  PLAYER_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../shared/constants";
import { stepPlayer } from "../../shared/simulation";
import type { InputState, PlayerState } from "../../shared/types";

export interface BotPlayer {
  state: PlayerState;
  input: InputState;
  targetX: number;
  targetY: number;
  spawnX: number;
  spawnY: number;
  patrolRadius: number;
  pauseTimer: number;
  walkTimer: number;
  maxWalkDuration: number;
}

export const GOLFER_NAMES: readonly string[] = [
  "Bot Arnie",
  "Bot Tiger",
  "Bot Jack",
  "Bot Rory",
  "Bot Annika",
  "Bot Seve",
  "Bot Happy",
  "Bot Shooter",
  "Bot Gary",
  "Bot Phil",
  "Bot Ben",
  "Bot Chi-Chi",
  "Bot Payne",
  "Bot Sam",
  "Bot Walter",
  "Bot Bobby",
];

export interface BotSpawnOptions {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  color?: number;
  patrolRadius?: number;
}

export const DEFAULT_BOT_SPAWNS: readonly BotSpawnOptions[] = [
  // 1 golfer around Clubhouse / Practice Green
  {
    name: "Bot Arnie",
    x: 1440,
    y: 1440,
    patrolRadius: 220,
  },

  // 1 golfer on Hole 1 (South Fairway & Green)
  {
    name: "Bot Jack",
    x: 1500,
    y: 1950,
    patrolRadius: 280,
  },

  // 1 golfer on Hole 4 (West Fairway)
  {
    name: "Bot Shooter",
    x: 950,
    y: 1500,
    patrolRadius: 300,
  },
];

export function createBotPlayer(
  options: BotSpawnOptions = {},
  fallbackColor: number = 0x3b82f6,
): BotPlayer {
  const id = options.id ?? `bot-${Math.random().toString(36).slice(2, 8)}`;
  const name =
    options.name ??
    GOLFER_NAMES[Math.floor(Math.random() * GOLFER_NAMES.length)];
  const x = options.x ?? 1500;
  const y = options.y ?? 1500;
  const color = options.color ?? fallbackColor;
  const patrolRadius = options.patrolRadius ?? 300;

  const state: PlayerState = {
    id,
    name,
    x,
    y,
    color,
    facingX: 0,
    facingY: 1,
    frags: 0,
    holes: 0,
  };

  const input: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    charging: false,
  };

  return {
    state,
    input,
    targetX: x,
    targetY: y,
    spawnX: x,
    spawnY: y,
    patrolRadius,
    pauseTimer: 0.5 + Math.random() * 2, // Stagger initial movement
    walkTimer: 0,
    maxWalkDuration: 4 + Math.random() * 6,
  };
}

export function pickNewBotTarget(
  bot: BotPlayer,
  worldWidth: number = WORLD_WIDTH,
  worldHeight: number = WORLD_HEIGHT,
): void {
  const angle = Math.random() * Math.PI * 2;
  const dist = 50 + Math.random() * Math.max(10, bot.patrolRadius - 50);
  const tx = bot.spawnX + Math.cos(angle) * dist;
  const ty = bot.spawnY + Math.sin(angle) * dist;
  bot.targetX = Math.max(
    PLAYER_RADIUS * 3,
    Math.min(worldWidth - PLAYER_RADIUS * 3, tx),
  );
  bot.targetY = Math.max(
    PLAYER_RADIUS * 3,
    Math.min(worldHeight - PLAYER_RADIUS * 3, ty),
  );
  bot.walkTimer = 0;
  bot.maxWalkDuration = 4 + Math.random() * 8; // Walk for 4 to 12 seconds
}

export function stepBot(
  bot: BotPlayer,
  dtSeconds: number,
  worldWidth: number = WORLD_WIDTH,
  worldHeight: number = WORLD_HEIGHT,
  trampolines?: Iterable<import("../../shared/types").TrampolineState>,
): void {
  // If knocked down by a ball collision, don't move or make decisions
  if ((bot.state.knockdownTimer ?? 0) > 0) {
    bot.input.up = false;
    bot.input.down = false;
    bot.input.left = false;
    bot.input.right = false;
    bot.input.charging = false;
    stepPlayer(bot.state, bot.input, dtSeconds, trampolines);
    bot.pauseTimer = 1.0; // Pause briefly upon respawn
    return;
  }

  // If paused / idling between walks
  if (bot.pauseTimer > 0) {
    bot.pauseTimer -= dtSeconds;
    bot.input.up = false;
    bot.input.down = false;
    bot.input.left = false;
    bot.input.right = false;
    bot.input.charging = false;
    stepPlayer(bot.state, bot.input, dtSeconds, trampolines);

    if (bot.pauseTimer <= 0) {
      pickNewBotTarget(bot, worldWidth, worldHeight);
    }
    return;
  }

  // Walking toward target
  bot.walkTimer += dtSeconds;
  const dx = bot.targetX - bot.state.x;
  const dy = bot.targetY - bot.state.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 20 || bot.walkTimer >= bot.maxWalkDuration) {
    // Reached destination or timed out: enter idle pause
    bot.pauseTimer = 1.5 + Math.random() * 3.5; // Pause for 1.5 - 5 seconds
    bot.input.up = false;
    bot.input.down = false;
    bot.input.left = false;
    bot.input.right = false;
    bot.input.charging = false;
    stepPlayer(bot.state, bot.input, dtSeconds, trampolines);
    return;
  }

  // Determine directional inputs to steer toward target
  const DEADZONE = 12;
  bot.input.left = dx < -DEADZONE;
  bot.input.right = dx > DEADZONE;
  bot.input.up = dy < -DEADZONE;
  bot.input.down = dy > DEADZONE;
  bot.input.charging = false;

  stepPlayer(bot.state, bot.input, dtSeconds, trampolines);
}
