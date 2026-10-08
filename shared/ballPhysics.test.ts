import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  BALL_MAX_CARRY,
  BALL_MIN_CARRY,
  BALL_RADIUS,
  HIT_RADIUS,
  WORLD_WIDTH,
} from "./constants";
import {
  carryForPower,
  createBall,
  facingOf,
  findHittableBall,
  hitPoint,
  stepBall,
  strikeBall,
} from "./ballPhysics";
import type { PlayerState } from "./types";

describe("ballPhysics", () => {
  test("carryForPower scales between min and max carry", () => {
    assert.equal(carryForPower(0), BALL_MIN_CARRY);
    assert.equal(carryForPower(1), BALL_MAX_CARRY);
    assert.ok(carryForPower(0.5) > BALL_MIN_CARRY);
    assert.ok(carryForPower(0.5) < BALL_MAX_CARRY);
    // Monotonically increasing
    assert.ok(carryForPower(0.2) < carryForPower(0.8));
  });

  test("facingOf defaults to south (0, 1) and normalizes", () => {
    assert.deepEqual(facingOf({ id: "p1", name: "p1", x: 0, y: 0, color: 0 }), {
      x: 0,
      y: 1,
    });
    const f = facingOf({
      id: "p1",
      name: "p1",
      x: 0,
      y: 0,
      color: 0,
      facingX: 3,
      facingY: 4,
    });
    assert.ok(Math.abs(f.x - 0.6) < 1e-6);
    assert.ok(Math.abs(f.y - 0.8) < 1e-6);
  });

  test("hitPoint is offset from player position", () => {
    const player: PlayerState = {
      id: "p1",
      name: "p1",
      x: 100,
      y: 100,
      color: 0,
      facingX: 0,
      facingY: 1, // Facing south
    };
    const hp = hitPoint(player);
    // facing (0, 1), offset forward 18, offset right 6 => x: 100 - 1*6 = 94, y: 100 + 18 = 118
    assert.equal(hp.x, 94);
    assert.equal(hp.y, 118);
  });

  test("findHittableBall detects grounded balls in zone and ignores airborne balls", () => {
    const player: PlayerState = {
      id: "p1",
      name: "p1",
      x: 100,
      y: 100,
      color: 0,
      facingX: 0,
      facingY: 1,
    };
    const hp = hitPoint(player);

    const inRange = createBall("b1", "p1", 0, hp.x + 2, hp.y + 2);
    const outOfRange = createBall(
      "b2",
      "p1",
      0,
      hp.x + HIT_RADIUS + BALL_RADIUS + 5,
      hp.y,
    );
    const airborne = createBall("b3", "p1", 0, hp.x, hp.y);
    airborne.z = 5;
    airborne.vz = 10;

    assert.equal(findHittableBall(player, [outOfRange]), null);
    assert.equal(findHittableBall(player, [airborne]), null);
    assert.equal(findHittableBall(player, [inRange]), inRange);
  });

  test("findHittableBall chooses the nearest ball when multiple are in zone", () => {
    const player: PlayerState = {
      id: "p1",
      name: "p1",
      x: 100,
      y: 100,
      color: 0,
      facingX: 1,
      facingY: 0,
    };
    const hp = hitPoint(player);

    const bNear = createBall("b-near", "p1", 0, hp.x + 1, hp.y);
    const bFar = createBall("b-far", "p2", 0, hp.x + 3, hp.y);

    assert.equal(findHittableBall(player, [bFar, bNear]), bNear);
  });

  test("ball lands within 2% of carry distance, bounces, and comes to rest", () => {
    const ball = createBall("b1", "p1", 0, 500, 500);
    const player: PlayerState = {
      id: "p1",
      name: "p1",
      x: 500,
      y: 500,
      color: 0,
      facingX: 1,
      facingY: 0,
    };

    const targetCarry = carryForPower(1); // 300 units
    strikeBall(ball, player, 1);
    assert.equal(ball.hitSeq, 1);
    assert.equal(ball.lastHitBy, "p1");
    assert.equal(ball.resting, false);

    let firstContactX = 0;
    let hitGround = false;

    // Simulate flight with small steps to observe the exact first ground contact
    const dt = 1 / 240;
    for (let t = 0; t < 5; t += dt) {
      const prevZ = ball.z;
      stepBall(ball, dt);

      // First ground contact happens when z reaches 0
      if (!hitGround && prevZ > 0 && ball.z === 0) {
        hitGround = true;
        firstContactX = ball.x;
      }
      if (ball.resting) break;
    }

    assert.ok(hitGround, "Ball must contact ground");
    const actualCarry = firstContactX - 500;
    const carryError = Math.abs(actualCarry - targetCarry) / targetCarry;
    assert.ok(
      carryError < 0.02,
      `Carry error ${carryError.toFixed(4)} must be < 2% (actual: ${actualCarry}, target: ${targetCarry})`,
    );

    // Ball should bounce further than carry, then rest
    assert.ok(ball.x > firstContactX, "Ball must bounce and roll forward");
    assert.ok(ball.resting, "Ball must eventually come to rest");
  });

  test("bounces off field boundaries", () => {
    const ball = createBall("b1", "p1", 0, WORLD_WIDTH - 5, 500);
    ball.resting = false;
    ball.vx = 50; // Heading into east wall
    ball.vy = 0;

    stepBall(ball, 0.1);
    assert.ok(ball.vx < 0, "Velocity X must reverse after hitting east wall");
    assert.ok(ball.x <= WORLD_WIDTH - BALL_RADIUS);
  });
});
