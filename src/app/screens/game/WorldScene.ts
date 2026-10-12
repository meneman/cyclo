import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

import {
  HIT_RADIUS,
  ITEM_PICKUP_RADIUS,
  PLAYER_RADIUS,
  SWING_ANIMATION_DURATION_SECONDS,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../../../shared/constants";
import { hitPoint, predictedLanding } from "../../../../shared/ballPhysics";
import { getItem, type EffectiveStats } from "../../../../shared/items";

import type {
  PlayerState,
  HoleState,
  ItemPickupState,
} from "../../../../shared/types";
import type { RenderBall } from "../../../net/BallPredictor";

import type { CharacterTemplate } from "./CharacterRoster";
import {
  characterForPlayerId,
  getSharedToonGradient,
  loadCharacterTemplates,
  pickClip,
} from "./CharacterRoster";
import {
  createGolfBall,
  disposeGolfBallResources,
  setGolfBallColor,
  updateGolfBallVisual,
} from "./GolfBall";
import { attachGolfClub, calculateGolfSwingPose } from "./GolfClub";
import {
  BLOOD_STAIN_ELEVATION,
  createBloodStain,
  disposeBloodStain,
  disposeBloodStainResources,
} from "./BloodStain";

/** World-to-screen scale — how many screen px one world unit covers (1920 / 640 = 3) */
const CAMERA_ZOOM = 3;
/** World units covered by one repeating tile of the ground texture */
const FIELD_TILE_SIZE = 75;

export interface CourtTheme {
  /** Ground base tint, multiplied by fieldTextureUrl */
  roughTint: number;
  /** Out-of-bounds backdrop around the field */
  backdrop: number;
  /** Ground detail texture */
  fieldTextureUrl: string;
  /** Cool dimmed sun for dark themes, full warm sun for classic */
  sunIntensity: number;
  sunColor: number;
  hemiIntensity: number;
  hemiSkyColor?: number;
  hemiGroundColor: number;
}

export const COURT_THEMES = {
  /** Vibrant cel-shaded cartoon field with low-poly faceted turf and sunny warmth */
  cartoon: {
    roughTint: 0x48c438,
    backdrop: 0x091322,
    fieldTextureUrl: `${import.meta.env.BASE_URL}textures/grass_faceted.png`,
    sunIntensity: 2.0,
    sunColor: 0xfff6dd,
    hemiIntensity: 1.1,
    hemiSkyColor: 0xcfe6ff,
    hemiGroundColor: 0x22551a,
  },
  /** Rocky terrain — natural rocky ground using the 4K texture set */
  rockyTerrain: {
    roughTint: 0xffffff,
    backdrop: 0x0b1020,
    fieldTextureUrl: `${import.meta.env.BASE_URL}textures/rocky_terrain_02/textures/rocky_terrain_02_diff_4k.jpg`,
    sunIntensity: 1.5,
    sunColor: 0xffffff,
    hemiIntensity: 1.0,
    hemiGroundColor: 0x1a2b1a,
  },
  /** Original bright daytime look */
  classic: {
    roughTint: 0x486b3e,
    backdrop: 0x0b1020,
    fieldTextureUrl: `${import.meta.env.BASE_URL}textures/rocky_terrain_02/textures/rocky_terrain_02_diff_4k.jpg`,
    sunIntensity: 1.5,
    sunColor: 0xffffff,
    hemiIntensity: 1.0,
    hemiGroundColor: 0x1a2b1a,
  },
  /** Variant A — darker court */
  midnightMoss: {
    roughTint: 0x1f3326,
    backdrop: 0x06090c,
    fieldTextureUrl: `${import.meta.env.BASE_URL}textures/rocky_terrain_02/textures/rocky_terrain_02_diff_4k.jpg`,
    sunIntensity: 1.0,
    sunColor: 0xdfe8ff,
    hemiIntensity: 0.55,
    hemiGroundColor: 0x0e1512,
  },
  /** Legacy grass texture look */
  classicGrass: {
    roughTint: 0x486b3e,
    backdrop: 0x0b1020,
    fieldTextureUrl: `${import.meta.env.BASE_URL}textures/grass.png`,
    sunIntensity: 1.5,
    sunColor: 0xffffff,
    hemiIntensity: 1.0,
    hemiGroundColor: 0x1a2b1a,
  },
} satisfies Record<string, CourtTheme>;

export type CourtThemeName = keyof typeof COURT_THEMES;

/** Active ground and lighting theme */
export const ACTIVE_COURT_THEME: CourtThemeName = "cartoon";

const THEME: CourtTheme = COURT_THEMES[ACTIVE_COURT_THEME];
/** Fallback marker color when a character template fails to load */
const DOT_COLOR = 0x000000;
/**
 * Character scale: measured model height is ~480 units (male 482.7, female
 * 463.6), so 0.06x puts them at roughly the old 28-unit marker footprint.
 * (A scale of 15x here once put the camera inside the mesh: invisible
 * characters plus near-plane clipping streaks.)
 */
const CHARACTER_SCALE = 0.06;
/** Camera tilt angle from vertical in radians (40° tilt = 50° pitch from the ground) */
export const CAMERA_TILT_ANGLE = (40 * Math.PI) / 180;
/** Distance along the camera viewing axis to the ground focus point */
export const CAMERA_DISTANCE = 300;
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

/**
 * Returns continuous exact scene yaw for travel/aim direction (dx, dy).
 * Pure so it stays unit-testable without a renderer.
 */
export function yawForDirection(dx: number, dy: number): number {
  return Math.atan2(dx, dy) + FACING_OFFSET;
}

/**
 * Height of arena lamps above the ground, in world units. Deliberately
 * low next to the ~28u characters so shadows stretch toward the edges.
 */
export const LIGHT_HEIGHT = 60;
export const CENTRAL_LIGHT_HEIGHT = LIGHT_HEIGHT;
/** Warm tint for the arena lamps */
export const LIGHT_COLOR = 0xffe0b3;
export const CENTRAL_LIGHT_COLOR = LIGHT_COLOR;
/** Arena lamp brightness per light (decay=1 falloff, see constructor) */
export const LIGHT_INTENSITY = 25;
export const CENTRAL_LIGHT_INTENSITY = LIGHT_INTENSITY;

/** Positions for the left and right arena lights */
export const LIGHT_LEFT_X = WORLD_WIDTH * 0.25;
export const LIGHT_RIGHT_X = WORLD_WIDTH * 0.75;
export const LIGHT_Y = WORLD_HEIGHT / 2;

/** Warm tint for the visible pool of light on the ground under each lamp */
export const LIGHT_POOL_COLOR = 0xffdf9e;
/** Radius of each visible light pool in world units */
export const LIGHT_POOL_RADIUS = 200;
/** Peak brightness of each light pool (additive, fades to the edges) */
export const LIGHT_POOL_OPACITY = 0.45;
/** Pool sits above terrain but below shadows/indicators so both read */
const LIGHT_POOL_ELEVATION = 0.015;
/** Ground elevation of player shadows: above field/terrain, below indicators */
const SHADOW_ELEVATION = 0.02;
/** Shadow length directly under the lamp (short under-foot blob) */
const SHADOW_BASE_LENGTH = 18;
/** Extra shadow length per (distance-from-center / light-height) unit */
const SHADOW_LENGTH_PER_HEIGHT = 4;
/** Clamp so corner shadows stay readable in team fights */
const SHADOW_MAX_LENGTH = 100;
/** Shadow width across the outward direction */
const SHADOW_WIDTH = 13;
/** Shadow center offset per (distance-from-center / light-height) unit */
const SHADOW_OFFSET_FACTOR = 3;
/** Shadow opacity under the lamp, fading out to the edges */
const SHADOW_CENTER_OPACITY = 0.42;
const SHADOW_EDGE_OPACITY = 0.28;

/**
 * Builds a stylized comic-book radial alpha texture (solid disk with a crisp
 * falloff edge) so blob shadows render as defined cartoon cel-shadow ellipses.
 */
function makeRadialShadowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.8, "rgba(255,255,255,0.92)");
  gradient.addColorStop(0.92, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Projected blob shadow for one player: offset/scales a ground ellipse. */
export interface PlayerShadow {
  /** World-unit offset from the player's feet, away from map center */
  offsetX: number;
  offsetY: number;
  /** Long axis of the ellipse, pointing away from map center */
  length: number;
  width: number;
  /** Scene rotation (world y is negated in the scene) for the long axis */
  rotationZ: number;
  opacity: number;
}

/**
 * Maps a player position to its shadow under the central lamp: the offset
 * points radially away from the map center and both offset and length grow
 * with distance from center and shrink as the lamp hangs higher. Pure so it
 * stays unit-testable without a renderer.
 */
export function shadowForPlayer(
  x: number,
  y: number,
  lightHeight: number = CENTRAL_LIGHT_HEIGHT,
): PlayerShadow {
  const dx = x - WORLD_WIDTH / 2;
  const dy = y - WORLD_HEIGHT / 2;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6 || lightHeight <= 0) {
    return {
      offsetX: 0,
      offsetY: 0,
      length: SHADOW_BASE_LENGTH,
      width: SHADOW_WIDTH,
      rotationZ: 0,
      opacity: SHADOW_CENTER_OPACITY,
    };
  }
  const spread = dist / lightHeight;
  const offset = SHADOW_OFFSET_FACTOR * spread;
  const maxDist = Math.hypot(WORLD_WIDTH, WORLD_HEIGHT) / 2;
  return {
    offsetX: (dx / dist) * offset,
    offsetY: (dy / dist) * offset,
    length: Math.min(
      SHADOW_BASE_LENGTH + SHADOW_LENGTH_PER_HEIGHT * spread,
      SHADOW_MAX_LENGTH,
    ),
    width: SHADOW_WIDTH,
    rotationZ: Math.atan2(-dy, dx),
    opacity:
      SHADOW_CENTER_OPACITY -
      (SHADOW_CENTER_OPACITY - SHADOW_EDGE_OPACITY) *
        Math.min(dist / maxDist, 1),
  };
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
  bloodStain: THREE.Group;
  knockedDown: boolean;
  shadow: THREE.Mesh;
  baseScale: number;
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
    { x: number; y: number; charIndex: number; color?: number }
  >();
  private templates: (CharacterTemplate | null)[] | null = null;
  private readonly dotGeometry = new THREE.CircleGeometry(PLAYER_RADIUS, 32);
  private readonly dotMaterial = new THREE.MeshBasicMaterial({
    color: DOT_COLOR,
  });
  /** Unit plane stretched per player into a radial blob shadow */
  private readonly shadowGeometry = new THREE.PlaneGeometry(1, 1);
  /** Soft radial alpha map shared by all blob shadows */
  private readonly shadowTexture: THREE.Texture;
  /** Warm pools of light on the ground under the left and right lamps */
  private readonly lightPoolLeft: THREE.Mesh;
  private readonly lightPoolRight: THREE.Mesh;
  private readonly fieldGeometry = new THREE.PlaneGeometry(
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
  private readonly fieldTexture: THREE.Texture;
  private readonly fieldMaterial: THREE.MeshToonMaterial;

  private readonly balls = new Map<string, THREE.Group>();
  private readonly holeMeshes = new Map<string, THREE.Mesh>();
  private readonly pickupMeshes = new Map<string, THREE.Mesh>();
  /** Shared geometry for circular pickup discs */
  private readonly pickupGeometry = new THREE.CircleGeometry(
    ITEM_PICKUP_RADIUS,
    32,
  );
  private readonly rangeIndicator: THREE.Mesh;
  private readonly rangeMaterial: THREE.MeshBasicMaterial;
  private readonly rangeGeometry: THREE.RingGeometry;
  private readonly landingMarker: THREE.Group;

  private viewWidth = VIEWBOX_WIDTH;
  private viewHeight = VIEWBOX_HEIGHT;
  private focusX = WORLD_WIDTH / 2;
  private focusY = WORLD_HEIGHT / 2;
  private frames = 0;
  private readonly unknownMoveIds = new Set<string>();
  private readonly projectVector = new THREE.Vector3();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.shadowTexture = makeRadialShadowTexture();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    const mountContainer =
      document.getElementById("three-container") ??
      document.getElementById("viewbox") ??
      document.body;
    mountContainer.appendChild(canvas);

    this.scene.background = new THREE.Color(THEME.backdrop);
    this.scene.add(
      new THREE.HemisphereLight(
        THEME.hemiSkyColor ?? 0xffffff,
        THEME.hemiGroundColor,
        THEME.hemiIntensity,
      ),
    );
    // Primary key sun from top-right creates strong directional light for cel-shading banding
    const sunRight = new THREE.DirectionalLight(
      THEME.sunColor,
      THEME.sunIntensity * 1.1,
    );
    sunRight.position.set(220, -120, 280);
    this.scene.add(sunRight);

    // Soft sky fill from the left prevents pitch-black unlit areas while preserving cel-shading
    const sunLeft = new THREE.DirectionalLight(
      THEME.hemiSkyColor ?? 0xdbeafe,
      THEME.sunIntensity * 0.25,
    );
    sunLeft.position.set(-200, -80, 220);
    this.scene.add(sunLeft);

    // Two arena lamps (one left, one right): warm falloff illuminating both sides of the arena.
    // decay=1 keeps the gradient gentle across distances.
    const lightLeft = new THREE.PointLight(LIGHT_COLOR, LIGHT_INTENSITY, 0, 1);
    lightLeft.position.set(LIGHT_LEFT_X, -LIGHT_Y, LIGHT_HEIGHT);
    this.scene.add(lightLeft);

    const lightRight = new THREE.PointLight(LIGHT_COLOR, LIGHT_INTENSITY, 0, 1);
    lightRight.position.set(LIGHT_RIGHT_X, -LIGHT_Y, LIGHT_HEIGHT);
    this.scene.add(lightRight);

    // Visible pools of light on the ground under the left and right lamps:
    // soft radial texture, additively blended so both halves read warm and bright.
    const poolGeometry = new THREE.PlaneGeometry(
      LIGHT_POOL_RADIUS * 2,
      LIGHT_POOL_RADIUS * 2,
    );
    const poolMaterial = new THREE.MeshBasicMaterial({
      color: LIGHT_POOL_COLOR,
      map: this.shadowTexture,
      transparent: true,
      opacity: LIGHT_POOL_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.lightPoolLeft = new THREE.Mesh(poolGeometry, poolMaterial);
    this.lightPoolLeft.position.set(
      LIGHT_LEFT_X,
      -LIGHT_Y,
      LIGHT_POOL_ELEVATION,
    );
    this.lightPoolLeft.renderOrder = 0;
    this.scene.add(this.lightPoolLeft);

    this.lightPoolRight = new THREE.Mesh(poolGeometry, poolMaterial);
    this.lightPoolRight.position.set(
      LIGHT_RIGHT_X,
      -LIGHT_Y,
      LIGHT_POOL_ELEVATION,
    );
    this.lightPoolRight.renderOrder = 0;
    this.scene.add(this.lightPoolRight);

    this.fieldTexture = new THREE.TextureLoader().load(THEME.fieldTextureUrl);
    this.fieldTexture.colorSpace = THREE.SRGBColorSpace;
    this.fieldTexture.wrapS = THREE.RepeatWrapping;
    this.fieldTexture.wrapT = THREE.RepeatWrapping;
    this.fieldTexture.repeat.set(
      WORLD_WIDTH / FIELD_TILE_SIZE,
      WORLD_HEIGHT / FIELD_TILE_SIZE,
    );
    this.fieldMaterial = new THREE.MeshToonMaterial({
      map: this.fieldTexture,
      color: THEME.roughTint,
      gradientMap: getSharedToonGradient(),
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

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
    this.camera.up.set(0, 0, 1);
    this.updateCamera();
    console.info(
      `[golfi:scene] created: field ${WORLD_WIDTH}x${WORLD_HEIGHT}, camera near=${this.camera.near} far=${this.camera.far} z=${this.camera.position.z} zoom=${CAMERA_ZOOM} charScale=${CHARACTER_SCALE}, waiting for character templates`,
    );

    void loadCharacterTemplates().then((templates) => {
      this.templates = templates;
      const loaded = templates.filter((t) => t !== null).length;
      console.info(
        `[golfi:scene] templates ready: ${loaded}/${templates.length} loaded, flushing ${this.pendingSpawns.size} queued spawns`,
      );
      templates.forEach((template, index) => {
        if (!template) {
          console.warn(
            `[golfi:scene] template ${index} failed to load, those players fall back to dots`,
          );
          return;
        }
        const height = new THREE.Box3()
          .setFromObject(template.scene)
          .getSize(new THREE.Vector3()).y;
        const baseScale = template.scale ?? CHARACTER_SCALE;
        const scaledHeight = height * baseScale;
        console.info(
          `[golfi:scene] template loaded: ${template.id} (${template.clips.length} clips [${template.clips.map((c) => c.name).join(", ")}], raw height ${height.toFixed(1)}u -> scaled ${scaledHeight.toFixed(1)}u vs camera z=${this.camera.position.z})`,
        );
        if (scaledHeight > this.camera.position.z) {
          console.warn(
            `[golfi:scene] ${template.id} scaled height ${scaledHeight.toFixed(1)}u exceeds camera z=${this.camera.position.z} — camera sits INSIDE the mesh, expect near-plane clipping flashes`,
          );
        }
      });
      for (const [id, spawn] of this.pendingSpawns) {
        this.instantiate(id, spawn.x, spawn.y, spawn.charIndex, spawn.color);
      }
      this.pendingSpawns.clear();
    });
  }

  public setSize(
    width: number = VIEWBOX_WIDTH,
    height: number = VIEWBOX_HEIGHT,
  ): void {
    this.viewWidth = width;
    this.viewHeight = height;
    console.info(
      `[golfi:scene] size ${width}x${height}, frustum ${(width / CAMERA_ZOOM).toFixed(0)}x${(height / CAMERA_ZOOM).toFixed(0)} world units`,
    );
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.left = -width / 2 / CAMERA_ZOOM;
    this.camera.right = width / 2 / CAMERA_ZOOM;
    this.camera.top = height / 2 / CAMERA_ZOOM;
    this.camera.bottom = -height / 2 / CAMERA_ZOOM;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
  }

  public spawn(id: string, x: number, y: number, color?: number): void {
    if (this.players.has(id) || this.pendingSpawns.has(id)) {
      console.debug(`[golfi:scene] spawn ${id} ignored (already known)`);
      return;
    }
    const charIndex = characterForPlayerId(id);
    console.debug(
      `[golfi:scene] spawn ${id} at (${x.toFixed(0)}, ${y.toFixed(0)}) charIndex=${charIndex} templates=${this.templates ? "ready" : "loading"}`,
    );
    if (!this.templates) {
      this.pendingSpawns.set(id, { x, y, charIndex, color });
      console.info(`[golfi:scene] spawn queued for ${id} (templates loading)`);
      return;
    }
    this.instantiate(id, x, y, charIndex, color);
  }

  public move(
    id: string,
    x: number,
    y: number,
    isWalking?: boolean,
    facingX?: number,
    facingY?: number,
    z?: number,
    playerScaleMult: number = 1,
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
          `[golfi:scene] move for unknown player ${id} (no view, not queued) — spawn likely missed`,
        );
      }
      return;
    }
    this.unknownMoveIds.delete(id);
    const dx = x - view.lastX;
    const dy = y - view.lastY;
    view.yaw.position.set(x, -y, z ?? 0);
    const clampedPlayerScale = Math.min(Math.max(playerScaleMult, 0.3), 5.0);
    view.yaw.scale.setScalar(view.baseScale * clampedPlayerScale);
    view.bloodStain.position.set(x, -y, BLOOD_STAIN_ELEVATION);
    this.updateShadow(view, x, y, clampedPlayerScale);

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
      } else {
        setGolfBallColor(group, b.color);
      }
      group.position.set(b.x, -b.y, 0);
      updateGolfBallVisual(group, b.z, b.radiusMult ?? 1);
    }

    for (const [id, group] of this.balls) {
      if (!alive.has(id)) {
        this.scene.remove(group);
        this.balls.delete(id);
      }
    }
  }

  public syncHoles(holeStates: HoleState[]): void {
    const alive = new Set<string>();
    for (const h of holeStates) {
      alive.add(h.id);
      let mesh = this.holeMeshes.get(h.id);
      if (!mesh) {
        const geom = new THREE.CircleGeometry(h.radius, 32);
        const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(h.x, -h.y, 0.01);
        this.scene.add(mesh);
        this.holeMeshes.set(h.id, mesh);
      } else {
        mesh.position.set(h.x, -h.y, 0.01);
      }
    }

    for (const [id, mesh] of this.holeMeshes) {
      if (!alive.has(id)) {
        this.scene.remove(mesh);
        this.holeMeshes.delete(id);
      }
    }
  }

  public syncPickups(pickups: ItemPickupState[] = []): void {
    const alive = new Set<string>();
    for (const p of pickups || []) {
      alive.add(p.id);
      let mesh = this.pickupMeshes.get(p.id);
      const color = getItem(p.itemId)?.color ?? 0xeab308;
      if (!mesh) {
        const material = new THREE.MeshBasicMaterial({ color });
        mesh = new THREE.Mesh(this.pickupGeometry, material);
        mesh.position.set(p.x, -p.y, 0.04);
        this.scene.add(mesh);
        this.pickupMeshes.set(p.id, mesh);
      } else {
        mesh.position.set(p.x, -p.y, 0.04);
        if (
          mesh.material instanceof THREE.MeshBasicMaterial &&
          mesh.material.color.getHex() !== color
        ) {
          mesh.material.color.setHex(color);
        }
      }
    }

    for (const [id, mesh] of this.pickupMeshes) {
      if (!alive.has(id)) {
        this.scene.remove(mesh);
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
        this.pickupMeshes.delete(id);
      }
    }
  }

  public updateLocalIndicators(
    player: PlayerState | null,
    hittableBallAvailable: boolean,
    stats?: EffectiveStats,
  ): void {
    if (!player || (player.knockdownTimer ?? 0) > 0) {
      this.rangeIndicator.visible = false;
      this.landingMarker.visible = false;
      return;
    }

    const hp = hitPoint(player);
    this.rangeIndicator.position.set(hp.x, -hp.y, 0.03);
    const rangeScale = (HIT_RADIUS + (stats?.hitRadiusAdd ?? 0)) / HIT_RADIUS;
    this.rangeIndicator.scale.setScalar(rangeScale);
    this.rangeIndicator.visible = true;
    if (hittableBallAvailable) {
      this.rangeMaterial.color.setHex(0x22c55e);
      this.rangeMaterial.opacity = 0.85;
    } else {
      this.rangeMaterial.color.setHex(0xffffff);
      this.rangeMaterial.opacity = 0.25;
    }

    if ((player.charge ?? 0) > 0) {
      const landing = predictedLanding(
        player,
        player.charge ?? 0,
        undefined,
        stats,
      );
      this.landingMarker.position.set(landing.x, -landing.y, 0.03);
      this.landingMarker.visible = true;
    } else {
      this.landingMarker.visible = false;
    }
  }

  /** Toggles between character model and blood stain on ground */
  public setKnockdown(id: string, knockedDown: boolean): void {
    const view = this.players.get(id);
    if (!view) return;
    if (view.knockedDown === knockedDown) return;
    view.knockedDown = knockedDown;
    view.yaw.visible = !knockedDown;
    view.bloodStain.visible = knockedDown;
    view.shadow.visible = !knockedDown;
    if (knockedDown) {
      this.setWalking(view, false);
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
      `[golfi:scene] remove ${id} (view=${Boolean(view)}, queued=${wasPending})`,
    );
    this.unknownMoveIds.delete(id);
    if (!view) return;
    view.mixer?.stopAllAction();
    this.scene.remove(view.yaw);
    this.scene.remove(view.bloodStain);
    disposeBloodStain(view.bloodStain);
    this.scene.remove(view.shadow);
    (view.shadow.material as THREE.Material).dispose();
    this.players.delete(id);
  }

  public clear(): void {
    for (const id of [...this.players.keys()]) this.remove(id);
    this.pendingSpawns.clear();
    for (const group of this.balls.values()) {
      this.scene.remove(group);
    }
    this.balls.clear();
    for (const mesh of this.holeMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.holeMeshes.clear();
    for (const mesh of this.pickupMeshes.values()) {
      this.scene.remove(mesh);
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    }
    this.pickupMeshes.clear();
    this.rangeIndicator.visible = false;
    this.landingMarker.visible = false;
  }

  /**
   * Advances animations and renders the static world scene.
   * The camera stands still at the world center.
   */
  public render(_focusX: number, _focusY: number, dtSeconds: number): void {
    this.updateCamera();
    for (const view of this.players.values()) {
      view.mixer?.update(dtSeconds);
    }
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (this.frames === 1) {
      console.info(
        `[golfi:scene] first frame rendered (${this.viewWidth}x${this.viewHeight}), ${this.players.size} chars, queued=${this.pendingSpawns.size}`,
      );
      if (this.players.size === 0 && this.pendingSpawns.size === 0) {
        console.warn(
          "[golfi:scene] first frame has NO players and nothing queued — green-only screen expected until Welcome/spawn arrives",
        );
      }
      if (this.pendingSpawns.size > 0 && !this.templates) {
        console.warn(
          `[golfi:scene] ${this.pendingSpawns.size} spawns still queued behind template loading on first frame`,
        );
      }
    } else if (this.frames % 300 === 0) {
      console.info(
        `[golfi:scene] heartbeat: focus (${this.focusX.toFixed(0)}, ${this.focusY.toFixed(0)}), ${this.players.size} chars, queued=${this.pendingSpawns.size}, camera (${this.camera.position.x.toFixed(0)}, ${this.camera.position.y.toFixed(0)}, z=${this.camera.position.z})`,
      );
    }
  }

  /** Screen-space (Pixi overlay) position of a world point under the current camera */
  public project(
    x: number,
    y: number,
    z: number = 0,
  ): { sx: number; sy: number } {
    this.projectVector.set(x, -y, z);
    this.projectVector.project(this.camera);
    return {
      sx: ((this.projectVector.x + 1) / 2) * this.viewWidth,
      sy: ((-this.projectVector.y + 1) / 2) * this.viewHeight,
    };
  }

  public destroy(): void {
    console.info("[golfi:scene] destroyed");
    this.clear();
    this.scene.clear();
    this.dotGeometry.dispose();
    this.dotMaterial.dispose();
    this.shadowGeometry.dispose();
    this.shadowTexture.dispose();
    this.lightPoolLeft.geometry.dispose();
    (this.lightPoolLeft.material as THREE.Material).dispose();
    this.fieldGeometry.dispose();
    this.fieldMaterial.dispose();
    this.fieldTexture.dispose();
    this.pickupGeometry.dispose();
    this.rangeGeometry.dispose();
    this.rangeMaterial.dispose();
    for (const child of this.landingMarker.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    }
    disposeGolfBallResources();
    disposeBloodStainResources();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  public setColor(id: string, color: number): void {
    const view = this.players.get(id);
    if (!view || !view.body) return;
    view.body.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.material &&
        !child.name.endsWith("_Outline")
      ) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (let i = 0; i < materials.length; i++) {
          const mat = materials[i];
          if (mat && "name" in mat && mat.name === "Shirt") {
            if (!mat.userData.isCloned) {
              const cloned = mat.clone();
              cloned.userData.isCloned = true;
              if (Array.isArray(child.material)) {
                child.material[i] = cloned;
              } else {
                child.material = cloned;
              }
              (cloned as THREE.MeshToonMaterial).color.setHex(color);
            } else {
              (mat as THREE.MeshToonMaterial).color.setHex(color);
            }
          }
        }
      }
    });
  }

  private instantiate(
    id: string,
    x: number,
    y: number,
    charIndex: number,
    color?: number,
  ): void {
    const template = this.templates?.[charIndex] ?? null;
    const baseScale = template?.scale ?? CHARACTER_SCALE;

    const yaw = new THREE.Group();
    yaw.position.set(x, -y, 0);
    yaw.scale.setScalar(baseScale);

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
        `[golfi:scene] spawn ${id} as ${template.id} at (${x.toFixed(0)}, ${y.toFixed(0)}) scale=${baseScale} idle=${Boolean(idle)} walk=${Boolean(walk)}`,
      );
    } else {
      yaw.add(new THREE.Mesh(this.dotGeometry, this.dotMaterial));
      const dotRadius = PLAYER_RADIUS * baseScale;
      console.warn(
        `[golfi:scene] spawn ${id} as fallback dot (no template for charIndex=${charIndex}); effective dot radius ${dotRadius.toFixed(2)}u — nearly invisible at zoom ${CAMERA_ZOOM}`,
      );
    }

    this.scene.add(yaw);

    const bloodStain = createBloodStain();
    bloodStain.position.set(x, -y, BLOOD_STAIN_ELEVATION);
    bloodStain.visible = false;
    this.scene.add(bloodStain);

    const shadow = new THREE.Mesh(
      this.shadowGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        map: this.shadowTexture,
        transparent: true,
        opacity: SHADOW_CENTER_OPACITY,
        depthWrite: false,
      }),
    );
    shadow.renderOrder = 1;
    this.scene.add(shadow);

    const view: PlayerView = {
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
      bloodStain,
      knockedDown: false,
      shadow,
      baseScale,
    };
    this.players.set(id, view);
    this.updateShadow(view, x, y, 1);

    if (color !== undefined) {
      this.setColor(id, color);
    }
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
        `[golfi:scene] ${playerId} (${template.id}): no ${kind} clip and no fallback — animations missing`,
      );
      return null;
    }
    if (!clip.name.endsWith(kind)) {
      console.warn(
        `[golfi:scene] ${playerId} (${template.id}): no ${kind} clip, falling back to "${clip.name}"`,
      );
    }
    return mixer.clipAction(clip);
  }

  /** Positions/scales one player's blob shadow from the central lamp math */
  private updateShadow(
    view: PlayerView,
    x: number,
    y: number,
    scaleMult: number = 1,
  ): void {
    const s = shadowForPlayer(x, y);
    view.shadow.position.set(x + s.offsetX, -(y + s.offsetY), SHADOW_ELEVATION);
    view.shadow.rotation.z = s.rotationZ;
    view.shadow.scale.set(s.length * scaleMult, s.width * scaleMult, 1);
    (view.shadow.material as THREE.MeshBasicMaterial).opacity = s.opacity;
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
   * The camera stands still at the center of the world at all times.
   * The entire arena fits in the viewbox without panning or zooming.
   */
  private updateCamera(): void {
    this.focusX = WORLD_WIDTH / 2;
    this.focusY = WORLD_HEIGHT / 2;
    const camOffsetY = CAMERA_DISTANCE * Math.sin(CAMERA_TILT_ANGLE);
    const camHeight = CAMERA_DISTANCE * Math.cos(CAMERA_TILT_ANGLE);
    this.camera.position.set(this.focusX, -this.focusY - camOffsetY, camHeight);
    this.camera.lookAt(this.focusX, -this.focusY, 0);
    this.camera.updateMatrixWorld();
  }
}
