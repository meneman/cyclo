import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  VIEWBOX_ASPECT_RATIO,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
} from "../../../shared/constants";

import { resize } from "./resize";

describe("viewbox and resize", () => {
  test("constants define 16:9 locked viewbox", () => {
    assert.equal(VIEWBOX_WIDTH, 1920);
    assert.equal(VIEWBOX_HEIGHT, 1080);
    assert.ok(Math.abs(VIEWBOX_ASPECT_RATIO - 16 / 9) < 0.001);
  });

  test("resize locks dimensions when letterbox is true", () => {
    // Standard 1080p
    const standard = resize(1920, 1080, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, true);
    assert.deepEqual(standard, { width: 1920, height: 1080 });

    // Browser zoomed out (window appears larger in CSS pixels, e.g. 50% zoom = 3840x2160)
    const zoomedOut = resize(3840, 2160, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, true);
    assert.deepEqual(zoomedOut, { width: 1920, height: 1080 });

    // Browser zoomed in (window appears smaller in CSS pixels, e.g. 200% zoom = 960x540)
    const zoomedIn = resize(960, 540, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, true);
    assert.deepEqual(zoomedIn, { width: 1920, height: 1080 });

    // Ultrawide screen (21:9)
    const ultrawide = resize(2560, 1080, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, true);
    assert.deepEqual(ultrawide, { width: 1920, height: 1080 });

    // Portrait / phone window
    const portrait = resize(1080, 1920, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, true);
    assert.deepEqual(portrait, { width: 1920, height: 1080 });
  });

  test("resize scales dimensions when letterbox is false (free-resize mode)", () => {
    const smaller = resize(800, 600, 1024, 600, false);
    assert.ok(smaller.width >= 1024);
    assert.ok(smaller.height >= 600);
  });
});
