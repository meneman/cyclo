import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { BALL_MAX_CARRY, KNOCKDOWN_DURATION_SECONDS } from "./constants";
import {
  BASE_STATS,
  ITEM_CATALOG,
  ITEM_PICKUP_SPAWNS,
  MAX_INVENTORY_ITEMS,
  STAT_LIMITS,
  addToInventoryFifo,
  getItem,
  isValidItemForSlot,
  normalizeInventory,
  removeFromInventory,
  resolveBallColor,
  resolvePlayerColor,
  resolveStats,
} from "./items";
import {
  carryForPower,
  createBall,
  findHittableBall,
  hitPoint,
  resolveBallPlayerCollision,
  strikeBall,
} from "./ballPhysics";
import type { PlayerState } from "./types";

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: "p1",
    name: "p1",
    x: 100,
    y: 100,
    color: 0xffffff,
    facingX: 0,
    facingY: 1,
    ...overrides,
  };
}

describe("items catalog", () => {
  test("every aspect (physics, damage, size, color) is covered by at least one item", () => {
    const mods = ITEM_CATALOG.map((item) => item.modifiers);
    const hasPhysics = mods.some(
      (m) =>
        m.carryMult !== undefined ||
        m.gravityMult !== undefined ||
        m.spinMult !== undefined ||
        m.rollDecelMult !== undefined ||
        m.restitutionAdd !== undefined ||
        m.bounceFrictionAdd !== undefined,
    );
    const hasDamage = mods.some(
      (m) =>
        m.knockdownMult !== undefined ||
        m.knockdownTakenMult !== undefined ||
        m.collisionRadiusMult !== undefined,
    );
    const hasSize = mods.some(
      (m) =>
        m.ballRadiusMult !== undefined ||
        m.playerRadiusMult !== undefined ||
        m.hitRadiusAdd !== undefined ||
        m.playerSpeedMult !== undefined,
    );
    const hasColor = mods.some(
      (m) =>
        m.ballColor !== undefined ||
        m.trailColor !== undefined ||
        m.playerColor !== undefined,
    );
    assert.equal(hasPhysics, true);
    assert.equal(hasDamage, true);
    assert.equal(hasSize, true);
    assert.equal(hasColor, true);
  });

  test("catalog ids are unique and slots match", () => {
    const ids = ITEM_CATALOG.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const item of ITEM_CATALOG) {
      assert.ok(item.id.length > 0);
      assert.ok(["ball", "club", "outfit"].includes(item.slot));
      assert.equal(getItem(item.id), item);
      assert.equal(isValidItemForSlot(item.id, item.slot), true);
    }
  });

  test("wrong-slot and unknown items are rejected", () => {
    assert.equal(isValidItemForSlot("driver-x", "ball"), false);
    assert.equal(isValidItemForSlot("cannonball", "club"), false);
    assert.equal(isValidItemForSlot("nope", "ball"), false);
    assert.equal(getItem("nope"), undefined);
  });
});

describe("resolveStats", () => {
  test("empty loadout resolves to base stats", () => {
    assert.deepEqual(resolveStats(undefined), BASE_STATS);
    assert.deepEqual(resolveStats(null), BASE_STATS);
    assert.deepEqual(resolveStats({}), BASE_STATS);
  });

  test("unknown ids and slot mismatches are ignored, never throw", () => {
    const stats = resolveStats({
      ball: "nope",
      club: "cannonball", // ball item in club slot
      outfit: "driver-x", // club item in outfit slot
    });
    assert.deepEqual(stats, BASE_STATS);
  });

  test("driver-x carry bonus stacks and clamps at +40%", () => {
    const stats = resolveStats({ club: "driver-x" });
    assert.ok(Math.abs(stats.carryMult - 1.4) < 1e-9);
    // Even combined with cannonball, the clamp holds
    const stacked = resolveStats({ ball: "cannonball", club: "driver-x" });
    assert.ok(
      stacked.carryMult <= STAT_LIMITS.carryMult[1] + 1e-9,
      `carry ${stacked.carryMult} must clamp at ${STAT_LIMITS.carryMult[1]}`,
    );
  });

  test("wrecker doubles knockdown, tank-suit halves incoming", () => {
    const attacker = resolveStats({ club: "wrecker" });
    assert.ok(Math.abs(attacker.knockdownMult - 2.0) < 1e-9);
    const victim = resolveStats({ outfit: "tank-suit" });
    assert.ok(Math.abs(victim.knockdownTakenMult - 0.5) < 1e-9);
  });

  test("size mults resolve per channel", () => {
    const stats = resolveStats({ ball: "marble-mini", outfit: "swift-tee" });
    assert.ok(Math.abs(stats.ballRadiusMult - 0.6) < 1e-9);
    assert.ok(Math.abs(stats.playerRadiusMult - 0.85) < 1e-9);
    assert.ok(Math.abs(stats.playerSpeedMult - 1.25) < 1e-9);
  });

  test("color overrides win, fallback otherwise", () => {
    const stats = resolveStats({ ball: "cannonball" });
    assert.equal(resolveBallColor(stats, 0xffffff), 0x1f2937);
    assert.equal(resolvePlayerColor(resolveStats({}), 0x123456), 0x123456);
    assert.equal(
      resolvePlayerColor(resolveStats({ outfit: "tank-suit" }), 0x123456),
      0x22c55e,
    );
  });
});

describe("new effect cards", () => {
  test("titan-ball grows ball and player size in the ball slot", () => {
    assert.equal(isValidItemForSlot("titan-ball", "ball"), true);
    assert.equal(isValidItemForSlot("titan-ball", "club"), false);
    const stats = resolveStats({ ball: "titan-ball" });
    assert.ok(Math.abs(stats.ballRadiusMult - 1.5) < 1e-9);
    assert.ok(Math.abs(stats.playerRadiusMult - 1.3) < 1e-9);
  });

  test("tailwind speeds ball flight and slows the player", () => {
    assert.equal(isValidItemForSlot("tailwind", "club"), true);
    assert.equal(isValidItemForSlot("tailwind", "ball"), false);
    const stats = resolveStats({ club: "tailwind" });
    assert.ok(Math.abs((stats.gravityMult ?? 1) - 1.5) < 1e-9);
    assert.ok(Math.abs(stats.playerSpeedMult - 0.8) < 1e-9);
    const ball = createBall("b1", "p1", 0, 100, 100);
    strikeBall(ball, makePlayer(), 1, 0, undefined, stats);
    assert.ok(Math.abs((ball.gravityMult ?? 1) - 1.5) < 1e-9);
  });

  test("minnow shrinks the player in the outfit slot", () => {
    assert.equal(isValidItemForSlot("minnow", "outfit"), true);
    assert.equal(isValidItemForSlot("minnow", "ball"), false);
    const stats = resolveStats({ outfit: "minnow" });
    assert.ok(Math.abs(stats.playerRadiusMult - 0.75) < 1e-9);
  });

  test("titan-ball extends collision reach, minnow shrinks it", () => {
    const target = makePlayer({ id: "target", x: 116, y: 100 });
    const baseBall = createBall("b-base", "shooter", 0, 100, 100);
    baseBall.lastHitBy = "shooter";
    baseBall.resting = false;
    baseBall.vx = 60;
    baseBall.z = 5;
    assert.equal(resolveBallPlayerCollision(baseBall, target), false);

    const titanStats = resolveStats({ ball: "titan-ball" });
    const titanBall = createBall("b-titan", "shooter", 0, 100, 100);
    titanBall.lastHitBy = "shooter";
    titanBall.resting = false;
    titanBall.vx = 60;
    titanBall.z = 5;
    assert.equal(
      resolveBallPlayerCollision(titanBall, target, titanStats),
      true,
    );

    // Distance 15: base reach is 15.5 (hit), minnow reach shrinks below it (miss)
    const near = makePlayer({ id: "near", x: 115, y: 100 });
    const minnowStats = resolveStats({ outfit: "minnow" });
    const grazing = createBall("b-graze", "shooter", 0, 100, 100);
    grazing.lastHitBy = "shooter";
    grazing.resting = false;
    grazing.vx = 60;
    grazing.z = 5;
    assert.equal(
      resolveBallPlayerCollision(grazing, near, undefined, minnowStats),
      false,
    );
  });
});

describe("inventory (max 5, FIFO)", () => {
  test("max is 5", () => {
    assert.equal(MAX_INVENTORY_ITEMS, 5);
  });

  test("normalize drops unknown ids, dedupes, and caps at 5", () => {
    assert.deepEqual(normalizeInventory(undefined), []);
    assert.deepEqual(normalizeInventory("nope"), []);
    assert.deepEqual(
      normalizeInventory(["driver-x", "nope", "driver-x", 42, null]),
      ["driver-x"],
    );
    assert.deepEqual(
      normalizeInventory([
        "cannonball",
        "marble-mini",
        "curve-king",
        "driver-x",
        "wrecker",
        "sniper",
      ]),
      ["cannonball", "marble-mini", "curve-king", "driver-x", "wrecker"],
    );
  });

  test("fifo add keeps 5 max and evicts the oldest entry", () => {
    const full = ["cannonball", "driver-x", "wrecker", "sniper", "tank-suit"];
    const result = addToInventoryFifo(full, "titan-ball");
    assert.deepEqual(result.inventory, [
      "driver-x",
      "wrecker",
      "sniper",
      "tank-suit",
      "titan-ball",
    ]);
    assert.equal(result.evicted, "cannonball");
  });

  test("fifo add is a no-op for owned and unknown ids", () => {
    const inv = ["cannonball", "driver-x"];
    assert.deepEqual(addToInventoryFifo(inv, "driver-x"), {
      inventory: ["cannonball", "driver-x"],
    });
    assert.deepEqual(addToInventoryFifo(inv, "nope"), {
      inventory: ["cannonball", "driver-x"],
    });
  });

  test("remove drops the id", () => {
    assert.deepEqual(
      removeFromInventory(["cannonball", "driver-x"], "cannonball"),
      ["driver-x"],
    );
  });
});

describe("item pickup spawns", () => {
  test("one pickup per effect card, side by side, covering all slots", () => {
    assert.equal(ITEM_PICKUP_SPAWNS.length, 3);
    const ids = ITEM_PICKUP_SPAWNS.map((s) => s.itemId);
    assert.equal(new Set(ids).size, ids.length);
    const slots = ITEM_PICKUP_SPAWNS.map((s) => getItem(s.itemId)?.slot);
    assert.deepEqual([...slots].sort(), ["ball", "club", "outfit"]);
    const dxs = ITEM_PICKUP_SPAWNS.map((s) => s.dx);
    assert.equal(new Set(dxs).size, dxs.length);
  });
});

describe("items affect physics, damage, size", () => {
  test("carryMult scales carry distance", () => {
    const base = carryForPower(1);
    assert.equal(base, BALL_MAX_CARRY);
    const boosted = carryForPower(1, resolveStats({ club: "driver-x" }));
    assert.ok(Math.abs(boosted - BALL_MAX_CARRY * 1.4) < 1e-6);
  });

  test("strikeBall scales spin and bakes flight mods", () => {
    const ball = createBall("b1", "p1", 0, 100, 100);
    const hitter = makePlayer();
    strikeBall(
      ball,
      hitter,
      1,
      2,
      undefined,
      resolveStats({ ball: "curve-king" }),
    );
    assert.ok(Math.abs((ball.spin ?? 0) - 2 * 2.4) < 1e-9);
  });

  test("wrecker + tank-suit combine to base knockdown duration", () => {
    const target = makePlayer({ id: "target", x: 100, y: 100 });
    const ball = createBall("b1", "shooter", 0, 90, 100);
    ball.lastHitBy = "shooter";
    ball.resting = false;
    ball.vx = 60;
    ball.vy = 0;
    ball.z = 5;
    const attacker = resolveStats({ club: "wrecker" });
    const victim = resolveStats({ outfit: "tank-suit" });
    assert.equal(
      resolveBallPlayerCollision(ball, target, attacker, victim),
      true,
    );
    // 2.0 outgoing * 0.5 incoming = 1.0x base
    assert.ok(
      Math.abs((target.knockdownTimer ?? 0) - KNOCKDOWN_DURATION_SECONDS) <
        1e-9,
    );
  });

  test("cannonball size extends collision reach", () => {
    const target = makePlayer({ id: "target", x: 116, y: 100 });
    const attackerStats = resolveStats({ ball: "cannonball" });
    // Distance 16: base reach is 15.5 (miss), cannonball reach is 16.7 (hit)
    const ball = createBall("b1", "shooter", 0, 100, 100);
    ball.lastHitBy = "shooter";
    ball.resting = false;
    ball.vx = 60;
    ball.z = 5;
    assert.equal(resolveBallPlayerCollision(ball, target), false);
    const ball2 = createBall("b2", "shooter", 0, 100, 100);
    ball2.lastHitBy = "shooter";
    ball2.resting = false;
    ball2.vx = 60;
    ball2.z = 5;
    assert.equal(
      resolveBallPlayerCollision(ball2, target, attackerStats),
      true,
    );
  });

  test("sniper hitRadiusAdd extends the hittable zone", () => {
    const player = makePlayer();
    const hp = hitPoint(player);
    const stats = resolveStats({ club: "sniper" });
    // Just outside the base zone (reach 13.5), inside sniper zone (reach 23.5)
    const ball = createBall("b1", "p1", 0, hp.x + 20, hp.y);
    assert.equal(findHittableBall(player, [ball]), null);
    assert.equal(findHittableBall(player, [ball], 0, stats), ball);
  });
});
