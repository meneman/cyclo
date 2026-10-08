import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { createBall } from "../../shared/ballPhysics";
import { BallPredictor } from "./BallPredictor";

describe("BallPredictor", () => {
  test("initializes new balls from snapshot", () => {
    const predictor = new BallPredictor();
    const b1 = createBall("b1", "p1", 0xff0000, 100, 200);
    predictor.onSnapshot([b1]);

    const rendered = predictor.getBalls();
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0].id, "b1");
    assert.equal(rendered[0].x, 100);
    assert.equal(rendered[0].y, 200);
    assert.equal(rendered[0].color, 0xff0000);
  });

  test("removes balls that vanish from snapshot", () => {
    const predictor = new BallPredictor();
    const b1 = createBall("b1", "p1", 0xff0000, 100, 200);
    predictor.onSnapshot([b1]);
    assert.equal(predictor.getBalls().length, 1);

    predictor.onSnapshot([]);
    assert.equal(predictor.getBalls().length, 0);
  });

  test("advances airborne balls between snapshots and smoothly blends render coordinates", () => {
    const predictor = new BallPredictor();
    const b1 = createBall("b1", "p1", 0xff0000, 100, 200);
    b1.resting = false;
    b1.vx = 50;
    b1.vy = 0;
    b1.vz = 30;
    predictor.onSnapshot([b1]);

    // Update locally for 0.1s
    predictor.update(0.1);
    const rendered = predictor.getBalls();
    assert.ok(rendered[0].x > 100, "Rendered position must move forward");
    assert.ok(rendered[0].z > 0, "Ball must be in the air");
  });

  test("clear resets all state", () => {
    const predictor = new BallPredictor();
    predictor.onSnapshot([createBall("b1", "p1", 0, 10, 10)]);
    assert.equal(predictor.getBalls().length, 1);
    predictor.clear();
    assert.equal(predictor.getBalls().length, 0);
  });
});
