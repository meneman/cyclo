import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Ball radius in world units. A true-to-scale ball next to the ~29u tall
 * characters would be ~0.35u (about 2 screen px at CAMERA_ZOOM 3), so it is
 * deliberately oversized to read clearly from the top-down camera.
 */
export const GOLF_BALL_RADIUS = 1.5;
/** Number of dimples spread over the surface (real balls have ~300-400) */
const DIMPLE_COUNT = 180;
/** Angular radius of one dimple, in radians */
const DIMPLE_ANGLE = 0.13;
/** Dimple depth as a fraction of the ball radius */
const DIMPLE_DEPTH = 0.035;
/** Icosahedron subdivision level — high enough to resolve the dimples */
const SPHERE_DETAIL = 5;

/** Soft blob shadow under the ball, offset away from the sun */
const SHADOW_RADIUS_FACTOR = 1.15;
const SHADOW_OFFSET = new THREE.Vector2(-0.35, 0.2);
const SHADOW_OPACITY = 0.35;

/**
 * Evenly spreads `count` unit vectors over a sphere (Fibonacci lattice),
 * which gives the regular-but-not-gridlike dimple pattern of a golf ball.
 */
export function fibonacciSphere(count: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    points.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r));
  }
  return points;
}

/**
 * Builds the dimpled sphere: a finely subdivided icosphere whose vertices are
 * pushed inward with a smooth spherical-cap profile around each dimple
 * center, then re-welded so normals shade smoothly.
 */
function createDimpledGeometry(radius: number): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(radius, SPHERE_DETAIL);
  base.deleteAttribute("normal");
  base.deleteAttribute("uv");
  const geometry = mergeVertices(base);
  base.dispose();

  const dimples = fibonacciSphere(DIMPLE_COUNT);
  const cosLimit = Math.cos(DIMPLE_ANGLE);
  const position = geometry.getAttribute("position");
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    dir.copy(v).normalize();
    let depth = 0;
    for (const center of dimples) {
      const c = dir.dot(center);
      if (c <= cosLimit) continue;
      // 0 at the rim, 1 at the center; squared-cosine gives a round bowl.
      const t = 1 - Math.acos(Math.min(1, c)) / DIMPLE_ANGLE;
      depth = Math.max(depth, Math.sin((t * Math.PI) / 2) ** 2);
    }
    v.copy(dir).multiplyScalar(radius * (1 - depth * DIMPLE_DEPTH));
    position.setXYZ(i, v.x, v.y, v.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

let sharedGeometry: THREE.BufferGeometry | null = null;
let sharedShadowGeometry: THREE.CircleGeometry | null = null;
let sharedRingGeometry: THREE.RingGeometry | null = null;

/** Glossy white urethane cover */
const ballMaterial = new THREE.MeshStandardMaterial({
  color: 0xf7f7f2,
  roughness: 0.35,
  metalness: 0.0,
});

/**
 * Creates our golf ball resting on the ground. Scene convention matches
 * WorldScene: XY is the playfield, +Z points up toward the camera, so the
 * group origin is the ground contact point and the ball center sits at
 * z = radius. Geometry is shared between instances.
 */
export function createGolfBall(color = 0xffffff): THREE.Group {
  sharedGeometry ??= createDimpledGeometry(GOLF_BALL_RADIUS);
  sharedShadowGeometry ??= new THREE.CircleGeometry(
    GOLF_BALL_RADIUS * SHADOW_RADIUS_FACTOR,
    24,
  );
  sharedRingGeometry ??= new THREE.RingGeometry(
    GOLF_BALL_RADIUS * 1.15,
    GOLF_BALL_RADIUS * 1.45,
    32,
  );

  const group = new THREE.Group();
  group.name = "GolfBall";

  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(sharedRingGeometry, ringMaterial);
  ring.name = "Ring";
  ring.position.z = 0.01;
  group.add(ring);

  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(sharedShadowGeometry, shadowMat);
  shadow.name = "Shadow";
  shadow.position.set(SHADOW_OFFSET.x, SHADOW_OFFSET.y, 0.02);
  shadow.renderOrder = -1;
  group.add(shadow);

  const ball = new THREE.Mesh(sharedGeometry, ballMaterial);
  ball.name = "Ball";
  ball.position.z = GOLF_BALL_RADIUS;
  group.add(ball);

  return group;
}

/**
 * Updates ball and shadow 3D height appearance:
 * - Ball moves up along Z and scales up slightly (x1.0 -> x1.4)
 * - Shadow stays on the ground, slides along the sun projection ray, and shrinks/fades
 */
export function updateGolfBallVisual(group: THREE.Group, z: number): void {
  const ball = group.getObjectByName("Ball") as THREE.Mesh | undefined;
  const shadow = group.getObjectByName("Shadow") as THREE.Mesh | undefined;
  if (!ball || !shadow) return;

  const height = Math.max(0, z);
  ball.position.z = GOLF_BALL_RADIUS + height;
  const ballScale = 1.0 + 1.5 * Math.min(1, height / 75);
  ball.scale.setScalar(ballScale);

  const heightFade = Math.max(0, 1 - height / 50);
  shadow.position.set(
    SHADOW_OFFSET.x * (1 + height * 0.4),
    SHADOW_OFFSET.y * (1 + height * 0.4),
    0.02,
  );
  shadow.scale.setScalar(Math.max(0.15, heightFade));
  if (shadow.material instanceof THREE.MeshBasicMaterial) {
    shadow.material.opacity = SHADOW_OPACITY * heightFade;
  }
}

/** Releases the shared GPU resources (call when the world scene is torn down). */
export function disposeGolfBallResources(): void {
  sharedGeometry?.dispose();
  sharedGeometry = null;
  sharedShadowGeometry?.dispose();
  sharedShadowGeometry = null;
  sharedRingGeometry?.dispose();
  sharedRingGeometry = null;
}
