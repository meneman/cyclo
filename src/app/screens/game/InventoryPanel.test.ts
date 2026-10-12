import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { InventoryPanel } from "./InventoryPanel";

function textsOf(panel: InventoryPanel): string[] {
  return panel.children
    .filter((c) => "text" in c)
    .map((c) => (c as unknown as { text: string }).text);
}

describe("InventoryPanel", () => {
  test("initializes empty with 0/5 header", () => {
    const panel = new InventoryPanel();
    assert.ok(textsOf(panel).includes("INV 0/5"));
  });

  test("setInventory lists owned names and marks equipped", () => {
    const panel = new InventoryPanel();
    panel.setInventory(["titan-ball", "tailwind"], { club: "tailwind" });
    const texts = textsOf(panel);
    assert.ok(texts.includes("INV 2/5"));
    assert.ok(texts.includes("· Titan Ball"));
    assert.ok(texts.includes("▸ Tailwind"));
  });

  test("setInventory shows stack count suffix when greater than 1", () => {
    const panel = new InventoryPanel();
    panel.setInventory(["tailwind"], { club: "tailwind" }, { tailwind: 2 });
    const texts = textsOf(panel);
    assert.ok(texts.includes("▸ Tailwind x2"));
  });

  test("reposition anchors panel to the bottom right", () => {
    const panel = new InventoryPanel();
    panel.reposition(1920, 1080, 12);
    // panel width is 190, margin is 12 -> 1920 - 12 - 190 = 1718
    assert.equal(panel.position.x, 1718);
    assert.ok(panel.position.y < 1080);
    assert.ok(panel.position.y > 800);
  });
});
