import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  BALL_MAX_CARRY,
  BALL_MIN_CARRY,
  BALL_RADIUS,
  HIT_RADIUS,
  KNOCKDOWN_DURATION_SECONDS,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  WORLD_WIDTH,
} from "./constants";
import {
  carryForPower,
  createBall,
  facingOf,
  findHittableBall,
  hitPoint,
  resolveBallPlayerCollision,
  stepBall,
  strikeBall,
} from "./ballPhysics";
import type { BallState, HoleState, PlayerState } from "./types";

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

  test("resolveBallPlayerCollision ignores shooter, resting balls, high balls, and knocked down players", () => {
    const shooter: PlayerState = {
      id: "shooter",
      name: "Shooter",
      x: 100,
      y: 100,
      color: 0,
    };
    const target: PlayerState = {
      id: "target",
      name: "Target",
      x: 110,
      y: 100,
      color: 0,
    };
    const ball = createBall("b1", "shooter", 0, 110, 100);
    ball.lastHitBy = "shooter";
    ball.resting = false;
    ball.vx = 50;

    // 1. Shooter immunity
    assert.equal(resolveBallPlayerCollision(ball, shooter), false);

    // 2. Resting ball
    ball.resting = true;
    assert.equal(resolveBallPlayerCollision(ball, target), false);
    ball.resting = false;

    // 3. Ball flying over head (z > PLAYER_HEIGHT)
    ball.z = PLAYER_HEIGHT + 5;
    assert.equal(resolveBallPlayerCollision(ball, target), false);
    ball.z = 10;

    // 4. Target already knocked down
    target.knockdownTimer = 1.0;
    assert.equal(resolveBallPlayerCollision(ball, target), false);
    target.knockdownTimer = 0;

    // 5. Target too far away (distance > reach)
    const farTarget: PlayerState = {
      id: "far",
      name: "Far",
      x: 200,
      y: 100,
      color: 0,
    };
    assert.equal(resolveBallPlayerCollision(ball, farTarget), false);
  });

  test("resolveBallPlayerCollision knocks down target, cancels swing charge, and reflects velocity", () => {
    const target: PlayerState = {
      id: "target",
      name: "Target",
      x: 100,
      y: 100,
      color: 0,
      charge: 0.7,
      impactTimer: 0.1,
      impactDue: true,
    };
    const ball = createBall("b1", "shooter", 0, 90, 100);
    ball.lastHitBy = "shooter";
    ball.resting = false;
    ball.vx = 60; // Moving right toward target at x=100
    ball.vy = 0;
    ball.z = 5; // <= PLAYER_HEIGHT (29)

    const collided = resolveBallPlayerCollision(ball, target);
    assert.equal(collided, true);
    assert.equal(target.knockdownTimer, KNOCKDOWN_DURATION_SECONDS);
    assert.equal(target.charge, 0);
    assert.equal(target.impactTimer, 0);
    assert.equal(target.impactDue, false);

    // Ball should be pushed outside target radius and vx reversed
    assert.ok(ball.x < target.x - PLAYER_RADIUS);
    assert.ok(ball.vx < 0, "Ball vx should reverse after bounce");
  });

  test("stepBall hits player on flight path and knocks them down", () => {
    const target: PlayerState = {
      id: "target",
      name: "Target",
      x: 350,
      y: 200,
      color: 0,
    };
    const ball = createBall("b1", "shooter", 0, 300, 200);
    ball.lastHitBy = "shooter";
    ball.resting = false;
    ball.vx = 200; // moving toward x=350
    ball.vy = 0;
    ball.z = 10;

    stepBall(ball, 0.5, undefined, [target]);
    assert.equal(target.knockdownTimer, KNOCKDOWN_DURATION_SECONDS);
    assert.ok(ball.vx < 0, "Ball should have bounced off target");
  });

  test("stepBall invokes onPlayerHit callback on collision", () => {
    const target: PlayerState = {
      id: "target",
      name: "Target",
      x: 350,
      y: 200,
      color: 0,
    };
    const ball = createBall("b1", "shooter", 0, 300, 200);
    ball.lastHitBy = "shooter";
    ball.resting = false;
    ball.vx = 200;
    ball.vy = 0;
    ball.z = 10;

    let hitVictim: PlayerState | null = null;
    let hitBall: BallState | null = null;

    stepBall(ball, 0.5, undefined, [target], (b, victim) => {
      hitBall = b;
      hitVictim = victim;
    });

    assert.equal(hitVictim, target);
    assert.equal(hitBall, ball);
  });

  test("stepBall detects a ball that lands on a hole from the air and triggers onHoleScored", () => {
    const hole: HoleState = {
      id: "hole-test",
      x: 500,
      y: 500,
      radius: 35,
    };
    // Ball descending toward (500, 500)
    const ball = createBall("b1", "shooter", 0, 500, 500);
    ball.resting = false;
    ball.z = 10;
    ball.vz = -50; // falling down
    ball.vx = 0;
    ball.vy = 0;

    let scoredHole: HoleState | null = null;
    let scoredBall: BallState | null = null;

    stepBall(ball, 0.3, undefined, undefined, undefined, [hole], (b, h) => {
      scoredBall = b;
      scoredHole = h;
    });

    assert.equal(scoredHole, hole);
    assert.equal(scoredBall, ball);
    assert.equal(ball.resting, true);
    assert.equal(ball.z, 0);
    assert.equal(ball.vx, 0);
    assert.equal(ball.vy, 0);
  });

  test("stepBall does not trigger hole point when ball is flying high above hole", () => {
    const hole: HoleState = {
      id: "hole-test",
      x: 500,
      y: 500,
      radius: 35,
    };
    // Ball flying high above hole at z=50, moving horizontally
    const ball = createBall("b1", "shooter", 0, 480, 500);
    ball.resting = false;
    ball.z = 50;
    ball.vz = 0;
    ball.vx = 100;
    ball.vy = 0;

    let scored = false;

    // Advance 0.1s: ball moves to x=490, z still high (~48)
    stepBall(ball, 0.1, undefined, undefined, undefined, [hole], () => {
      scored = true;
    });

    assert.equal(scored, false);
    assert.equal(ball.resting, false);
    assert.ok(ball.z > 0);
  });
});
