import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "bun:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

import {
  REST_ROTATION_Z,
  attachGolfClub,
  calculateClubRotationZ,
  calculateGolfSwingPose,
  createGolfClub,
} from "./GolfClub";

describe("GolfClub", () => {
  test("createGolfClub creates a Group with all expected components", () => {
    const club = createGolfClub();
    assert.ok(club instanceof THREE.Group);
    assert.equal(club.name, "GolfClub");

    const names = club.children.map((child) => child.name);
    assert.ok(names.includes("Grip"));
    assert.ok(names.includes("GripCap"));
    assert.ok(names.includes("Ferrule"));
    assert.ok(names.includes("Shaft"));
    assert.ok(names.includes("Hosel"));
    assert.ok(names.includes("Head"));

    for (const child of club.children) {
      assert.ok(child instanceof THREE.Mesh);
      const mesh = child as THREE.Mesh;
      assert.ok(mesh.geometry);
      assert.ok(mesh.material);
    }
  });

  test("calculateClubRotationZ handles idle, charging, and swing stroke", () => {
    // Idle
    assert.equal(calculateClubRotationZ(0, false, 0, 0.3, 0), REST_ROTATION_Z);

    // 100% charge
    const fullCharge = calculateClubRotationZ(1.0, false, 0, 0.3, 0);
    assert.ok(Math.abs(fullCharge - (REST_ROTATION_Z - 1.95)) < 1e-6);

    // 50% charge
    const halfCharge = calculateClubRotationZ(0.5, false, 0, 0.3, 0);
    assert.ok(Math.abs(halfCharge - (REST_ROTATION_Z - 0.5 * 1.95)) < 1e-6);

    // Active swing at start (downswing starts from backswing)
    const swingStart = calculateClubRotationZ(0, true, 0, 0.3, 1.0);
    assert.ok(Math.abs(swingStart - (REST_ROTATION_Z - 1.95)) < 1e-6);

    // Active swing completed
    const swingEnd = calculateClubRotationZ(0, true, 0.3, 0.3, 1.0);
    assert.ok(Math.abs(swingEnd - REST_ROTATION_Z) < 1e-6);
  });

  test("calculateGolfSwingPose creates a 3D round swing arc and body twist", () => {
    // Idle
    const idlePose = calculateGolfSwingPose(0, false, 0, 0.35, 0);
    assert.equal(idlePose.rotX, 0);
    assert.equal(idlePose.rotY, 0);
    assert.equal(idlePose.rotZ, REST_ROTATION_Z);
    assert.equal(idlePose.bodyTwistY, 0);

    // Full backswing (charge = 1.0): sweeps out to right (rotX > 0), coils torso (bodyTwistY < 0)
    const backPose = calculateGolfSwingPose(1.0, false, 0, 0.35, 0);
    assert.ok(backPose.rotX > 0.5, "backswing sweeps out to right");
    assert.ok(backPose.rotZ < 0, "backswing raises club behind shoulder");
    assert.ok(backPose.bodyTwistY < 0, "torso coils back");

    // Peak follow-through (at downswing end): wraps left (rotX < 0), twists through (bodyTwistY > 0)
    const finishPose = calculateGolfSwingPose(0, true, 0.35 * 0.35, 0.35, 1.0);
    assert.ok(finishPose.rotX < -0.5, "follow-through wraps across to left");
    assert.ok(finishPose.rotZ > 1.0, "high finish follow-through");
    assert.ok(finishPose.bodyTwistY > 0, "torso uncoils toward target");
  });

  test("attachGolfClub returns false when PalmR bone is missing", () => {
    const emptyScene = new THREE.Group();
    const result = attachGolfClub(emptyScene);
    assert.equal(result, false);
  });

  test("attachGolfClub adds GolfClub to PalmR when bone exists", () => {
    const scene = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = "PalmR";
    scene.add(bone);

    const result = attachGolfClub(scene);
    assert.equal(result, true);

    const club = bone.getObjectByName("GolfClub");
    assert.ok(club);
    assert.ok(club instanceof THREE.Group);
  });

  test("attachGolfClub attaches properly to real male-casual model", async () => {
    const url = new URL(
      "../../../../public/models/male-casual.glb",
      import.meta.url,
    );
    const buffer = readFileSync(url);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );

    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(arrayBuffer, "");
    const cloned = cloneSkinned(gltf.scene);

    const attached = attachGolfClub(cloned);
    assert.equal(attached, true);

    const palm = cloned.getObjectByName("PalmR");
    assert.ok(palm);
    assert.ok(palm?.getObjectByName("GolfClub"));
  });

  test("attachGolfClub attaches properly to real female-casual model", async () => {
    const url = new URL(
      "../../../../public/models/female-casual.glb",
      import.meta.url,
    );
    const buffer = readFileSync(url);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );

    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(arrayBuffer, "");
    const cloned = cloneSkinned(gltf.scene);

    const attached = attachGolfClub(cloned);
    assert.equal(attached, true);

    const palm = cloned.getObjectByName("PalmR");
    assert.ok(palm);
    assert.ok(palm?.getObjectByName("GolfClub"));
  });
});
