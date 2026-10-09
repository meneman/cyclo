import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import type { MatchState } from "../../../../shared/types";
import { MatchEndOverlay } from "./MatchEndOverlay";

describe("MatchEndOverlay", () => {
  test("initializes hidden", () => {
    const overlay = new MatchEndOverlay();
    assert.equal(overlay.visible, false);
  });

  test("showMatchEnd displays VICTORY when local player wins", () => {
    const overlay = new MatchEndOverlay();
    const match: MatchState = {
      roomId: "room-abc",
      status: "finished",
      countdownSeconds: null,
      targetScore: 10,
      winnerId: "p1",
      winnerName: "Tiger",
      players: [
        {
          id: "p1",
          name: "Tiger",
          color: 0xef4444,
          frags: 6,
          holes: 4,
          score: 10,
        },
        {
          id: "p2",
          name: "Arnie",
          color: 0x3b82f6,
          frags: 2,
          holes: 3,
          score: 5,
        },
      ],
    };

    overlay.showMatchEnd(match, "p1");
    assert.equal(overlay.visible, true);
    assert.equal(overlay.getTitleText(), "VICTORY!");
    assert.ok(overlay.getSubtitleText().includes("You reached 10 points"));
  });

  test("showMatchEnd displays DEFEAT when opponent wins", () => {
    const overlay = new MatchEndOverlay();
    const match: MatchState = {
      roomId: "room-abc",
      status: "finished",
      countdownSeconds: null,
      targetScore: 10,
      winnerId: "p2",
      winnerName: "Arnie",
      players: [
        {
          id: "p1",
          name: "Tiger",
          color: 0xef4444,
          frags: 3,
          holes: 2,
          score: 5,
        },
        {
          id: "p2",
          name: "Arnie",
          color: 0x3b82f6,
          frags: 6,
          holes: 4,
          score: 10,
        },
      ],
    };

    overlay.showMatchEnd(match, "p1");
    assert.equal(overlay.visible, true);
    assert.equal(overlay.getTitleText(), "DEFEAT");
    assert.ok(
      overlay.getSubtitleText().includes("Arnie reached 10 points first"),
    );
  });

  test("hide closes overlay", () => {
    const overlay = new MatchEndOverlay();
    overlay.showMatchEnd(
      {
        roomId: "room-abc",
        status: "finished",
        countdownSeconds: null,
        targetScore: 10,
        winnerId: "p1",
        winnerName: "Tiger",
        players: [],
      },
      "p1",
    );
    assert.equal(overlay.visible, true);

    overlay.hide();
    assert.equal(overlay.visible, false);
  });
});
