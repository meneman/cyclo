import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import type { Server, ServerWebSocket } from "bun";
import {
  ITEM_PICKUP_RADIUS,
  ITEM_PICKUP_Y_OFFSET,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../shared/constants";
import type {
  BallState,
  ItemPickupState,
  PlayerSnapshot,
} from "../../shared/types";
import type { SocketData } from "./world";
import { World } from "./world";

/**
 * snapshot()/ballSnapshot() are private read helpers — tests reach them via
 * cast, same as room.test.ts reaches the private tick()/startMatch().
 */
function snapshots(world: World): {
  snapshot(): PlayerSnapshot[];
  ballSnapshot(): BallState[];
  pickupSnapshot(): ItemPickupState[];
} {
  return world as unknown as {
    snapshot(): PlayerSnapshot[];
    ballSnapshot(): BallState[];
    pickupSnapshot(): ItemPickupState[];
  };
}

function createMockSocket(sent: string[]): ServerWebSocket<SocketData> {
  return {
    send: (data: string) => sent.push(data),
  } as unknown as ServerWebSocket<SocketData>;
}

function setPlayerPosition(
  world: World,
  id: string,
  x: number,
  y?: number,
): void {
  const conn = (
    world as unknown as {
      connections: Map<string, { state: { x: number; y: number } }>;
    }
  ).connections.get(id);
  if (conn) {
    conn.state.x = x;
    if (y !== undefined) conn.state.y = y;
  }
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
  test("Welcome carries 2 pickups side by side above the middle", () => {
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
    assert.equal(welcome.pickups?.length, 2);
    const byX = [...(welcome.pickups ?? [])].sort((a, b) => a.x - b.x);
    assert.deepEqual(
      byX.map((p) => p.x),
      [WORLD_WIDTH / 2 - 100, WORLD_WIDTH / 2 + 100],
    );
    for (const p of byX) {
      assert.equal(p.y, WORLD_HEIGHT / 2 - ITEM_PICKUP_Y_OFFSET);
      assert.equal(p.radius, ITEM_PICKUP_RADIUS);
    }
    assert.deepEqual(
      byX.map((p) => p.itemId),
      ["titan-ball", "tailwind"],
    );
  });

  test("Walking into a pickup equips its item", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    setPlayerPosition(world, "p1", WORLD_WIDTH / 2 + 100);
    // Spawn (850,750) heads straight up into the tailwind pickup at (850,550)
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

  test("Walking into a pickup records it in the inventory", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    setPlayerPosition(world, "p1", WORLD_WIDTH / 2 + 100);
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
    assert.deepEqual(player?.inventory, ["tailwind"]);
  });

  test("Full inventory evicts the oldest item (FIFO) on walk-over pickup", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    const equips: Array<{ slot: string; itemId: string }> = [
      { slot: "ball", itemId: "cannonball" },
      { slot: "club", itemId: "driver-x" },
      { slot: "club", itemId: "wrecker" },
      { slot: "club", itemId: "sniper" },
      { slot: "outfit", itemId: "tank-suit" },
    ];
    for (const { slot, itemId } of equips) {
      world.handleMessage("p1", { type: "equipItem", slot, itemId });
    }
    let player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.deepEqual(player?.inventory, [
      "cannonball",
      "driver-x",
      "wrecker",
      "sniper",
      "tank-suit",
    ]);
    // Walk up into the tailwind pickup: 6th distinct item evicts cannonball,
    // which also unequips it from the ball slot.
    setPlayerPosition(world, "p1", WORLD_WIDTH / 2 + 100);
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
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.deepEqual(player?.inventory, [
      "driver-x",
      "wrecker",
      "sniper",
      "tank-suit",
      "tailwind",
    ]);
    assert.equal(player?.loadout?.club, "tailwind");
    assert.equal(player?.loadout?.ball, undefined);
  });

  test("Menu equip beyond 5 evicts the oldest item", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    for (const itemId of [
      "cannonball",
      "driver-x",
      "wrecker",
      "sniper",
      "tank-suit",
    ]) {
      const slot =
        itemId === "cannonball"
          ? "ball"
          : itemId === "tank-suit"
            ? "outfit"
            : "club";
      world.handleMessage("p1", { type: "equipItem", slot, itemId });
    }
    world.handleMessage("p1", {
      type: "equipItem",
      slot: "ball",
      itemId: "titan-ball",
    });
    const player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.deepEqual(player?.inventory, [
      "driver-x",
      "wrecker",
      "sniper",
      "tank-suit",
      "titan-ball",
    ]);
    assert.equal(player?.loadout?.ball, "titan-ball");
  });

  test("Drop removes from inventory and unequips the slot", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    world.handleMessage("p1", {
      type: "equipItem",
      slot: "ball",
      itemId: "cannonball",
    });
    world.handleMessage("p1", { type: "dropItem", itemId: "cannonball" });
    let player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.deepEqual(player?.inventory, []);
    assert.equal(player?.loadout?.ball, undefined);
    // Unknown and unowned drops are no-ops, never throw.
    world.handleMessage("p1", { type: "dropItem", itemId: "nope" });
    world.handleMessage("p1", { type: "dropItem", itemId: "driver-x" });
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.deepEqual(player?.inventory, []);
  });

  test("Walking onto pickup stacks, standing still does not farm, stepping off and back on stacks up to 5 without despawn", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    setPlayerPosition(world, "p1", WORLD_WIDTH / 2 + 100);

    const mockServer = {
      publish: () => {},
    } as unknown as Server<SocketData>;
    const testable = world as unknown as {
      tick: (server: Server<SocketData>) => void;
    };

    // Pickups start available
    let pickups = snapshots(world).pickupSnapshot();
    assert.equal(pickups.length, 2);
    assert.ok(pickups.some((p) => p.itemId === "tailwind"));

    // Walk up into tailwind pickup
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

    for (let i = 0; i < 30; i++) {
      testable.tick(mockServer);
    }

    // Stop moving so player stays standing on the pickup circle
    world.handleMessage("p1", {
      type: "input",
      seq: 2,
      input: {
        up: false,
        down: false,
        left: false,
        right: false,
        charging: false,
      },
    });

    for (let i = 0; i < 5; i++) {
      testable.tick(mockServer);
    }

    let player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.deepEqual(player?.inventory, ["tailwind"]);
    assert.equal(player?.itemStacks?.["tailwind"], 1);

    // Pickups NEVER despawn: still 2 in snapshot
    pickups = snapshots(world).pickupSnapshot();
    assert.equal(pickups.length, 2);
    assert.ok(pickups.some((p) => p.itemId === "tailwind"));

    // Standing still on the pickup circle cannot farm stacks
    for (let i = 0; i < 100; i++) {
      testable.tick(mockServer);
    }
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["tailwind"], 1);

    let seqCounter = 3;
    const stepOffAndOn = () => {
      // Step off the pickup circle (walk down)
      world.handleMessage("p1", {
        type: "input",
        seq: seqCounter++,
        input: {
          up: false,
          down: true,
          left: false,
          right: false,
          charging: false,
        },
      });
      for (let i = 0; i < 20; i++) {
        testable.tick(mockServer);
      }
      // Stop moving
      world.handleMessage("p1", {
        type: "input",
        seq: seqCounter++,
        input: {
          up: false,
          down: false,
          left: false,
          right: false,
          charging: false,
        },
      });
      for (let i = 0; i < 5; i++) {
        testable.tick(mockServer);
      }
      // Walk back on
      world.handleMessage("p1", {
        type: "input",
        seq: seqCounter++,
        input: {
          up: true,
          down: false,
          left: false,
          right: false,
          charging: false,
        },
      });
      for (let i = 0; i < 20; i++) {
        testable.tick(mockServer);
      }
      // Stop moving
      world.handleMessage("p1", {
        type: "input",
        seq: seqCounter++,
        input: {
          up: false,
          down: false,
          left: false,
          right: false,
          charging: false,
        },
      });
      for (let i = 0; i < 5; i++) {
        testable.tick(mockServer);
      }
    };

    // Stack 2
    stepOffAndOn();
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["tailwind"], 2);

    // Pickups still present
    pickups = snapshots(world).pickupSnapshot();
    assert.equal(pickups.length, 2);

    // Stack 3
    stepOffAndOn();
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["tailwind"], 3);

    // Stack 4
    stepOffAndOn();
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["tailwind"], 4);

    // Stack 5 (cap)
    stepOffAndOn();
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["tailwind"], 5);

    // 6th step: remains capped at 5
    stepOffAndOn();
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["tailwind"], 5);
  });

  test("Drop decrements stack by 1 and unequips only when hitting 0", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));
    setPlayerPosition(world, "p1", WORLD_WIDTH / 2 + 100);

    const mockServer = {
      publish: () => {},
    } as unknown as Server<SocketData>;
    const testable = world as unknown as {
      tick: (server: Server<SocketData>) => void;
    };

    // Grab tailwind: walk up 30 ticks, then stop
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
    for (let i = 0; i < 30; i++) {
      testable.tick(mockServer);
    }
    world.handleMessage("p1", {
      type: "input",
      seq: 2,
      input: {
        up: false,
        down: false,
        left: false,
        right: false,
        charging: false,
      },
    });
    for (let i = 0; i < 5; i++) {
      testable.tick(mockServer);
    }

    // Step off (down 20 ticks) and back on (up 20 ticks) to get 2nd stack
    world.handleMessage("p1", {
      type: "input",
      seq: 3,
      input: {
        up: false,
        down: true,
        left: false,
        right: false,
        charging: false,
      },
    });
    for (let i = 0; i < 20; i++) {
      testable.tick(mockServer);
    }
    world.handleMessage("p1", {
      type: "input",
      seq: 4,
      input: {
        up: true,
        down: false,
        left: false,
        right: false,
        charging: false,
      },
    });
    for (let i = 0; i < 20; i++) {
      testable.tick(mockServer);
    }
    world.handleMessage("p1", {
      type: "input",
      seq: 5,
      input: {
        up: false,
        down: false,
        left: false,
        right: false,
        charging: false,
      },
    });
    for (let i = 0; i < 5; i++) {
      testable.tick(mockServer);
    }

    let player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["tailwind"], 2);
    assert.equal(player?.loadout?.club, "tailwind");

    // First drop: decrements stack to 1, still equipped and in inventory
    world.handleMessage("p1", { type: "dropItem", itemId: "tailwind" });
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["tailwind"], 1);
    assert.deepEqual(player?.inventory, ["tailwind"]);
    assert.equal(player?.loadout?.club, "tailwind");

    // Second drop: decrements to 0 -> removed from inventory, unequipped
    world.handleMessage("p1", { type: "dropItem", itemId: "tailwind" });
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["tailwind"], undefined);
    assert.deepEqual(player?.inventory, []);
    assert.equal(player?.loadout?.club, undefined);
  });

  test("Menu equip does not increment stacks beyond 1", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));

    world.handleMessage("p1", {
      type: "equipItem",
      slot: "club",
      itemId: "driver-x",
    });
    let player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["driver-x"], 1);

    // Re-equipping via menu is a no-op for stacks
    world.handleMessage("p1", {
      type: "equipItem",
      slot: "club",
      itemId: "driver-x",
    });
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["driver-x"], 1);
  });

  test("FIFO eviction clears stack entry for the evicted item", () => {
    const world = new World();
    const sent: string[] = [];
    world.addPlayer("p1", createMockSocket(sent));

    for (const itemId of [
      "cannonball",
      "driver-x",
      "wrecker",
      "sniper",
      "tank-suit",
    ]) {
      const slot =
        itemId === "cannonball"
          ? "ball"
          : itemId === "tank-suit"
            ? "outfit"
            : "club";
      world.handleMessage("p1", { type: "equipItem", slot, itemId });
    }
    let player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["cannonball"], 1);

    // Equip 6th item -> evicts cannonball
    world.handleMessage("p1", {
      type: "equipItem",
      slot: "ball",
      itemId: "titan-ball",
    });
    player = snapshots(world)
      .snapshot()
      .find((p) => p.id === "p1");
    assert.equal(player?.itemStacks?.["cannonball"], undefined);
    assert.equal(player?.itemStacks?.["titan-ball"], 1);
  });
});
