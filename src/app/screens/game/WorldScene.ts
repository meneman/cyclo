import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

import {
  HIT_RADIUS,
  PLAYER_RADIUS,
  SWING_ANIMATION_DURATION_SECONDS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../../../shared/constants";
import { hitPoint, predictedLanding } from "../../../../shared/ballPhysics";
import type { PlayerState } from "../../../../shared/types";
import type { RenderBall } from "../../../net/BallPredictor";

import type { CharacterTemplate } from "./CharacterRoster";
import {
  characterForPlayerId,
  loadCharacterTemplates,
  pickClip,
} from "./CharacterRoster";
import {
  createGolfBall,
  disposeGolfBallResources,
  updateGolfBallVisual,
} from "./GolfBall";
import { attachGolfClub, calculateGolfSwingPose } from "./GolfClub";

/** World-to-screen scale — how many screen px one world unit covers */
const CAMERA_ZOOM = 3;
/** World units covered by one repeating tile of the ground texture */
const FIELD_TILE_SIZE = 80;
const FIELD_TEXTURE_URL = `${import.meta.env.BASE_URL}textures/grass.png`;
/**
 * Multiplied onto the grass texture — slightly below white with green kept
 * highest, so the field reads a little darker and richer green.
 */
const FIELD_TINT = 0xb8ccb0;
/** Out-of-bounds backdrop around the field */
const BACKDROP_COLOR = 0x0b1020;
/** Fallback marker color when a character template fails to load */
const DOT_COLOR = 0x000000;
/**
 * Character scale: measured model height is ~480 units (male 482.7, female
 * 463.6), so 0.06x puts them at roughly the old 28-unit marker footprint.
 * (A scale of 15x here once put the camera inside the mesh: invisible
 * characters plus near-plane clipping streaks.)
 */
const CHARACTER_SCALE = 0.06;
/**
 * Camera elevation above the XY playfield: models stand ~29 units tall
 * (480 raw units * CHARACTER_SCALE 0.06), so 50u keeps the camera safely
 * above heads with orthographic near-plane margin.
 */
const CAMERA_HEIGHT = 50;
/**
 * Tips the Y-up characters forward so they stand toward the camera in the
 * top-down XY-plane scene: model-up lands on scene +Z, model-forward (+Z)
 * lands on scene -Y (screen-down/south).
 */
const STAND_UPRIGHT_X = Math.PI / 2;
/**
 * Extra yaw applied on top of the travel heading. Zero is derived correct
 * for +Z-facing models — verify visually, and adjust here (not at the call
 * site) if characters strafe or moonwalk.
 */
const FACING_OFFSET = 0;
/** Facing snaps to 8 headings (the 8 movement vectors), in radians */
const HEADING_STEP = Math.PI / 4;

/**
 * Snaps a world-space travel direction to the nearest of the 8 movement
 * headings, as a scene yaw. Yaw a (rotation about scene Z) maps model
 * forward (0,-1) to (sin a, -cos a); matching heading (dx, dy) gives
 * a = atan2(dx, dy), quantized to HEADING_STEP. Pure so it stays
 * unit-testable without a renderer.
 */
export function yawForDirection(dx: number, dy: number): number {
  return (
    Math.round(Math.atan2(dx, dy) / HEADING_STEP) * HEADING_STEP + FACING_OFFSET
  );
}
/** Per-frame world-unit displacement above which a player counts as walking */
const WALK_THRESHOLD = 0.5;

interface PlayerView {
  yaw: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  idle: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  walking: boolean;
  lastX: number;
  lastY: number;
  body: THREE.Object3D | null;
  club: THREE.Object3D | null;
  charge: number;
  swingActive: boolean;
  swingElapsed: number;
  swingPower: number;
  lastSwingSeq: number;
}

/**
 * Three.js top-down world view: a blank green field with one animated
 * character per player (random roster pick, deterministic per player id),
 * rendered on a canvas stacked behind the transparent Pixi overlay (HUD,
 * chat, name labels). The Pixi canvas keeps all pointer input; this canvas
 * only needs keyboard input, which is window-level.
 *
 * World coords use the shared sim convention (x right, y DOWN). Three.js NDC
 * has y UP, so every world y is negated once on the way into the scene —
 * camera, characters, and dots alike — keeping screen-down == world-+y.
 */
export class WorldScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly players = new Map<string, PlayerView>();
  private readonly pendingSpawns = new Map<
    string,
    { x: number; y: number; charIndex: number }
  >();
  private templates: (CharacterTemplate | null)[] | null = null;
  private readonly dotGeometry = new THREE.CircleGeometry(PLAYER_RADIUS, 32);
  private readonly dotMaterial = new THREE.MeshBasicMaterial({
    color: DOT_COLOR,
  });
  private readonly fieldGeometry = new THREE.PlaneGeometry(
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
  private readonly fieldTexture: THREE.Texture;
  private readonly fieldMaterial: THREE.MeshStandardMaterial;
  private readonly balls = new Map<string, THREE.Group>();
  private readonly rangeIndicator: THREE.Mesh;
  private readonly rangeMaterial: THREE.MeshBasicMaterial;
  private readonly rangeGeometry: THREE.RingGeometry;
  private readonly landingMarker: THREE.Group;

  private viewWidth = 1;
  private viewHeight = 1;
  private focusX = WORLD_WIDTH / 2;
  private focusY = WORLD_HEIGHT / 2;
  private frames = 0;
  private readonly unknownMoveIds = new Set<string>();

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
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2b1a, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(200, -100, 300);
    this.scene.add(sun);

    this.fieldTexture = new THREE.TextureLoader().load(FIELD_TEXTURE_URL);
    this.fieldTexture.wrapS = THREE.RepeatWrapping;
    this.fieldTexture.wrapT = THREE.RepeatWrapping;
    this.fieldTexture.repeat.set(
      WORLD_WIDTH / FIELD_TILE_SIZE,
      WORLD_HEIGHT / FIELD_TILE_SIZE,
    );
    this.fieldMaterial = new THREE.MeshStandardMaterial({
      map: this.fieldTexture,
      color: FIELD_TINT,
      roughness: 0.9,
      metalness: 0.0,
    });

    const field = new THREE.Mesh(this.fieldGeometry, this.fieldMaterial);
    field.position.set(WORLD_WIDTH / 2, -WORLD_HEIGHT / 2, -1);
    this.scene.add(field);

    this.rangeGeometry = new THREE.RingGeometry(
      HIT_RADIUS - 0.25,
      HIT_RADIUS + 0.25,
      32,
    );
    this.rangeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.rangeIndicator = new THREE.Mesh(
      this.rangeGeometry,
      this.rangeMaterial,
    );
    this.rangeIndicator.name = "RangeIndicator";
    this.rangeIndicator.position.z = 0.03;
    this.rangeIndicator.visible = false;
    this.scene.add(this.rangeIndicator);

    this.landingMarker = new THREE.Group();
    this.landingMarker.name = "LandingMarker";
    const crossMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const barH = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.8), crossMat);
    const barV = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 6), crossMat);
    this.landingMarker.add(barH, barV);
    this.landingMarker.position.z = 0.03;
    this.landingMarker.visible = false;
    this.scene.add(this.landingMarker);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.updateCamera(this.focusX, this.focusY);
    console.info(
      `[cyclo:scene] created: field ${WORLD_WIDTH}x${WORLD_HEIGHT}, camera near=${this.camera.near} far=${this.camera.far} z=${this.camera.position.z} zoom=${CAMERA_ZOOM} charScale=${CHARACTER_SCALE}, waiting for character templates`,
    );

    void loadCharacterTemplates().then((templates) => {
      this.templates = templates;
      const loaded = templates.filter((t) => t !== null).length;
      console.info(
        `[cyclo:scene] templates ready: ${loaded}/${templates.length} loaded, flushing ${this.pendingSpawns.size} queued spawns`,
      );
      templates.forEach((template, index) => {
        if (!template) {
          console.warn(
            `[cyclo:scene] template ${index} failed to load, those players fall back to dots`,
          );
          return;
        }
        const height = new THREE.Box3()
          .setFromObject(template.scene)
          .getSize(new THREE.Vector3()).y;
        const scaledHeight = height * CHARACTER_SCALE;
        console.info(
          `[cyclo:scene] template loaded: ${template.id} (${template.clips.length} clips [${template.clips.map((c) => c.name).join(", ")}], raw height ${height.toFixed(1)}u -> scaled ${scaledHeight.toFixed(1)}u vs camera z=${this.camera.position.z})`,
        );
        if (scaledHeight > this.camera.position.z) {
          console.warn(
            `[cyclo:scene] ${template.id} scaled height ${scaledHeight.toFixed(1)}u exceeds camera z=${this.camera.position.z} — camera sits INSIDE the mesh, expect near-plane clipping flashes`,
          );
        }
      });
      for (const [id, spawn] of this.pendingSpawns) {
        this.instantiate(id, spawn.x, spawn.y, spawn.charIndex);
      }
      this.pendingSpawns.clear();
    });
  }

  public setSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    console.info(
      `[cyclo:scene] size ${width}x${height}, frustum ${(width / CAMERA_ZOOM).toFixed(0)}x${(height / CAMERA_ZOOM).toFixed(0)} world units`,
    );
    this.renderer.setSize(width, height);
    this.camera.left = -width / 2 / CAMERA_ZOOM;
    this.camera.right = width / 2 / CAMERA_ZOOM;
    this.camera.top = height / 2 / CAMERA_ZOOM;
    this.camera.bottom = -height / 2 / CAMERA_ZOOM;
    this.camera.updateProjectionMatrix();
  }

  public spawn(id: string, x: number, y: number): void {
    if (this.players.has(id) || this.pendingSpawns.has(id)) {
      console.debug(`[cyclo:scene] spawn ${id} ignored (already known)`);
      return;
    }
    const charIndex = characterForPlayerId(id);
    console.debug(
      `[cyclo:scene] spawn ${id} at (${x.toFixed(0)}, ${y.toFixed(0)}) charIndex=${charIndex} templates=${this.templates ? "ready" : "loading"}`,
    );
    if (!this.templates) {
      this.pendingSpawns.set(id, { x, y, charIndex });
      console.info(`[cyclo:scene] spawn queued for ${id} (templates loading)`);
      return;
    }
    this.instantiate(id, x, y, charIndex);
  }

  public move(
    id: string,
    x: number,
    y: number,
    isWalking?: boolean,
    facingX?: number,
    facingY?: number,
  ): void {
    const view = this.players.get(id);
    if (!view) {
      const pending = this.pendingSpawns.get(id);
      if (pending) {
        pending.x = x;
        pending.y = y;
      } else if (!this.unknownMoveIds.has(id)) {
        this.unknownMoveIds.add(id);
        console.warn(
          `[cyclo:scene] move for unknown player ${id} (no view, not queued) — spawn likely missed`,
        );
      }
      return;
    }
    this.unknownMoveIds.delete(id);
    const dx = x - view.lastX;
    const dy = y - view.lastY;
    view.yaw.position.set(x, -y, 0);

    // Rotation: prefer authoritative facing vector, fall back to delta movement
    if (facingX !== undefined && facingY !== undefined) {
      if (Math.hypot(facingX, facingY) > 0.01) {
        view.yaw.rotation.z = yawForDirection(facingX, facingY);
      }
    } else if (Math.hypot(dx, dy) > 0.01) {
      view.yaw.rotation.z = yawForDirection(dx, dy);
    }

    const walking =
      (isWalking !== undefined
        ? isWalking
        : Math.hypot(dx, dy) > WALK_THRESHOLD) &&
      view.charge === 0 &&
      !view.swingActive;

    if (walking) {
      this.setWalking(view, true);
    } else {
      this.setWalking(view, false);
    }
    view.lastX = x;
    view.lastY = y;
  }

  public syncBalls(renderBalls: RenderBall[]): void {
    const alive = new Set<string>();
    for (const b of renderBalls) {
      alive.add(b.id);
      let group = this.balls.get(b.id);
      if (!group) {
        group = createGolfBall(b.color);
        this.scene.add(group);
        this.balls.set(b.id, group);
      }
      group.position.set(b.x, -b.y, 0);
      updateGolfBallVisual(group, b.z);
    }

    for (const [id, group] of this.balls) {
      if (!alive.has(id)) {
        this.scene.remove(group);
        this.balls.delete(id);
      }
    }
  }

  public updateLocalIndicators(
    player: PlayerState | null,
    hittableBallAvailable: boolean,
  ): void {
    if (!player) {
      this.rangeIndicator.visible = false;
      this.landingMarker.visible = false;
      return;
    }

    const hp = hitPoint(player);
    this.rangeIndicator.position.set(hp.x, -hp.y, 0.03);
    this.rangeIndicator.visible = true;
    if (hittableBallAvailable) {
      this.rangeMaterial.color.setHex(0x22c55e);
      this.rangeMaterial.opacity = 0.85;
    } else {
      this.rangeMaterial.color.setHex(0xffffff);
      this.rangeMaterial.opacity = 0.25;
    }

    if ((player.charge ?? 0) > 0) {
      const landing = predictedLanding(player, player.charge ?? 0);
      this.landingMarker.position.set(landing.x, -landing.y, 0.03);
      this.landingMarker.visible = true;
    } else {
      this.landingMarker.visible = false;
    }
  }

  /**
   * Updates a player's swing and charging state:
   * - charge: 0..1 power while holding Space
   * - swingPower: power of executed swing on release
   * - swingSeq: triggers a new swing animation when incremented
   * - dtSeconds: elapsed time this frame to advance the swing stroke
   */
  public setSwing(
    id: string,
    charge: number,
    swingPower: number,
    swingSeq: number,
    dtSeconds: number,
  ): void {
    const view = this.players.get(id);
    if (!view) return;

    if (swingSeq > view.lastSwingSeq && swingPower > 0) {
      view.lastSwingSeq = swingSeq;
      view.swingActive = true;
      view.swingElapsed = 0;
      view.swingPower = swingPower;
    }

    view.charge = charge;

    if (view.swingActive) {
      view.swingElapsed += dtSeconds;
      if (view.swingElapsed >= SWING_ANIMATION_DURATION_SECONDS) {
        view.swingActive = false;
        view.swingElapsed = 0;
      }
    }

    if (view.charge > 0 || view.swingActive) {
      this.setWalking(view, false);
    }

    const pose = calculateGolfSwingPose(
      view.charge,
      view.swingActive,
      view.swingElapsed,
      SWING_ANIMATION_DURATION_SECONDS,
      view.swingPower,
    );

    if (view.club) {
      view.club.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
    }

    if (view.body) {
      view.body.rotation.y = pose.bodyTwistY;
    }
  }

  public remove(id: string): void {
    const view = this.players.get(id);
    const wasPending = this.pendingSpawns.delete(id);
    console.debug(
      `[cyclo:scene] remove ${id} (view=${Boolean(view)}, queued=${wasPending})`,
    );
    this.unknownMoveIds.delete(id);
    if (!view) return;
    view.mixer?.stopAllAction();
    this.scene.remove(view.yaw);
    this.players.delete(id);
  }

  public clear(): void {
    for (const id of [...this.players.keys()]) this.remove(id);
    this.pendingSpawns.clear();
    for (const group of this.balls.values()) {
      this.scene.remove(group);
    }
    this.balls.clear();
    this.rangeIndicator.visible = false;
    this.landingMarker.visible = false;
  }

  /**
   * Advances animations, centers the follow-camera exactly on the focus
   * point, and renders. The focus is the predicted local player, so they
   * stay in the middle of their own viewport while the viewbox moves.
   */
  public render(focusX: number, focusY: number, dtSeconds: number): void {
    this.updateCamera(focusX, focusY);
    for (const view of this.players.values()) {
      view.mixer?.update(dtSeconds);
    }
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (this.frames === 1) {
      console.info(
        `[cyclo:scene] first frame rendered (${this.viewWidth}x${this.viewHeight}), ${this.players.size} chars, queued=${this.pendingSpawns.size}`,
      );
      if (this.players.size === 0 && this.pendingSpawns.size === 0) {
        console.warn(
          "[cyclo:scene] first frame has NO players and nothing queued — green-only screen expected until Welcome/spawn arrives",
        );
      }
      if (this.pendingSpawns.size > 0 && !this.templates) {
        console.warn(
          `[cyclo:scene] ${this.pendingSpawns.size} spawns still queued behind template loading on first frame`,
        );
      }
    } else if (this.frames % 300 === 0) {
      console.info(
        `[cyclo:scene] heartbeat: focus (${this.focusX.toFixed(0)}, ${this.focusY.toFixed(0)}), ${this.players.size} chars, queued=${this.pendingSpawns.size}, camera (${this.camera.position.x.toFixed(0)}, ${this.camera.position.y.toFixed(0)}, z=${this.camera.position.z})`,
      );
    }
  }

  /** Screen-space (Pixi overlay) position of a world point under the current camera */
  public project(x: number, y: number): { sx: number; sy: number } {
    return {
      sx: (x - this.focusX) * CAMERA_ZOOM + this.viewWidth / 2,
      sy: (y - this.focusY) * CAMERA_ZOOM + this.viewHeight / 2,
    };
  }

  public destroy(): void {
    console.info("[cyclo:scene] destroyed");
    this.clear();
    this.scene.clear();
    this.dotGeometry.dispose();
    this.dotMaterial.dispose();
    this.fieldGeometry.dispose();
    this.fieldMaterial.dispose();
    this.fieldTexture.dispose();
    this.rangeGeometry.dispose();
    this.rangeMaterial.dispose();
    for (const child of this.landingMarker.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    }
    disposeGolfBallResources();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    const pixiCanvas = document.querySelector("#pixi-container canvas");
    if (pixiCanvas instanceof HTMLElement) {
      pixiCanvas.style.position = "";
      pixiCanvas.style.zIndex = "";
    }
  }

  private instantiate(
    id: string,
    x: number,
    y: number,
    charIndex: number,
  ): void {
    const yaw = new THREE.Group();
    yaw.position.set(x, -y, 0);
    yaw.scale.setScalar(CHARACTER_SCALE);

    const template = this.templates?.[charIndex] ?? null;
    let mixer: THREE.AnimationMixer | null = null;
    let idle: THREE.AnimationAction | null = null;
    let walk: THREE.AnimationAction | null = null;
    let body: THREE.Object3D | null = null;
    let club: THREE.Object3D | null = null;
    if (template) {
      // Clone rebinds the skeleton so each player animates independently.
      body = cloneSkinned(template.scene);
      attachGolfClub(body);
      club = body.getObjectByName("GolfClub") ?? null;
      const stand = new THREE.Group();
      stand.rotation.x = STAND_UPRIGHT_X;
      stand.add(body);
      yaw.add(stand);
      mixer = new THREE.AnimationMixer(body);
      idle = this.action(mixer, template, "Idle", id);
      walk = this.action(mixer, template, "Walk", id);
      idle?.play();
      console.info(
        `[cyclo:scene] spawn ${id} as ${template.id} at (${x.toFixed(0)}, ${y.toFixed(0)}) scale=${CHARACTER_SCALE} idle=${Boolean(idle)} walk=${Boolean(walk)}`,
      );
    } else {
      yaw.add(new THREE.Mesh(this.dotGeometry, this.dotMaterial));
      const dotRadius = PLAYER_RADIUS * CHARACTER_SCALE;
      console.warn(
        `[cyclo:scene] spawn ${id} as fallback dot (no template for charIndex=${charIndex}); effective dot radius ${dotRadius.toFixed(2)}u — nearly invisible at zoom ${CAMERA_ZOOM}`,
      );
    }

    this.scene.add(yaw);
    this.players.set(id, {
      yaw,
      mixer,
      idle,
      walk,
      walking: false,
      lastX: x,
      lastY: y,
      body,
      club,
      charge: 0,
      swingActive: false,
      swingElapsed: 0,
      swingPower: 0,
      lastSwingSeq: 0,
    });
  }

  private action(
    mixer: THREE.AnimationMixer,
    template: CharacterTemplate,
    kind: string,
    playerId: string,
  ): THREE.AnimationAction | null {
    const clip = pickClip(template.clips, kind);
    if (!clip) {
      console.warn(
        `[cyclo:scene] ${playerId} (${template.id}): no ${kind} clip and no fallback — animations missing`,
      );
      return null;
    }
    if (!clip.name.endsWith(kind)) {
      console.warn(
        `[cyclo:scene] ${playerId} (${template.id}): no ${kind} clip, falling back to "${clip.name}"`,
      );
    }
    return mixer.clipAction(clip);
  }

  private setWalking(view: PlayerView, walking: boolean): void {
    if (view.walking === walking || !view.mixer) return;
    view.walking = walking;
    const from = walking ? view.idle : view.walk;
    const to = walking ? view.walk : view.idle;
    if (!to) return;
    to.reset().setEffectiveWeight(1).play();
    // Snappy transition when stopping (0.08s) so feet plant cleanly without sliding
    const blendDuration = walking ? 0.15 : 0.08;
    from?.crossFadeTo(to, blendDuration, false);
  }

  /**
   * The player stays in the middle of their own viewport at all times — the
   * camera follows the focus point exactly, with no edge clamping. Near the
   * field border the dark backdrop simply fills the out-of-field area.
   */
  private updateCamera(focusX: number, focusY: number): void {
    this.focusX = focusX;
    this.focusY = focusY;
    this.camera.position.set(this.focusX, -this.focusY, CAMERA_HEIGHT);
    this.camera.lookAt(this.focusX, -this.focusY, 0);
  }
}
