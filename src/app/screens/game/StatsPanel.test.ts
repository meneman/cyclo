import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { StatsPanel } from "./StatsPanel";

describe("StatsPanel", () => {
  test("initializes with 0 frags and 0 holes", () => {
    const panel = new StatsPanel();
    assert.ok(panel);
  });

  test("setStats updates frags and holes counts", () => {
    const panel = new StatsPanel();
    panel.setStats(3, 2);
    const texts = panel.children.filter((c) => "text" in c) as Array<{
      text: string;
    }>;
    const frags = texts.find((t) => t.text.startsWith("FRAGS:"));
    const holes = texts.find((t) => t.text.startsWith("Holes:"));

    assert.equal(frags?.text, "FRAGS: 3");
    assert.equal(holes?.text, "Holes: 2");
  });

  test("reposition anchors panel to top right", () => {
    const panel = new StatsPanel();
    panel.reposition(1920, 12, 36);
    // panel width is 150, margin is 12 -> 1920 - 12 - 150 = 1758
    assert.equal(panel.position.x, 1758);
    assert.equal(panel.position.y, 36);
  });
});
