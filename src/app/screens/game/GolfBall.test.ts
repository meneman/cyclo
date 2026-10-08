import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import * as THREE from "three";

import {
  GOLF_BALL_RADIUS,
  createGolfBall,
  fibonacciSphere,
  updateGolfBallVisual,
} from "./GolfBall";

describe("GolfBall", () => {
  test("fibonacciSphere returns unit vectors", () => {
    const points = fibonacciSphere(50);
    assert.equal(points.length, 50);
    for (const p of points) assert.ok(Math.abs(p.length() - 1) < 1e-9);
  });

  test("ball rests on the ground with a dimpled surface", () => {
    const group = createGolfBall();
    assert.equal(group.name, "GolfBall");
    const ball = group.getObjectByName("Ball") as THREE.Mesh;
    assert.ok(ball);
    assert.equal(group.getObjectByName("Shadow")?.position.z, 0.02);

    const box = new THREE.Box3().setFromObject(ball);
    // Bottom touches the ground plane (z=0), never sinks below it. The
    // lowest point may fall inside a dimple, so allow up to dimple depth.
    assert.ok(box.min.z >= -1e-6 && box.min.z < GOLF_BALL_RADIUS * 0.04);
    assert.ok(Math.abs(box.max.z - 2 * GOLF_BALL_RADIUS) < 0.01);

    // Dimples: some vertices sit noticeably inside the nominal radius.
    const pos = ball.geometry.getAttribute("position");
    const v = new THREE.Vector3();
    let minR = Infinity;
    for (let i = 0; i < pos.count; i++) {
      minR = Math.min(minR, v.fromBufferAttribute(pos, i).length());
    }
    assert.ok(minR < GOLF_BALL_RADIUS * 0.98);
  });

  test("owner ring is attached with custom color", () => {
    const group = createGolfBall(0xff0000);
    const ring = group.getObjectByName("Ring") as THREE.Mesh;
    assert.ok(ring);
    assert.equal(ring.position.z, 0.01);
  });

  test("updateGolfBallVisual scales ball and slides shadow with height", () => {
    const group = createGolfBall();
    const ball = group.getObjectByName("Ball") as THREE.Mesh;
    const shadow = group.getObjectByName("Shadow") as THREE.Mesh;

    updateGolfBallVisual(group, 20);
    assert.equal(ball.position.z, GOLF_BALL_RADIUS + 20);
    assert.ok(ball.scale.x > 1.0);
    assert.ok(shadow.scale.x < 1.0);
  });
});
