import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  PLAYER_RADIUS,
  PLAYER_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import { stepPlayer } from "./simulation";
import type { InputState, PlayerState } from "./types";

const RIGHT: InputState = { up: false, down: false, left: false, right: true };
const IDLE: InputState = { up: false, down: false, left: false, right: false };

function makePlayer(x = 600, y = 450): PlayerState {
  return { id: "p1", name: "p1", x, y, color: 0xffffff };
}

describe("stepPlayer", () => {
  test("moves at constant speed along the held axis", () => {
    const player = makePlayer();
    stepPlayer(player, RIGHT, 0.05);
    assert.equal(player.x, 600 + PLAYER_SPEED * 0.05);
    assert.equal(player.y, 450);
  });

  test("stays put with no input", () => {
    const player = makePlayer();
    stepPlayer(player, IDLE, 0.05);
    assert.deepEqual({ x: player.x, y: player.y }, { x: 600, y: 450 });
  });

  test("normalizes diagonal movement", () => {
    const player = makePlayer();
    stepPlayer(player, { up: false, down: true, left: false, right: true }, 1);
    const expected = PLAYER_SPEED / Math.SQRT2;
    assert.ok(Math.abs(player.x - (600 + expected)) < 1e-9);
    assert.ok(Math.abs(player.y - (450 + expected)) < 1e-9);
  });

  test("clamps to the world bounds", () => {
    const player = makePlayer(WORLD_WIDTH - PLAYER_RADIUS, WORLD_HEIGHT / 2);
    stepPlayer(player, RIGHT, 1);
    assert.equal(player.x, WORLD_WIDTH - PLAYER_RADIUS);
    const top = makePlayer(100, PLAYER_RADIUS);
    stepPlayer(top, { up: true, down: false, left: false, right: false }, 1);
    assert.equal(top.y, PLAYER_RADIUS);
  });
});
