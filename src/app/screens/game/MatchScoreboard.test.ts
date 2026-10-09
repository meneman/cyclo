import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import type { MatchState } from "../../../../shared/types";
import { MatchScoreboard } from "./MatchScoreboard";

describe("MatchScoreboard", () => {
  test("displays waiting state and room info", () => {
    const scoreboard = new MatchScoreboard();
    const match: MatchState = {
      roomId: "room-abc",
      status: "waiting",
      countdownSeconds: null,
      targetScore: 10,
      players: [
        {
          id: "p1",
          name: "Player 1",
          color: 0xef4444,
          frags: 0,
          holes: 0,
          score: 0,
        },
      ],
    };

    scoreboard.setMatch(match, "p1");
    assert.ok(scoreboard.getStatusText().includes("WAITING FOR OPPONENT"));
    assert.ok(scoreboard.getDetailText().includes("room-abc"));
    assert.equal(scoreboard.isCopyButtonVisible(), true);
  });

  test("displays countdown and player names", () => {
    const scoreboard = new MatchScoreboard();
    const match: MatchState = {
      roomId: "room-abc",
      status: "countdown",
      countdownSeconds: 8,
      targetScore: 10,
      players: [
        {
          id: "p1",
          name: "Player 1",
          color: 0xef4444,
          frags: 0,
          holes: 0,
          score: 0,
        },
        {
          id: "p2",
          name: "Player 2",
          color: 0x3b82f6,
          frags: 0,
          holes: 0,
          score: 0,
        },
      ],
    };

    scoreboard.setMatch(match, "p1");
    assert.ok(scoreboard.getStatusText().includes("8s"));
    assert.ok(scoreboard.getDetailText().includes("Player 1  VS  Player 2"));
    assert.equal(scoreboard.isCopyButtonVisible(), false);
  });

  test("displays scores and race to 10 in playing state", () => {
    const scoreboard = new MatchScoreboard();
    const match: MatchState = {
      roomId: "room-abc",
      status: "playing",
      countdownSeconds: null,
      targetScore: 10,
      players: [
        {
          id: "p1",
          name: "Tiger",
          color: 0xef4444,
          frags: 2,
          holes: 1,
          score: 3,
        },
        {
          id: "p2",
          name: "Arnie",
          color: 0x3b82f6,
          frags: 4,
          holes: 2,
          score: 6,
        },
      ],
    };

    scoreboard.setMatch(match, "p1");
    assert.ok(scoreboard.getStatusText().includes("Tiger (You)  3"));
    assert.ok(scoreboard.getStatusText().includes("6  Arnie"));
    assert.ok(scoreboard.getStatusText().includes("RACE TO 10"));
  });

  test("reposition centers scoreboard at top", () => {
    const scoreboard = new MatchScoreboard();
    scoreboard.reposition(1920);
    assert.equal(scoreboard.position.x, 960);
    assert.equal(scoreboard.position.y, 12);
  });
});
