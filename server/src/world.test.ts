import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { World } from "./world";

describe("World combat and hole scoring", () => {
  test("World initializes with default bots and holes", () => {
    const world = new World();
    assert.ok(world);
  });

  test("World tracks bot frags and holes", () => {
    const world = new World();
    const bot = world.spawnBot({ name: "Test Shooter" });
    assert.equal(bot.state.frags, 0);
    assert.equal(bot.state.holes, 0);
  });
});
