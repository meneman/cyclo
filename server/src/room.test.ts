import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import type { Server, ServerWebSocket } from "bun";
import {
  MATCH_COUNTDOWN_SECONDS,
  MATCH_TARGET_SCORE,
  MATCH_TEE_1_SPAWN,
  MATCH_TEE_2_SPAWN,
} from "../../shared/constants";
import type { BallState, HoleState } from "../../shared/types";
import { MatchStatus } from "../../shared/types";
import { RoomManager } from "./roomManager";
import type { SocketData } from "./world";
import { World } from "./world";

function createMockSocket(): ServerWebSocket<SocketData> {
  const sent: string[] = [];
  return {
    send: (data: string) => sent.push(data),
    subscribe: () => {},
    unsubscribe: () => {},
    publish: () => {},
  } as unknown as ServerWebSocket<SocketData>;
}

describe("RoomManager and Match Lifecycle", () => {
  test("RoomManager matches 2 players into the same waiting room", () => {
    const mgr = new RoomManager();
    const room1 = mgr.getOrCreateRoom();
    assert.equal(mgr.getRoomCount(), 1);

    const ws1 = createMockSocket();
    room1.addPlayer("p1", ws1);
    assert.equal(room1.getPlayerCount(), 1);
    assert.equal(room1.getMatchState().status, MatchStatus.Waiting);

    // 2nd player without room code matches into the same room
    const room2 = mgr.getOrCreateRoom();
    assert.equal(room1.id, room2.id);

    const ws2 = createMockSocket();
    room2.addPlayer("p2", ws2);
    assert.equal(room2.getPlayerCount(), 2);
    // 2 players triggers countdown
    assert.equal(room2.getMatchState().status, MatchStatus.Countdown);
    assert.equal(
      room2.getMatchState().countdownSeconds,
      MATCH_COUNTDOWN_SECONDS,
    );
  });

  test("RoomManager supports custom room codes", () => {
    const mgr = new RoomManager();
    const custom = mgr.getOrCreateRoom("custom-room-xyz");
    assert.equal(custom.id, "custom-room-xyz");

    const sameCustom = mgr.getOrCreateRoom("custom-room-xyz");
    assert.equal(sameCustom.id, "custom-room-xyz");
    assert.equal(mgr.getRoomCount(), 1);
  });

  test("Player leaving during countdown reverts match to Waiting", () => {
    const world = new World("test-countdown-abort");
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();

    world.addPlayer("p1", ws1);
    assert.equal(world.getMatchState().status, MatchStatus.Waiting);

    world.addPlayer("p2", ws2);
    assert.equal(world.getMatchState().status, MatchStatus.Countdown);

    world.removePlayer("p2");
    assert.equal(world.getMatchState().status, MatchStatus.Waiting);
    assert.equal(world.getMatchState().countdownSeconds, null);
  });

  test("World transitions to Playing after countdown and teleports to tees", () => {
    const world = new World("test-start");
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();

    world.addPlayer("p1", ws1);
    world.addPlayer("p2", ws2);
    assert.equal(world.getMatchState().status, MatchStatus.Countdown);

    // Advance ticks for full 10s countdown
    const mockServer = {
      publish: () => {},
    } as unknown as Server<SocketData>;

    const testable = world as unknown as {
      tick: (server: Server<SocketData>) => void;
      startMatch: () => void;
      balls: Map<string, BallState>;
      handleHoleScored: (ball: BallState, hole: HoleState) => void;
    };

    // 10 seconds at 20 Hz = 200 ticks
    for (let i = 0; i < 205; i++) {
      testable.tick(mockServer);
    }

    const state = world.getMatchState();
    assert.equal(state.status, MatchStatus.Playing);
    assert.equal(state.countdownSeconds, null);

    const players = world.snapshot();
    const p1 = players.find((p) => p.id === "p1");
    const p2 = players.find((p) => p.id === "p2");
    assert.ok(p1 && p2);
    assert.equal(p1.x, MATCH_TEE_1_SPAWN.x);
    assert.equal(p1.y, MATCH_TEE_1_SPAWN.y);
    assert.equal(p2.x, MATCH_TEE_2_SPAWN.x);
    assert.equal(p2.y, MATCH_TEE_2_SPAWN.y);
  });

  test("Reaching 10 points declares winner and transitions to Finished", () => {
    const world = new World("test-win");
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();

    world.addPlayer("p1", ws1);
    world.addPlayer("p2", ws2);

    const testable = world as unknown as {
      startMatch: () => void;
      balls: Map<string, BallState>;
      handleHoleScored: (ball: BallState, hole: HoleState) => void;
    };

    // Fast-track into playing
    testable.startMatch();
    assert.equal(world.getMatchState().status, MatchStatus.Playing);

    const ball = testable.balls.get("ball-p1");
    assert.ok(ball);
    const dummyHole: HoleState = { id: "hole-1", x: 100, y: 100, radius: 30 };

    for (let i = 0; i < MATCH_TARGET_SCORE; i++) {
      ball.lastHitBy = "p1";
      testable.handleHoleScored(ball, dummyHole);
    }

    const matchState = world.getMatchState();
    assert.equal(matchState.status, MatchStatus.Finished);
    assert.equal(matchState.winnerId, "p1");
  });

  test("RoomManager cleans up empty rooms when players leave", () => {
    const mgr = new RoomManager();
    const room = mgr.getOrCreateRoom("temp-room");
    const ws = createMockSocket();
    room.addPlayer("p1", ws);
    assert.equal(mgr.getRoomCount(), 1);

    mgr.removePlayer("p1", "temp-room");
    assert.equal(mgr.getRoomCount(), 0);
  });
});
