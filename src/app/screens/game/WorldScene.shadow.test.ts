import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { WORLD_HEIGHT, WORLD_WIDTH } from "../../../../shared/constants";
import { CENTRAL_LIGHT_HEIGHT, shadowForPlayer } from "./WorldScene";

const CX = WORLD_WIDTH / 2;
const CY = WORLD_HEIGHT / 2;

describe("shadowForPlayer", () => {
  test("directly under the light is a short centered blob", () => {
    const s = shadowForPlayer(CX, CY);
    assert.equal(s.offsetX, 0);
    assert.equal(s.offsetY, 0);
    assert.ok(s.length > 0);
    assert.ok(s.width > 0);
  });

  test("offsets point radially away from the map center", () => {
    const east = shadowForPlayer(WORLD_WIDTH, CY);
    assert.ok(east.offsetX > 0);
    assert.ok(Math.abs(east.offsetY) < 1e-6);

    const west = shadowForPlayer(0, CY);
    assert.ok(west.offsetX < 0);

    const south = shadowForPlayer(CX, WORLD_HEIGHT);
    assert.ok(south.offsetY > 0);

    const north = shadowForPlayer(CX, 0);
    assert.ok(north.offsetY < 0);
  });

  test("shadows get longer and more transparent farther from center", () => {
    const center = shadowForPlayer(CX, CY);
    const mid = shadowForPlayer(CX + WORLD_WIDTH / 4, CY);
    const edge = shadowForPlayer(WORLD_WIDTH, CY);
    assert.ok(mid.length > center.length);
    assert.ok(edge.length > mid.length);
    assert.ok(mid.opacity <= center.opacity);
    assert.ok(edge.opacity <= mid.opacity);
    assert.ok(edge.opacity > 0);
  });

  test("lower light means longer shadows", () => {
    const x = CX + WORLD_WIDTH / 4;
    const low = shadowForPlayer(x, CY, CENTRAL_LIGHT_HEIGHT / 2);
    const high = shadowForPlayer(x, CY, CENTRAL_LIGHT_HEIGHT * 2);
    assert.ok(low.length > high.length);
    assert.ok(
      Math.hypot(low.offsetX, low.offsetY) >
        Math.hypot(high.offsetX, high.offsetY),
    );
  });

  test("shadow angle tracks the outward direction continuously", () => {
    const a = shadowForPlayer(CX + 500, CY + 500);
    const b = shadowForPlayer(CX + 500.5, CY + 500.5);
    assert.ok(Math.abs(a.rotationZ - b.rotationZ) < 0.01);
    assert.ok(Math.abs(a.length - b.length) < 1);
  });
});
