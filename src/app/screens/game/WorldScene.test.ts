import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { yawForDirection } from "./WorldScene";

const STEP = Math.PI / 4;

describe("yawForDirection", () => {
  test("snaps the 4 cardinal headings", () => {
    assert.equal(yawForDirection(0, 1), 0);
    assert.equal(yawForDirection(1, 0), STEP * 2);
    assert.equal(yawForDirection(0, -1), Math.PI);
    assert.equal(yawForDirection(-1, 0), -STEP * 2);
  });

  test("snaps the 4 in-between headings", () => {
    assert.equal(yawForDirection(1, 1), STEP);
    assert.equal(yawForDirection(-1, 1), -STEP);
    assert.equal(yawForDirection(1, -1), STEP * 3);
    assert.equal(yawForDirection(-1, -1), -STEP * 3);
  });

  test("near-boundary directions snap to the nearest heading", () => {
    // The south/south-east boundary sits 0.125π off south: 0.1π snaps back
    // to south, 0.15π snaps forward to south-east.
    const near = { x: Math.sin(0.1 * Math.PI), y: Math.cos(0.1 * Math.PI) };
    const far = { x: Math.sin(0.15 * Math.PI), y: Math.cos(0.15 * Math.PI) };
    assert.equal(yawForDirection(near.x, near.y), 0);
    assert.equal(yawForDirection(far.x, far.y), STEP);
  });
});
