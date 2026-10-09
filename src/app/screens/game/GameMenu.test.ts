import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { PLAYER_COLORS } from "../../../../shared/constants";
import type { PlayerState } from "../../../../shared/types";
import { GameMenu, MENU_PANEL_WIDTH, MENU_PANEL_HEIGHT } from "./GameMenu";

describe("GameMenu", () => {
  test("initializes hidden and closed", () => {
    const menu = new GameMenu();
    assert.equal(menu.isOpen, false);
    assert.equal(menu.visible, false);
  });

  test("open and close toggle visibility and state", () => {
    const menu = new GameMenu();
    let closed = false;
    menu.onClose = () => {
      closed = true;
    };

    menu.open("local-1", PLAYER_COLORS[0]);
    assert.equal(menu.isOpen, true);
    assert.equal(menu.visible, true);

    menu.close();
    assert.equal(menu.isOpen, false);
    assert.equal(menu.visible, false);
    assert.equal(closed, true);
  });

  test("toggle flips open and closed states", () => {
    const menu = new GameMenu();
    menu.toggle("local-1", PLAYER_COLORS[1]);
    assert.equal(menu.isOpen, true);

    menu.toggle();
    assert.equal(menu.isOpen, false);
  });

  test("updatePlayers updates player list and handles empty list gracefully", () => {
    const menu = new GameMenu();
    menu.open();

    const samplePlayers: PlayerState[] = [
      {
        id: "p1",
        name: "Alice",
        x: 100,
        y: 100,
        color: PLAYER_COLORS[0],
        frags: 2,
        holes: 1,
      },
      {
        id: "bot-1",
        name: "Bot Arnie",
        x: 200,
        y: 200,
        color: PLAYER_COLORS[1],
        frags: 0,
        holes: 0,
      },
    ];

    menu.updatePlayers(samplePlayers, "p1", PLAYER_COLORS[0]);
    assert.equal(menu.isOpen, true);
  });

  test("setSelectedColor updates selection", () => {
    const menu = new GameMenu();
    menu.open();
    menu.setSelectedColor(PLAYER_COLORS[3]);
    assert.equal(menu.isOpen, true);
  });

  test("resize centers the panel and fills backdrop", () => {
    const menu = new GameMenu();
    menu.resize(1920, 1080);

    const expectedX = (1920 - MENU_PANEL_WIDTH) / 2;
    const expectedY = (1080 - MENU_PANEL_HEIGHT) / 2;

    const panel = menu.children[1];
    assert.equal(panel.position.x, expectedX);
    assert.equal(panel.position.y, expectedY);
  });
});
