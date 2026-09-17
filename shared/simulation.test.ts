import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  PLAYER_FRICTION,
  PLAYER_MAX_SPEED,
  TICK_INTERVAL_MS,
} from "./constants";
import { stepPlayer } from "./simulation";
import type {
  InputState,
  JumpState,
  MovementState,
  PlayerState,
} from "./types";

const HELD: InputState = {
  up: true,
  down: false,
  left: false,
  right: false,
  jump: false,
};
const IDLE: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  jump: false,
};

function makePlayer(): PlayerState {
  return {
    id: "p1",
    name: "p1",
    x: 1000,
    y: 1000,
    rotation: 0,
    color: 0xffffff,
    jumping: false,
    speed: 0,
  };
}

describe("stepPlayer", () => {
  test("mirrors movement speed onto player.speed for network sync", () => {
    const player = makePlayer();
    const jump: JumpState = { timeRemaining: 0, keyWasHeld: false };
    const movement: MovementState = { speed: 0 };
    stepPlayer(player, HELD, TICK_INTERVAL_MS / 1000, jump, movement);
    assert.ok(player.speed > 0, "expected speed to increase while input held");
    assert.equal(
      player.speed,
      movement.speed,
      "player.speed must mirror the authoritative movement speed",
    );
  });

  test("decays speed toward zero with no input (friction)", () => {
    const player = makePlayer();
    const jump: JumpState = { timeRemaining: 0, keyWasHeld: false };
    const movement: MovementState = { speed: PLAYER_MAX_SPEED };
    player.speed = PLAYER_MAX_SPEED;
    const dt = TICK_INTERVAL_MS / 1000;
    stepPlayer(player, IDLE, dt, jump, movement);
    assert.equal(player.speed, PLAYER_MAX_SPEED - PLAYER_FRICTION * dt);
  });

  test("jump triggers on rising edge only", () => {
    const player = makePlayer();
    const jump: JumpState = { timeRemaining: 0, keyWasHeld: false };
    const movement: MovementState = { speed: 0 };
    const dt = TICK_INTERVAL_MS / 1000;
    const jumping: InputState = { ...IDLE, jump: true };
    stepPlayer(player, jumping, dt, jump, movement);
    assert.equal(player.jumping, true);
    // Holding space must not re-trigger once the window expires.
    jump.timeRemaining = 0;
    stepPlayer(player, jumping, dt, jump, movement);
    assert.equal(player.jumping, false);
  });
});
