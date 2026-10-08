import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  PLAYER_RADIUS,
  PLAYER_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import { directionFromInput, stepPlayer } from "./simulation";
import type { InputState, PlayerState } from "./types";

const RIGHT: InputState = {
  up: false,
  down: false,
  left: false,
  right: true,
  charging: false,
};
const IDLE: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  charging: false,
};

function keys(overrides: Partial<InputState>): InputState {
  return { ...IDLE, ...overrides };
}

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

  test("charges swing power and blocks movement while charging", () => {
    const player = makePlayer();
    // Hold right AND charge space simultaneously
    stepPlayer(
      player,
      { up: false, down: false, left: false, right: true, charging: true },
      0.75,
    );
    // Player must NOT move while charging
    assert.equal(player.x, 600);
    assert.equal(player.y, 450);
    // 0.75s / 1.5s = 0.5 (50% power)
    assert.ok(Math.abs((player.charge ?? 0) - 0.5) < 1e-6);
  });

  test("releasing charge triggers swing with accumulated power and resets charge", () => {
    const player = makePlayer();
    player.charge = 0.8;
    stepPlayer(player, IDLE, 0.05);
    assert.equal(player.charge, 0);
    assert.equal(player.swingPower, 0.8);
    assert.equal(player.swingSeq, 1);
  });

  test("normalizes diagonal movement", () => {
    const player = makePlayer();
    stepPlayer(
      player,
      { up: false, down: true, left: false, right: true, charging: false },
      1,
    );
    const expected = PLAYER_SPEED / Math.SQRT2;
    assert.ok(Math.abs(player.x - (600 + expected)) < 1e-9);
    assert.ok(Math.abs(player.y - (450 + expected)) < 1e-9);
  });

  test("clamps to the world bounds", () => {
    const player = makePlayer(WORLD_WIDTH - PLAYER_RADIUS, WORLD_HEIGHT / 2);
    stepPlayer(player, RIGHT, 1);
    assert.equal(player.x, WORLD_WIDTH - PLAYER_RADIUS);
    const top = makePlayer(100, PLAYER_RADIUS);
    stepPlayer(
      top,
      { up: true, down: false, left: false, right: false, charging: false },
      1,
    );
    assert.equal(top.y, PLAYER_RADIUS);
  });
});

describe("directionFromInput", () => {
  const DIAG = Math.SQRT1_2;

  test("resolves the 4 cardinal vectors", () => {
    assert.deepEqual(directionFromInput(keys({ up: true })), { x: 0, y: -1 });
    assert.deepEqual(directionFromInput(keys({ down: true })), { x: 0, y: 1 });
    assert.deepEqual(directionFromInput(keys({ left: true })), { x: -1, y: 0 });
    assert.deepEqual(directionFromInput(keys({ right: true })), { x: 1, y: 0 });
  });

  test("resolves the 4 in-between vectors from two-key chords", () => {
    assert.deepEqual(directionFromInput(keys({ up: true, right: true })), {
      x: DIAG,
      y: -DIAG,
    });
    assert.deepEqual(directionFromInput(keys({ down: true, right: true })), {
      x: DIAG,
      y: DIAG,
    });
    assert.deepEqual(directionFromInput(keys({ down: true, left: true })), {
      x: -DIAG,
      y: DIAG,
    });
    assert.deepEqual(directionFromInput(keys({ up: true, left: true })), {
      x: -DIAG,
      y: -DIAG,
    });
  });

  test("idle and opposite keys resolve to null", () => {
    assert.equal(directionFromInput(IDLE), null);
    assert.equal(directionFromInput(keys({ up: true, down: true })), null);
    assert.equal(directionFromInput(keys({ left: true, right: true })), null);
  });

  test("three-key chords reduce to the surviving axis", () => {
    assert.deepEqual(
      directionFromInput(keys({ up: true, left: true, down: true })),
      { x: -1, y: 0 },
    );
    assert.deepEqual(
      directionFromInput(keys({ left: true, up: true, right: true })),
      { x: 0, y: -1 },
    );
  });
});
