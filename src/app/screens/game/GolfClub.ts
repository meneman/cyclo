import * as THREE from "three";

/**
 * Shared geometries for the procedural golf club. Reused across all player
 * instances to minimize memory and WebGL allocations.
 *
 * Dimensions are in the local coordinate space of the Quaternius armature
 * hand bone (PalmR), which has an effective 100x scale relative to model space.
 */
const gripGeometry = new THREE.CylinderGeometry(0.09, 0.076, 0.42, 8);
const gripCapGeometry = new THREE.CylinderGeometry(0.096, 0.09, 0.04, 8);
const ferruleGeometry = new THREE.CylinderGeometry(0.078, 0.078, 0.03, 8);
const shaftGeometry = new THREE.CylinderGeometry(0.056, 0.04, 1.55, 8);
const hoselGeometry = new THREE.CylinderGeometry(0.044, 0.052, 0.1, 8);
const headGeometry = new THREE.BoxGeometry(0.2, 0.14, 0.32);

/** Matte dark rubber grip material */
const gripMaterial = new THREE.MeshStandardMaterial({
  color: 0x1a1c1e,
  roughness: 0.85,
  metalness: 0.05,
});

/** White decorative ferrule ring */
const ferruleMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.5,
  metalness: 0.1,
});

/** Polished chrome/steel shaft material */
const shaftMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8dce2,
  roughness: 0.25,
  metalness: 0.85,
});

/** Brushed metal clubhead material */
const headMaterial = new THREE.MeshStandardMaterial({
  color: 0xc4c9d0,
  roughness: 0.35,
  metalness: 0.8,
});

/**
 * Creates a low-poly stylized golf club (iron/putter) scaled to fit the
 * character hand bone (PalmR).
 */
export function createGolfClub(): THREE.Group {
  const club = new THREE.Group();
  club.name = "GolfClub";

  // Grip wrapped around the hand
  const grip = new THREE.Mesh(gripGeometry, gripMaterial);
  grip.name = "Grip";
  grip.position.set(0, 0.18, 0);
  club.add(grip);

  // Grip cap at the top
  const cap = new THREE.Mesh(gripCapGeometry, gripMaterial);
  cap.name = "GripCap";
  cap.position.set(0, -0.04, 0);
  club.add(cap);

  // White ferrule ring at the bottom of the grip
  const ferrule = new THREE.Mesh(ferruleGeometry, ferruleMaterial);
  ferrule.name = "Ferrule";
  ferrule.position.set(0, 0.4, 0);
  club.add(ferrule);

  // Steel shaft
  const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
  shaft.name = "Shaft";
  shaft.position.set(0, 1.18, 0);
  club.add(shaft);

  // Hosel (connecting collar)
  const hosel = new THREE.Mesh(hoselGeometry, shaftMaterial);
  hosel.name = "Hosel";
  hosel.position.set(0, 1.94, 0);
  club.add(hosel);

  // Iron clubhead blade
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.name = "Head";
  // Heel sits at the hosel (z=0), toe extends inward along -z
  head.position.set(-0.03, 2.0, -0.14);
  // Rotate head so the sole stays level with the grass
  head.rotation.set(0, 0.12, -0.35);
  club.add(head);

  // Tilt club forward into a ready walking/standing stance
  club.rotation.z = REST_ROTATION_Z;
  return club;
}

/** Rest rotation angle of the golf club when carried in hand */
export const REST_ROTATION_Z = 0.35;
/** Maximum backswing rotation angle in radians at full charge */
export const BACKSWING_MAX_RAD = 1.95;
/** Maximum follow-through rotation angle in radians at full power */
export const FOLLOW_THROUGH_MAX_RAD = 1.45;
/** Ratio of the swing animation spent on the downswing stroke */
export const DOWNSWING_RATIO = 0.35;

export interface GolfClubSwingPose {
  /** Euler rotation X for the golf club group (lateral roundness) */
  rotX: number;
  /** Euler rotation Y for the golf club group (wrist hinge & forearm roll) */
  rotY: number;
  /** Euler rotation Z for the golf club group (primary swing arc) */
  rotZ: number;
  /** Body yaw twist angle in radians (torso coil and uncoil) */
  bodyTwistY: number;
}

/**
 * Calculates the complete 3D golf swing pose:
 * - Traverses a round inclined swing plane (sweeps right in backswing, wraps across left on follow-through)
 * - Implements wrist hinge and forearm roll
 * - Calculates torso coiling and uncoiling
 */
export function calculateGolfSwingPose(
  charge: number,
  swingActive: boolean,
  swingElapsed: number,
  swingDuration: number,
  swingPower: number,
): GolfClubSwingPose {
  let u = 0;
  let bodyTwistY = 0;

  if (swingActive && swingDuration > 0) {
    const downswingDuration = swingDuration * DOWNSWING_RATIO;
    const power = Math.min(Math.max(swingPower, 0), 1);

    if (swingElapsed < downswingDuration) {
      const t = Math.min(1, swingElapsed / downswingDuration);
      const eased = t * t;
      u = -power + power * 2.0 * eased;
      bodyTwistY = (-0.28 + 0.63 * eased) * power;
    } else {
      const recoveryDuration = swingDuration - downswingDuration;
      const t = Math.min(
        1,
        (swingElapsed - downswingDuration) / recoveryDuration,
      );
      const eased = 1 - Math.pow(1 - t, 2);
      u = power * (1 - eased);
      bodyTwistY = 0.35 * power * (1 - eased);
    }
  } else if (charge > 0) {
    const clampedCharge = Math.min(Math.max(charge, 0), 1);
    u = -clampedCharge;
    bodyTwistY = -clampedCharge * 0.28;
  }

  const rotZ =
    REST_ROTATION_Z + u * (u < 0 ? BACKSWING_MAX_RAD : FOLLOW_THROUGH_MAX_RAD);
  const rotX = u === 0 ? 0 : -u * 0.75;
  const rotY = u === 0 ? 0 : -u * 0.45;
  const twist = bodyTwistY === 0 ? 0 : bodyTwistY;

  return { rotX, rotY, rotZ, bodyTwistY: twist };
}

/**
 * Calculates the local rotation.z of the golf club for a given swing state.
 *
 * @param charge 0..1 charge level while holding Space
 * @param swingActive whether an active swing stroke is currently executing
 * @param swingElapsed seconds elapsed in the active swing stroke
 * @param swingDuration total duration of the swing stroke in seconds
 * @param swingPower power (0..1) of the executed swing stroke
 */
export function calculateClubRotationZ(
  charge: number,
  swingActive: boolean,
  swingElapsed: number,
  swingDuration: number,
  swingPower: number,
): number {
  return calculateGolfSwingPose(
    charge,
    swingActive,
    swingElapsed,
    swingDuration,
    swingPower,
  ).rotZ;
}

/**
 * Attaches a newly created golf club to the character scene's right hand bone (PalmR).
 *
 * @param characterScene The cloned character model hierarchy
 * @returns true if the bone was found and the club attached, false otherwise
 */
export function attachGolfClub(characterScene: THREE.Object3D): boolean {
  const palm = characterScene.getObjectByName("PalmR");
  if (!palm) {
    return false;
  }
  const club = createGolfClub();
  palm.add(club);
  return true;
}
