import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "bun:test";
import {
  AnimationClip,
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import {
  CHARACTER_ROSTER,
  characterForPlayerId,
  pickClip,
  tuneCharacterMaterials,
} from "./CharacterRoster";

describe("characterForPlayerId", () => {
  test("is deterministic and stays inside the roster", () => {
    for (const id of ["p1", "550e8400-e29b-41d4-a716-446655440000", ""]) {
      const pick = characterForPlayerId(id);
      assert.ok(
        pick >= 0 && pick < CHARACTER_ROSTER.length,
        `pick ${pick} out of range for ${id}`,
      );
      assert.equal(characterForPlayerId(id), pick, "must be stable");
    }
  });

  test("spreads players across more than one character", () => {
    const picks = new Set(
      Array.from({ length: 50 }, (_, i) => characterForPlayerId(`player-${i}`)),
    );
    assert.ok(picks.size > 1, "expected picks across the roster");
  });
});

describe("pickClip", () => {
  const clips = [
    new AnimationClip("HumanArmature|Man_Walk", 1, []),
    new AnimationClip("HumanArmature|Man_Idle", 1, []),
  ];

  test("matches by name suffix", () => {
    assert.equal(pickClip(clips, "Idle")?.name, "HumanArmature|Man_Idle");
    assert.equal(pickClip(clips, "Walk")?.name, "HumanArmature|Man_Walk");
  });

  test("falls back to the first clip, or null when empty", () => {
    assert.equal(pickClip(clips, "Run")?.name, "HumanArmature|Man_Walk");
    assert.equal(pickClip([], "Idle"), null);
  });
});

describe("roster model files", () => {
  /**
   * Guards the exact bug class that once hid every character: a model in the
   * wrong units (camera inside the mesh reads as green void + clipping
   * streaks). Each shipped GLB must parse, carry Idle/Walk, and stand at a
   * sane height for CHARACTER_SCALE.
   */
  for (const entry of CHARACTER_ROSTER) {
    test(`${entry.id} loads with sane units and Idle/Walk clips`, async () => {
      const url = new URL(
        `../../../../public/models/${entry.id}.glb`,
        import.meta.url,
      );
      const buf = readFileSync(url);
      const gltf = await new Promise<{
        scene: Group;
        animations: AnimationClip[];
      }>((resolve, reject) => {
        new GLTFLoader().parse(
          buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          "",
          resolve,
          reject,
        );
      });
      const height = new Box3()
        .setFromObject(gltf.scene)
        .getSize(new Vector3()).y;
      assert.ok(
        height > 100 && height < 1000,
        `expected model height in the hundreds of units, got ${height}`,
      );
      for (const kind of ["Idle", "Walk"]) {
        assert.ok(pickClip(gltf.animations, kind), `expected an *${kind} clip`);
      }
    });
  }
});

describe("tuneCharacterMaterials", () => {
  test("re-tints female-casual shirt away from green to coral-red and clears emissive", async () => {
    const url = new URL(
      "../../../../public/models/female-casual.glb",
      import.meta.url,
    );
    const buf = readFileSync(url);
    const gltf = await new Promise<{ scene: Group }>((resolve, reject) => {
      new GLTFLoader().parse(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        "",
        resolve,
        reject,
      );
    });
    tuneCharacterMaterials(gltf.scene, "female-casual");

    let foundShirt = false;
    gltf.scene.traverse((child) => {
      if (
        child instanceof Mesh &&
        child.material instanceof MeshStandardMaterial
      ) {
        assert.equal(
          child.material.emissive.getHex(),
          0x000000,
          "emissive must be cleared",
        );
        if (child.material.name === "Shirt") {
          foundShirt = true;
          assert.equal(
            child.material.color.getHex(),
            0xe05638,
            "shirt must be coral-red",
          );
        }
      }
    });
    assert.ok(foundShirt, "female-casual should have a Shirt material");
  });
});
