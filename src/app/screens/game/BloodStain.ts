import * as THREE from "three";

/** Deep red blood colors */
export const BLOOD_POOL_COLOR = 0x880808;
export const BLOOD_DROPLET_COLOR = 0x5a0000;

export const BLOOD_STAIN_ELEVATION = 0.02;

const poolMaterial = new THREE.MeshBasicMaterial({
  color: BLOOD_POOL_COLOR,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const dropletMaterial = new THREE.MeshBasicMaterial({
  color: BLOOD_DROPLET_COLOR,
  transparent: true,
  opacity: 0.88,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/** Droplet offsets and radii for procedural blood splatter */
const DROPLET_LAYOUT = [
  { x: 9.5, y: 3.5, r: 2.2 },
  { x: -8.0, y: 7.0, r: 1.8 },
  { x: -9.5, y: -4.5, r: 2.4 },
  { x: 5.0, y: -9.0, r: 1.9 },
  { x: 12.0, y: -2.5, r: 1.5 },
  { x: -4.0, y: 11.0, r: 1.4 },
  { x: 2.5, y: 10.0, r: 2.0 },
  { x: 7.0, y: 8.5, r: 1.3 },
  { x: -11.5, y: 2.0, r: 1.6 },
];

/**
 * Creates a procedural blood stain mesh group consisting of a central irregular
 * blood pool and radiating splatter droplets on the turf.
 */
export function createBloodStain(): THREE.Group {
  const group = new THREE.Group();
  group.name = "BloodStain";

  // Central irregular pool made from overlapping circles
  const mainCircle = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 16),
    poolMaterial,
  );
  group.add(mainCircle);

  const lobe1 = new THREE.Mesh(new THREE.CircleGeometry(5.0, 12), poolMaterial);
  lobe1.position.set(3.5, 2.0, 0.0005);
  group.add(lobe1);

  const lobe2 = new THREE.Mesh(new THREE.CircleGeometry(5.5, 12), poolMaterial);
  lobe2.position.set(-2.5, -2.8, 0.0005);
  group.add(lobe2);

  // Splatter droplets
  for (const drop of DROPLET_LAYOUT) {
    const dropletMesh = new THREE.Mesh(
      new THREE.CircleGeometry(drop.r, 8),
      dropletMaterial,
    );
    dropletMesh.position.set(drop.x, drop.y, 0.001);
    group.add(dropletMesh);
  }

  group.position.z = BLOOD_STAIN_ELEVATION;
  return group;
}

/** Disposes geometries allocated for an individual blood stain instance */
export function disposeBloodStain(stain: THREE.Group): void {
  for (const child of stain.children) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
    }
  }
}

/** Disposes shared materials when the scene is destroyed */
export function disposeBloodStainResources(): void {
  poolMaterial.dispose();
  dropletMaterial.dispose();
}
