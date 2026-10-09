import { describe, expect, test } from "bun:test";

import {
  KNOCKDOWN_DURATION_SECONDS,
  PLAYER_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../shared/constants";
import {
  createBotPlayer,
  DEFAULT_BOT_SPAWNS,
  GOLFER_NAMES,
  pickNewBotTarget,
  stepBot,
} from "./bot";

describe("bot system", () => {
  test("createBotPlayer initializes bot with valid defaults", () => {
    const bot = createBotPlayer({ x: 1000, y: 1200 }, 0xef4444);
    expect(bot.state.id).toMatch(/^bot-/);
    expect(GOLFER_NAMES).toContain(bot.state.name);
    expect(bot.state.x).toBe(1000);
    expect(bot.state.y).toBe(1200);
    expect(bot.state.color).toBe(0xef4444);
    expect(bot.spawnX).toBe(1000);
    expect(bot.spawnY).toBe(1200);
    expect(bot.pauseTimer).toBeGreaterThan(0);
  });

  test("DEFAULT_BOT_SPAWNS contains golfers across the course", () => {
    expect(DEFAULT_BOT_SPAWNS.length).toBeGreaterThanOrEqual(3);
    for (const spawn of DEFAULT_BOT_SPAWNS) {
      expect(spawn.name).toBeDefined();
      expect(spawn.x).toBeGreaterThan(0);
      expect(spawn.x).toBeLessThan(WORLD_WIDTH);
      expect(spawn.y).toBeGreaterThan(0);
      expect(spawn.y).toBeLessThan(WORLD_HEIGHT);
      expect(spawn.patrolRadius).toBeGreaterThan(50);
    }
  });

  test("pickNewBotTarget stays within patrol radius and world bounds", () => {
    const bot = createBotPlayer({
      x: 1500,
      y: 1500,
      patrolRadius: 200,
    });

    for (let i = 0; i < 20; i++) {
      pickNewBotTarget(bot, WORLD_WIDTH, WORLD_HEIGHT);
      const distFromSpawn = Math.hypot(
        bot.targetX - bot.spawnX,
        bot.targetY - bot.spawnY,
      );
      expect(distFromSpawn).toBeLessThanOrEqual(250);
      expect(bot.targetX).toBeGreaterThanOrEqual(42);
      expect(bot.targetX).toBeLessThanOrEqual(WORLD_WIDTH - 42);
      expect(bot.targetY).toBeGreaterThanOrEqual(42);
      expect(bot.targetY).toBeLessThanOrEqual(WORLD_HEIGHT - 42);
      expect(bot.walkTimer).toBe(0);
      expect(bot.maxWalkDuration).toBeGreaterThan(0);
    }
  });

  test("stepBot pauses when pauseTimer is active", () => {
    const bot = createBotPlayer({ x: 1000, y: 1000 });
    bot.pauseTimer = 2.0;

    stepBot(bot, 0.5, WORLD_WIDTH, WORLD_HEIGHT);

    expect(bot.pauseTimer).toBeCloseTo(1.5, 2);
    expect(bot.state.x).toBe(1000);
    expect(bot.state.y).toBe(1000);
    expect(bot.input.up).toBe(false);
    expect(bot.input.down).toBe(false);
    expect(bot.input.left).toBe(false);
    expect(bot.input.right).toBe(false);
  });

  test("stepBot steers toward target when walking", () => {
    const bot = createBotPlayer({ x: 1000, y: 1000 });
    bot.pauseTimer = 0;
    bot.targetX = 1200; // to the right
    bot.targetY = 1000;
    bot.walkTimer = 0;
    bot.maxWalkDuration = 10;

    const dt = 0.1;
    stepBot(bot, dt, WORLD_WIDTH, WORLD_HEIGHT);

    expect(bot.input.right).toBe(true);
    expect(bot.input.left).toBe(false);
    expect(bot.state.x).toBeCloseTo(1000 + PLAYER_SPEED * dt, 1);
    expect(bot.state.facingX).toBe(1);
    expect(bot.state.facingY).toBe(0);
  });

  test("stepBot switches to pause when reaching target", () => {
    const bot = createBotPlayer({ x: 1000, y: 1000 });
    bot.pauseTimer = 0;
    bot.targetX = 1005; // within 20 units
    bot.targetY = 1005;
    bot.walkTimer = 0;

    stepBot(bot, 0.1, WORLD_WIDTH, WORLD_HEIGHT);

    expect(bot.pauseTimer).toBeGreaterThan(0);
    expect(bot.input.left).toBe(false);
    expect(bot.input.right).toBe(false);
  });

  test("stepBot respects knockdown state when struck by ball", () => {
    const bot = createBotPlayer({ x: 1000, y: 1000 });
    bot.pauseTimer = 0;
    bot.targetX = 1500;
    bot.state.knockdownTimer = KNOCKDOWN_DURATION_SECONDS;

    stepBot(bot, 0.5, WORLD_WIDTH, WORLD_HEIGHT);

    expect(bot.state.knockdownTimer).toBeCloseTo(
      KNOCKDOWN_DURATION_SECONDS - 0.5,
      2,
    );
    expect(bot.state.x).toBe(1000); // didn't move while knocked down
    expect(bot.input.right).toBe(false);
  });
});
