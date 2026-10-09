import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { Mesh } from "three";

import {
  BLOOD_STAIN_ELEVATION,
  createBloodStain,
  disposeBloodStain,
  disposeBloodStainResources,
} from "./BloodStain";

describe("BloodStain", () => {
  test("createBloodStain creates a Group with pool lobes and droplets at proper elevation", () => {
    const stain = createBloodStain();
    assert.equal(stain.name, "BloodStain");
    assert.equal(stain.position.z, BLOOD_STAIN_ELEVATION);

    const meshes = stain.children.filter((c) => c instanceof Mesh);
    // 1 main circle + 2 lobes + 9 droplets = 12 meshes
    assert.ok(
      meshes.length >= 10,
      `expected at least 10 meshes, got ${meshes.length}`,
    );
  });

  test("disposeBloodStain and disposeBloodStainResources clean up cleanly", () => {
    const stain = createBloodStain();
    disposeBloodStain(stain);
    disposeBloodStainResources();
    assert.ok(true, "dispose should succeed without throwing");
  });
});
