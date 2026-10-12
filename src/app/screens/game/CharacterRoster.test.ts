import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "bun:test";
import {
  AnimationClip,
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshToonMaterial,
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

  test("spreads players across available roster characters", () => {
    const picks = new Set(
      Array.from({ length: 50 }, (_, i) => characterForPlayerId(`player-${i}`)),
    );
    if (CHARACTER_ROSTER.length > 1) {
      assert.ok(picks.size > 1, "expected picks across the roster");
    } else {
      assert.equal(
        picks.size,
        1,
        "single character roster assigns all players to 0",
      );
    }
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
   * sane height for the world scene (~28 units).
   */
  for (const entry of CHARACTER_ROSTER) {
    test(`${entry.id} loads with sane units and Idle/Walk clips`, async () => {
      const filename = entry.url.split("/").pop() ?? `${entry.id}.glb`;
      const url = new URL(
        `../../../../public/models/${filename}`,
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
      const effectiveHeight = height * (entry.scale ?? 0.06);
      assert.ok(
        effectiveHeight > 15 && effectiveHeight < 45,
        `expected effective height around ~28 units, got ${effectiveHeight}`,
      );
      for (const kind of ["Idle", "Walk"]) {
        assert.ok(pickClip(gltf.animations, kind), `expected an *${kind} clip`);
      }
    });
  }
});

describe("tuneCharacterMaterials", () => {
  test("tunes robot variants with distinct colors and morph targets", async () => {
    const url = new URL(
      "../../../../public/models/robot-expressive.glb",
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

    tuneCharacterMaterials(gltf.scene, "robot-cyber", null, "cyber");

    let foundMain = false;
    let morphAngrySet = false;
    gltf.scene.traverse((child) => {
      if (child instanceof Mesh && child.material) {
        const mat = child.material as MeshToonMaterial;
        if (mat.name === "Main") {
          foundMain = true;
          assert.equal(
            mat.color.getHex(),
            0xe11d48,
            "cyber bot must be crimson",
          );
        }
      }
      if (
        child instanceof Mesh &&
        child.morphTargetDictionary &&
        child.morphTargetInfluences
      ) {
        const angryIdx = child.morphTargetDictionary["Angry"];
        if (
          angryIdx !== undefined &&
          child.morphTargetInfluences[angryIdx] > 0.5
        ) {
          morphAngrySet = true;
        }
      }
    });

    assert.ok(foundMain, "robot should have Main material");
    assert.ok(
      morphAngrySet,
      "cyber bot should have Angry morph target activated",
    );
  });

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
    let toonCount = 0;
    gltf.scene.traverse((child) => {
      if (
        child instanceof Mesh &&
        (child.material instanceof MeshToonMaterial ||
          child.material instanceof MeshStandardMaterial)
      ) {
        if (child.material instanceof MeshToonMaterial) {
          toonCount++;
        }
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
    assert.ok(
      toonCount > 0,
      "materials should be converted to MeshToonMaterial",
    );
  });
});
