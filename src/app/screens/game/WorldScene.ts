import * as THREE from "three";

import {
  PLAYER_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../../../shared/constants";

/** World-to-screen scale — how many screen px one world unit covers */
const CAMERA_ZOOM = 3;
/** Blank green field */
const FIELD_COLOR = 0x2e9e4b;
/** Out-of-bounds backdrop around the field */
const BACKDROP_COLOR = 0x0b1020;
/** Player marker color — every player is a plain black dot */
const DOT_COLOR = 0x000000;

/**
 * Three.js top-down world view: a blank green field with one black dot per
 * player, rendered on a canvas stacked behind the transparent Pixi overlay
 * (HUD, chat, name labels). The Pixi canvas keeps all pointer input; this
 * canvas only needs keyboard input, which is window-level.
 *
 * World coords use the shared sim convention (x right, y DOWN). Three.js NDC
 * has y UP, so every world y is negated once on the way into the scene —
 * camera and dots alike — keeping screen-down == world-+y.
 */
export class WorldScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly dots = new Map<string, THREE.Mesh>();
  private readonly dotGeometry = new THREE.CircleGeometry(PLAYER_RADIUS, 32);
  private readonly dotMaterial = new THREE.MeshBasicMaterial({
    color: DOT_COLOR,
  });
  private readonly fieldGeometry = new THREE.PlaneGeometry(
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
  private readonly fieldMaterial = new THREE.MeshBasicMaterial({
    color: FIELD_COLOR,
  });

  private viewWidth = 1;
  private viewHeight = 1;
  private focusX = WORLD_WIDTH / 2;
  private focusY = WORLD_HEIGHT / 2;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.zIndex = "0";
    document.body.appendChild(canvas);

    // Lift the Pixi canvas above the Three.js canvas.
    const pixiCanvas = document.querySelector("#pixi-container canvas");
    if (pixiCanvas instanceof HTMLElement) {
      pixiCanvas.style.position = "relative";
      pixiCanvas.style.zIndex = "1";
    }

    this.scene.background = new THREE.Color(BACKDROP_COLOR);

    const field = new THREE.Mesh(this.fieldGeometry, this.fieldMaterial);
    field.position.set(WORLD_WIDTH / 2, -WORLD_HEIGHT / 2, -1);
    this.scene.add(field);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.updateCamera(this.focusX, this.focusY);
  }

  public setSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    this.renderer.setSize(width, height);
    this.camera.left = -width / 2 / CAMERA_ZOOM;
    this.camera.right = width / 2 / CAMERA_ZOOM;
    this.camera.top = height / 2 / CAMERA_ZOOM;
    this.camera.bottom = -height / 2 / CAMERA_ZOOM;
    this.camera.updateProjectionMatrix();
  }

  public spawn(id: string, x: number, y: number): void {
    if (this.dots.has(id)) return;
    const dot = new THREE.Mesh(this.dotGeometry, this.dotMaterial);
    dot.position.set(x, -y, 0);
    this.scene.add(dot);
    this.dots.set(id, dot);
  }

  public move(id: string, x: number, y: number): void {
    this.dots.get(id)?.position.set(x, -y, 0);
  }

  public remove(id: string): void {
    const dot = this.dots.get(id);
    if (!dot) return;
    this.scene.remove(dot);
    this.dots.delete(id);
  }

  public clear(): void {
    for (const dot of this.dots.values()) this.scene.remove(dot);
    this.dots.clear();
  }

  /**
   * Renders the scene with the camera clamped to the world bounds, following
   * (focusX, focusY) — the predicted local player. Centers on the world when
   * the viewport is larger than the field at the current zoom.
   */
  public render(focusX: number, focusY: number): void {
    this.updateCamera(focusX, focusY);
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen-space (Pixi overlay) position of a world point under the current camera */
  public project(x: number, y: number): { sx: number; sy: number } {
    return {
      sx: (x - this.focusX) * CAMERA_ZOOM + this.viewWidth / 2,
      sy: (y - this.focusY) * CAMERA_ZOOM + this.viewHeight / 2,
    };
  }

  public destroy(): void {
    this.clear();
    this.scene.clear();
    this.dotGeometry.dispose();
    this.dotMaterial.dispose();
    this.fieldGeometry.dispose();
    this.fieldMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    const pixiCanvas = document.querySelector("#pixi-container canvas");
    if (pixiCanvas instanceof HTMLElement) {
      pixiCanvas.style.position = "";
      pixiCanvas.style.zIndex = "";
    }
  }

  private updateCamera(focusX: number, focusY: number): void {
    const halfWorldW = this.viewWidth / 2 / CAMERA_ZOOM;
    const halfWorldH = this.viewHeight / 2 / CAMERA_ZOOM;
    this.focusX =
      WORLD_WIDTH <= halfWorldW * 2
        ? WORLD_WIDTH / 2
        : clamp(focusX, halfWorldW, WORLD_WIDTH - halfWorldW);
    this.focusY =
      WORLD_HEIGHT <= halfWorldH * 2
        ? WORLD_HEIGHT / 2
        : clamp(focusY, halfWorldH, WORLD_HEIGHT - halfWorldH);
    this.camera.position.set(this.focusX, -this.focusY, 10);
    this.camera.lookAt(this.focusX, -this.focusY, 0);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
