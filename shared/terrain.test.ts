import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  COURSE_ZONES,
  DEFAULT_TERRAIN,
  TERRAIN_PROPERTIES,
  getTerrainAt,
  getTerrainPropertiesAt,
  isPointInZone,
} from "./terrain";
import type {
  TerrainZone,
  TerrainZoneCircle,
  TerrainZoneRect,
} from "./terrain";
import { createBall, stepBall, strikeBall } from "./ballPhysics";
import type { PlayerState } from "./types";

describe("terrain", () => {
  test("terrain properties conform to specification", () => {
    const { fairway, green, rough, bunker } = TERRAIN_PROPERTIES;

    // Green: low deceleration, smooth roll
    assert.ok(
      green.rollDecel < fairway.rollDecel,
      "Green must have lower deceleration than Fairway",
    );
    assert.equal(green.carryMultiplier, 1.0);

    // Fairway: standard
    assert.equal(fairway.carryMultiplier, 1.0);
    assert.equal(fairway.rollDecel, 95);
    assert.equal(fairway.restitution, 0.55);

    // Rough: higher deceleration, reduced carry
    assert.ok(
      rough.rollDecel > fairway.rollDecel,
      "Rough must decelerate faster than Fairway",
    );
    assert.ok(rough.carryMultiplier < 1.0, "Rough must reduce carry distance");
    assert.equal(rough.carryMultiplier, 0.75);

    // Sand bunker: high deceleration, low bounce, ball stops quickly
    assert.ok(
      bunker.rollDecel > rough.rollDecel,
      "Bunker must have highest roll deceleration",
    );
    assert.ok(
      bunker.restitution < rough.restitution,
      "Bunker must have lowest bounce restitution",
    );
    assert.ok(
      bunker.bounceFriction < rough.bounceFriction,
      "Bunker must have high bounce friction",
    );
  });

  test("isPointInZone detects circular zones", () => {
    const circle: TerrainZoneCircle = {
      shape: "circle",
      type: "green",
      x: 100,
      y: 100,
      radius: 20,
    };

    assert.ok(isPointInZone(100, 100, circle), "Center is inside");
    assert.ok(isPointInZone(110, 100, circle), "Interior point is inside");
    assert.ok(isPointInZone(120, 100, circle), "Boundary point is inside");
    assert.ok(!isPointInZone(121, 100, circle), "Exterior point is outside");
    assert.ok(!isPointInZone(100, 125, circle), "Exterior Y point is outside");
  });

  test("isPointInZone detects rectangular and rotated rectangular zones", () => {
    const rect: TerrainZoneRect = {
      shape: "rect",
      type: "fairway",
      x: 200,
      y: 200,
      width: 60,
      height: 40,
    };

    assert.ok(isPointInZone(200, 200, rect), "Center is inside");
    assert.ok(isPointInZone(225, 215, rect), "Inside boundary is inside");
    assert.ok(!isPointInZone(235, 200, rect), "Outside X is outside");
    assert.ok(!isPointInZone(200, 225, rect), "Outside Y is outside");

    // 45 degree rotated rectangle
    const rotRect: TerrainZoneRect = {
      shape: "rect",
      type: "fairway",
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      rotation: Math.PI / 4,
    };
    assert.ok(isPointInZone(0, 0, rotRect), "Center of rotated rect is inside");
    // Along rotated major axis: (x=30, y=30) has distance sqrt(1800) ~ 42.4 <= 50
    assert.ok(isPointInZone(30, 30, rotRect), "Along rotated axis is inside");
    // Off rotated minor axis: (x=-20, y=20) is perpendicular to the major axis
    assert.ok(
      !isPointInZone(-20, 20, rotRect),
      "Off rotated minor axis is outside",
    );
  });

  test("getTerrainAt resolves layer priorities and default fallback", () => {
    const testZones: TerrainZone[] = [
      {
        id: "base-fairway",
        type: "fairway",
        shape: "rect",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
      },
      {
        id: "green-target",
        type: "green",
        shape: "circle",
        x: 100,
        y: 100,
        radius: 20,
      },
      {
        id: "bunker-hazard",
        type: "bunker",
        shape: "circle",
        x: 110,
        y: 100,
        radius: 5,
      },
    ];

    // Bunker is on top of green and fairway
    assert.equal(getTerrainAt(110, 100, testZones), "bunker");
    // Green is on top of fairway outside the bunker
    assert.equal(getTerrainAt(95, 100, testZones), "green");
    // Fairway is around the green
    assert.equal(getTerrainAt(140, 100, testZones), "fairway");
    // Outside the fairway falls back to default (rough)
    assert.equal(getTerrainAt(500, 500, testZones), DEFAULT_TERRAIN);
  });

  test("COURSE_ZONES layout correctly identifies key landmark locations", () => {
    assert.ok(COURSE_ZONES.length > 0, "Course layout must contain zones");

    // Spawn hub center (1500, 1500) is on Fairway
    assert.equal(getTerrainAt(1500, 1500), "fairway");
    assert.equal(getTerrainPropertiesAt(1500, 1500).type, "fairway");

    // Practice green near hub (1380, 1380) is Green
    assert.equal(getTerrainAt(1380, 1380), "green");
    assert.equal(getTerrainPropertiesAt(1380, 1380).type, "green");

    // Practice bunker near hub (1620, 1620) is Bunker
    assert.equal(getTerrainAt(1620, 1620), "bunker");
    assert.equal(getTerrainPropertiesAt(1620, 1620).type, "bunker");

    // Hole 1 Green (1500, 2400) is Green
    assert.equal(getTerrainAt(1500, 2400), "green");

    // Hole 1 Greenside bunker left (1410, 2380) is Bunker
    assert.equal(getTerrainAt(1410, 2380), "bunker");

    // Far outside course corridor (e.g. 100, 2900) is Rough
    assert.equal(getTerrainAt(100, 2900), "rough");
    assert.equal(getTerrainPropertiesAt(100, 2900).type, "rough");
  });

  test("strikeBall applies reduced carry penalty when hitting from Rough and Bunker", () => {
    const hitter: PlayerState = {
      id: "p1",
      name: "P1",
      x: 0,
      y: 0,
      color: 0,
      facingX: 1,
      facingY: 0,
    };

    const power = 1.0;

    // Shot from Fairway
    const fairwayBall = createBall("b-fairway", "p1", 0, 1500, 1500);
    strikeBall(fairwayBall, hitter, power);
    // vx is horizontal launch speed
    const fairwayVx = fairwayBall.vx;

    // Shot from Rough (using custom zone or out of bounds rough)
    const roughBall = createBall("b-rough", "p1", 0, 100, 2900);
    strikeBall(roughBall, hitter, power);
    const roughVx = roughBall.vx;

    // Shot from Sand Bunker
    const bunkerBall = createBall("b-bunker", "p1", 0, 1620, 1620);
    strikeBall(bunkerBall, hitter, power);
    const bunkerVx = bunkerBall.vx;

    // Carry ratio = (roughVx / fairwayVx)^2 since carry is proportional to v^2
    const roughRatio = (roughVx * roughVx) / (fairwayVx * fairwayVx);
    assert.ok(
      Math.abs(roughRatio - TERRAIN_PROPERTIES.rough.carryMultiplier) < 1e-4,
      `Rough carry ratio ${roughRatio} must match rough carry multiplier`,
    );

    const bunkerRatio = (bunkerVx * bunkerVx) / (fairwayVx * fairwayVx);
    assert.ok(
      Math.abs(bunkerRatio - TERRAIN_PROPERTIES.bunker.carryMultiplier) < 1e-4,
      `Bunker carry ratio ${bunkerRatio} must match bunker carry multiplier`,
    );
  });

  test("rolling ball on Green rolls further than on Fairway, Rough, and Bunker", () => {
    const testZones: TerrainZone[] = [
      {
        id: "green-strip",
        type: "green",
        shape: "rect",
        x: 0,
        y: 100,
        width: 1000,
        height: 50,
      },
      {
        id: "fairway-strip",
        type: "fairway",
        shape: "rect",
        x: 0,
        y: 200,
        width: 1000,
        height: 50,
      },
      {
        id: "rough-strip",
        type: "rough",
        shape: "rect",
        x: 0,
        y: 300,
        width: 1000,
        height: 50,
      },
      {
        id: "bunker-strip",
        type: "bunker",
        shape: "rect",
        x: 0,
        y: 400,
        width: 1000,
        height: 50,
      },
    ];

    function runRoll(y: number): number {
      const ball = createBall("b", "p", 0, 0, y);
      ball.resting = false;
      ball.z = 0;
      ball.vx = 80;
      ball.vy = 0;
      ball.vz = 0;

      const dt = 1 / 240;
      for (let t = 0; t < 5; t += dt) {
        stepBall(ball, dt, testZones);
        if (ball.resting) break;
      }
      return ball.x;
    }

    const distGreen = runRoll(100);
    const distFairway = runRoll(200);
    const distRough = runRoll(300);
    const distBunker = runRoll(400);

    assert.ok(
      distGreen > distFairway,
      `Green roll (${distGreen.toFixed(1)}) must exceed Fairway roll (${distFairway.toFixed(1)})`,
    );
    assert.ok(
      distFairway > distRough,
      `Fairway roll (${distFairway.toFixed(1)}) must exceed Rough roll (${distRough.toFixed(1)})`,
    );
    assert.ok(
      distRough > distBunker,
      `Rough roll (${distRough.toFixed(1)}) must exceed Bunker roll (${distBunker.toFixed(1)})`,
    );
    assert.ok(
      distBunker < 10,
      `Bunker roll (${distBunker.toFixed(1)}) must stop very quickly`,
    );
  });
});
