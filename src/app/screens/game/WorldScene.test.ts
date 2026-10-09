import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { yawForDirection } from "./WorldScene";

const STEP = Math.PI / 4;

describe("yawForDirection", () => {
  test("returns correct cardinal headings", () => {
    assert.equal(yawForDirection(0, 1), 0);
    assert.equal(yawForDirection(1, 0), STEP * 2);
    assert.equal(yawForDirection(0, -1), Math.PI);
    assert.equal(yawForDirection(-1, 0), -STEP * 2);
  });

  test("returns correct in-between headings", () => {
    assert.equal(yawForDirection(1, 1), STEP);
    assert.equal(yawForDirection(-1, 1), -STEP);
    assert.equal(yawForDirection(1, -1), STEP * 3);
    assert.equal(yawForDirection(-1, -1), -STEP * 3);
  });

  test("returns continuous exact angles without snapping", () => {
    const angle1 = 0.1 * Math.PI;
    const dir1 = { x: Math.sin(angle1), y: Math.cos(angle1) };
    assert.ok(Math.abs(yawForDirection(dir1.x, dir1.y) - angle1) < 0.0001);

    const angle2 = 0.15 * Math.PI;
    const dir2 = { x: Math.sin(angle2), y: Math.cos(angle2) };
    assert.ok(Math.abs(yawForDirection(dir2.x, dir2.y) - angle2) < 0.0001);
  });
});
