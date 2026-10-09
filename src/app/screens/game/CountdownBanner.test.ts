import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { CountdownBanner } from "./CountdownBanner";

describe("CountdownBanner", () => {
  test("initializes hidden", () => {
    const banner = new CountdownBanner();
    assert.equal(banner.visible, false);
  });

  test("setCountdown displays seconds number and pops scale", () => {
    const banner = new CountdownBanner();
    banner.setCountdown(5);
    assert.equal(banner.visible, true);
    assert.equal(banner.getNumberText(), "5");
    assert.equal(banner.isNumberVisible(), true);
    assert.equal(banner.scale.x, 1.4);

    // Update settles scale to 1.0
    banner.update(0.25);
    assert.equal(banner.scale.x, 1.0);
  });

  test("triggerMatchStart displays MATCH START slam banner", () => {
    const banner = new CountdownBanner();
    banner.triggerMatchStart();
    assert.equal(banner.visible, true);
    assert.equal(banner.isStartVisible(), true);
    assert.equal(banner.isNumberVisible(), false);

    // After total animation (> 1.6s), hides completely
    banner.update(2.0);
    assert.equal(banner.visible, false);
  });

  test("reposition centers banner at 38% screen height", () => {
    const banner = new CountdownBanner();
    banner.reposition(1920, 1080);
    assert.equal(banner.position.x, 960);
    assert.equal(banner.position.y, 1080 * 0.38);
  });
});
