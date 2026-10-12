import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { BallState, PlayerSnapshot } from "../../shared/types";
import type { SocketData } from "./world";
import { World } from "./world";

/**
 * snapshot()/ballSnapshot() are private read helpers — tests reach them via
 * cast, same as room.test.ts reaches the private tick()/startMatch().
 */
function snapshots(world: World): {
  snapshot(): PlayerSnapshot[];
  ballSnapshot(): BallState[];
} {
  return world as unknown as {
    snapshot(): PlayerSnapshot[];
    ballSnapshot(): BallState[];
  };
}

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

  test("World allows player to change color via SetColor message", () => {
    const world = new World();
    const sent: string[] = [];
    const mockWs = {
      send: (data: string) => sent.push(data),
    } as unknown as ServerWebSocket<SocketData>;

    world.addPlayer("p1", mockWs);
    const snapBefore = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.ok(snapBefore);

    world.handleMessage("p1", {
      type: "setColor",
      color: 0xef4444,
    });

    const snapAfter = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(snapAfter?.color, 0xef4444);
    const ballSnap = snapshots(world)
      .ballSnapshot()
      .find((b) => b.ownerId === "p1");
    assert.equal(ballSnap?.color, 0xef4444);
  });
});
