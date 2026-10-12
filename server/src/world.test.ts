import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import type { Server, ServerWebSocket } from "bun";
import {
  ITEM_PICKUP_RADIUS,
  ITEM_PICKUP_Y_OFFSET,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../shared/constants";
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

function createMockSocket(sent: string[]): ServerWebSocket<SocketData> {
  return {
    send: (data: string) => sent.push(data),
  } as unknown as ServerWebSocket<SocketData>;
}

describe("World combat and hole scoring", () => {
  test("World starts empty with holes and no bot players", () => {
    const world = new World();
    assert.ok(world);
    const players = snapshots(world).snapshot();
    assert.equal(players.length, 0);
  });

  test("World snapshot contains only connected players", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    const players = snapshots(world).snapshot();
    assert.equal(players.length, 1);
    assert.equal(players[0]?.id, "p1");
    for (const player of players) {
      assert.ok(!player.id.startsWith("bot-"));
      assert.ok(!player.name.startsWith("Bot "));
    }
  });

  test("Chat slash text is broadcast as normal chat and spawns nothing", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    const ballsBefore = snapshots(world).ballSnapshot().length;

    world.handleMessage("p1", { type: "chat", text: "/spawn 3" });

    const players = snapshots(world).snapshot();
    assert.equal(players.length, 1);
    assert.equal(snapshots(world).ballSnapshot().length, ballsBefore);

    const chatMessages = sent
      .map((data) => {
        try {
          return JSON.parse(data) as { type?: string; text?: string };
        } catch {
          return {};
        }
      })
      .filter((msg) => msg.type === "chat");
    const lastChat = chatMessages[chatMessages.length - 1];
    assert.equal(lastChat?.text, "/spawn 3");
  });

  test("World allows player to change color via SetColor message", () => {
    const world = new World();
    const sent: string[] = [];
    const mockWs = createMockSocket(sent);

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

describe("World item pickups", () => {
  test("Welcome carries 3 pickups side by side above the middle", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    interface WelcomeProbe {
      type?: string;
      pickups?: {
        id: string;
        itemId: string;
        x: number;
        y: number;
        radius: number;
      }[];
    }
    const welcome = sent
      .map((data) => {
        try {
          return JSON.parse(data) as WelcomeProbe;
        } catch {
          return {} as WelcomeProbe;
        }
      })
      .find((msg) => msg.type === "welcome");
    assert.ok(welcome);
    assert.equal(welcome.pickups?.length, 3);
    const byX = [...(welcome.pickups ?? [])].sort((a, b) => a.x - b.x);
    assert.deepEqual(
      byX.map((p) => p.x),
      [WORLD_WIDTH / 2 - 140, WORLD_WIDTH / 2, WORLD_WIDTH / 2 + 140],
    );
    for (const p of byX) {
      assert.equal(p.y, WORLD_HEIGHT / 2 - ITEM_PICKUP_Y_OFFSET);
      assert.equal(p.radius, ITEM_PICKUP_RADIUS);
    }
    assert.deepEqual(
      byX.map((p) => p.itemId),
      ["titan-ball", "tailwind", "minnow"],
    );
  });

  test("Walking into a pickup equips its item", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    // Spawn (750,750) heads straight up into the tailwind pickup at (750,550)
    world.handleMessage("p1", {
      type: "input",
      seq: 1,
      input: {
        up: true,
        down: false,
        left: false,
        right: false,
        charging: false,
      },
    });
    const mockServer = {
      publish: () => {},
    } as unknown as Server<SocketData>;
    const testable = world as unknown as {
      tick: (server: Server<SocketData>) => void;
    };
    for (let i = 0; i < 40; i++) {
      testable.tick(mockServer);
    }
    const player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.loadout?.club, "tailwind");
    assert.ok(Math.abs(world.getStats("p1").playerSpeedMult - 0.8) < 1e-9);
  });
});
