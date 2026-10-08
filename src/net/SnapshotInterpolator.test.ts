import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import type { PlayerSnapshot } from "../../shared/types";
import { SnapshotInterpolator } from "./SnapshotInterpolator";

function snapshot(id: string, x: number): PlayerSnapshot {
  return { id, name: id, x, y: 0, color: 0xffffff };
}

describe("SnapshotInterpolator", () => {
  test("clear drops buffered history so a reconnect starts fresh", () => {
    const interpolator = new SnapshotInterpolator(100);
    interpolator.push([snapshot("a", 1)]);
    assert.ok(interpolator.sample("a") !== null);
    interpolator.clear();
    assert.equal(interpolator.sample("a"), null);
  });

  test("single snapshot falls back to the latest known state", () => {
    const interpolator = new SnapshotInterpolator(100);
    interpolator.push([snapshot("a", 7)]);
    assert.equal(interpolator.sample("a")?.x, 7);
  });
});
