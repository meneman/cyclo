import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { KillBanner } from "./KillBanner";

describe("KillBanner", () => {
  test("initializes hidden", () => {
    const banner = new KillBanner();
    assert.equal(banner.visible, false);
  });

  test("show makes banner visible and sets scale and alpha", () => {
    const banner = new KillBanner();
    banner.show("Bot-Tiger");
    assert.equal(banner.visible, true);
    assert.equal(banner.alpha, 1);
    assert.equal(banner.scale.x, 1.5);
    assert.equal(banner.scale.y, 1.5);
  });

  test("update animates slam down and eventual fade out", () => {
    const banner = new KillBanner();
    banner.show("Bot-Tiger");

    // After 0.12s, slam finishes (scale 1.0)
    banner.update(0.15);
    assert.equal(banner.visible, true);
    assert.equal(banner.scale.x, 1.0);
    assert.equal(banner.alpha, 1.0);

    // After hold duration (0.9s), fading begins
    banner.update(1.0);
    assert.ok(banner.alpha < 1.0, "Should begin fading after hold period");

    // After total duration (> 1.62s), hides completely
    banner.update(1.0);
    assert.equal(banner.visible, false);
  });

  test("reposition centers banner at 32% screen height", () => {
    const banner = new KillBanner();
    banner.reposition(1920, 1080);
    assert.equal(banner.position.x, 960);
    assert.equal(banner.position.y, 1080 * 0.32);
  });
});
