import * as THREE from "three";

const PARTICLE_COUNT = 500;

export class TrailParticles {
  private particles: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private ages = new Float32Array(PARTICLE_COUNT);
  private nextIdx = 0;

  constructor(scene: THREE.Scene) {
    const geom = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    this.particles = new THREE.InstancedMesh(geom, mat, PARTICLE_COUNT);
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.frustumCulled = false;

    // Hide all initially
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.dummy.position.set(9999, 9999, 9999);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.particles.setMatrixAt(i, this.dummy.matrix);
      this.ages[i] = 999;
    }
    this.particles.instanceMatrix.needsUpdate = true;

    scene.add(this.particles);
  }

  public emit(x: number, y: number, z: number, speed: number, count: number) {
    for (let i = 0; i < count; i++) {
      const idx = this.nextIdx;
      this.nextIdx = (this.nextIdx + 1) % PARTICLE_COUNT;

      const rx = x + (Math.random() - 0.5) * 2;
      const ry = y + (Math.random() - 0.5) * 2;
      const rz = z + (Math.random() - 0.5) * 2;

      this.dummy.position.set(rx, ry, rz);

      // Random rotation
      this.dummy.rotation.z = Math.random() * Math.PI * 2;

      // Size depends on speed somewhat
      const s = 0.5 + Math.random() * 0.5 + speed / 250;
      this.dummy.scale.set(s, s, s);

      this.dummy.updateMatrix();
      this.particles.setMatrixAt(idx, this.dummy.matrix);
      this.ages[idx] = 0;
    }
  }

  public update(dt: number) {
    let needsUpdate = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (this.ages[i] < 1.0) {
        this.ages[i] += dt * 5; // fade out speed

        this.particles.getMatrixAt(i, this.dummy.matrix);
        this.dummy.matrix.decompose(
          this.dummy.position,
          this.dummy.quaternion,
          this.dummy.scale,
        );

        // Float up slowly
        this.dummy.position.z += dt * 5;
        // Shrink
        this.dummy.scale.multiplyScalar(1 - dt * 2);

        this.dummy.updateMatrix();
        this.particles.setMatrixAt(i, this.dummy.matrix);
        needsUpdate = true;
      } else if (this.ages[i] >= 1.0 && this.ages[i] < 999) {
        this.dummy.position.set(9999, 9999, 9999);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.particles.setMatrixAt(i, this.dummy.matrix);
        this.ages[i] = 999;
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      this.particles.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose() {
    this.particles.geometry.dispose();
    (this.particles.material as THREE.Material).dispose();
    this.particles.removeFromParent();
  }
}
