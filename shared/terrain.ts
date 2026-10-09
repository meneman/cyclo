import {
  BALL_BOUNCE_FRICTION,
  BALL_RESTITUTION,
  BALL_ROLL_DECEL,
} from "./constants";

export type TerrainType = "fairway" | "green" | "rough" | "bunker";

export interface TerrainProperties {
  type: TerrainType;
  name: string;
  /** Rolling deceleration in world units per second squared */
  rollDecel: number;
  /** Vertical restitution on bounce (fraction of vz retained) */
  restitution: number;
  /** Horizontal friction on bounce (fraction of vx/vy retained) */
  bounceFriction: number;
  /** Multiplier on shot carry distance when struck from this surface */
  carryMultiplier: number;
}

export const TERRAIN_PROPERTIES: Record<TerrainType, TerrainProperties> = {
  fairway: {
    type: "fairway",
    name: "Fairway",
    rollDecel: BALL_ROLL_DECEL, // 95 u/s² (arcade standard)
    restitution: BALL_RESTITUTION, // 0.55
    bounceFriction: BALL_BOUNCE_FRICTION, // 0.75
    carryMultiplier: 1.0,
  },
  green: {
    type: "green",
    name: "Green",
    rollDecel: 45, // Low deceleration, smooth roll
    restitution: 0.45,
    bounceFriction: 0.85,
    carryMultiplier: 1.0,
  },
  rough: {
    type: "rough",
    name: "Rough",
    rollDecel: 200, // Moderately high deceleration
    restitution: 0.35, // Solid bounce
    bounceFriction: 0.55,
    carryMultiplier: 0.75, // Reduced carry (25% penalty)
  },
  bunker: {
    type: "bunker",
    name: "Sand Bunker",
    rollDecel: 550, // High deceleration, ball stops quickly
    restitution: 0.12, // Low bounce, thud in sand
    bounceFriction: 0.25, // Sand absorbs forward momentum
    carryMultiplier: 0.6, // Blasting out of bunker penalty
  },
};

export const DEFAULT_TERRAIN: TerrainType = "rough";

export type TerrainShapeType = "rect" | "circle";

export interface BaseTerrainZone {
  id?: string;
  type: TerrainType;
}

export interface TerrainZoneCircle extends BaseTerrainZone {
  shape: "circle";
  x: number;
  y: number;
  radius: number;
}

export interface TerrainZoneRect extends BaseTerrainZone {
  shape: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number; // radians
}

export type TerrainZone = TerrainZoneCircle | TerrainZoneRect;

export function isPointInZone(
  px: number,
  py: number,
  zone: TerrainZone,
): boolean {
  if (zone.shape === "circle") {
    const dx = px - zone.x;
    const dy = py - zone.y;
    return dx * dx + dy * dy <= zone.radius * zone.radius;
  }
  if (zone.shape === "rect") {
    let dx = px - zone.x;
    let dy = py - zone.y;
    if (zone.rotation) {
      const cos = Math.cos(-zone.rotation);
      const sin = Math.sin(-zone.rotation);
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      dx = rx;
      dy = ry;
    }
    return Math.abs(dx) <= zone.width / 2 && Math.abs(dy) <= zone.height / 2;
  }
  return false;
}

/**
 * Course surface zones defined in shared sim coordinates (x right, y down).
 * Later entries in the list take precedence over earlier ones when sampled,
 * mirroring layered visual rendering (Fairway -> Green -> Bunker).
 */
export const COURSE_ZONES: TerrainZone[] = [
  // ── Central Clubhouse & Spawn Hub (1500, 1500) ──────────────────────────
  {
    id: "hub-fairway",
    type: "fairway",
    shape: "rect",
    x: 1500,
    y: 1500,
    width: 520,
    height: 520,
  },
  {
    id: "hub-practice-green",
    type: "green",
    shape: "circle",
    x: 1380,
    y: 1380,
    radius: 65,
  },
  {
    id: "hub-practice-bunker",
    type: "bunker",
    shape: "circle",
    x: 1620,
    y: 1620,
    radius: 40,
  },
  {
    id: "hub-rough-patch",
    type: "rough",
    shape: "circle",
    x: 1370,
    y: 1620,
    radius: 45,
  },

  // ── Hole 1: South Fairway & Green ───────────────────────────────────────
  {
    id: "h1-fairway",
    type: "fairway",
    shape: "rect",
    x: 1500,
    y: 2050,
    width: 380,
    height: 700,
  },
  {
    id: "h1-fairway-bunker",
    type: "bunker",
    shape: "circle",
    x: 1640,
    y: 2000,
    radius: 42,
  },
  {
    id: "h1-green",
    type: "green",
    shape: "circle",
    x: 1500,
    y: 2400,
    radius: 80,
  },
  {
    id: "h1-greenside-bunker-left",
    type: "bunker",
    shape: "circle",
    x: 1410,
    y: 2380,
    radius: 38,
  },
  {
    id: "h1-greenside-bunker-right",
    type: "bunker",
    shape: "circle",
    x: 1590,
    y: 2420,
    radius: 36,
  },

  // ── Hole 2: East Fairway & Green ────────────────────────────────────────
  {
    id: "h2-fairway",
    type: "fairway",
    shape: "rect",
    x: 2050,
    y: 1500,
    width: 700,
    height: 360,
  },
  {
    id: "h2-fairway-bunker",
    type: "bunker",
    shape: "circle",
    x: 2050,
    y: 1630,
    radius: 40,
  },
  {
    id: "h2-green",
    type: "green",
    shape: "circle",
    x: 2420,
    y: 1500,
    radius: 80,
  },
  {
    id: "h2-bunker-north",
    type: "bunker",
    shape: "circle",
    x: 2410,
    y: 1415,
    radius: 38,
  },
  {
    id: "h2-bunker-south",
    type: "bunker",
    shape: "circle",
    x: 2510,
    y: 1570,
    radius: 35,
  },

  // ── Hole 3: North Fairway & Green ───────────────────────────────────────
  {
    id: "h3-fairway",
    type: "fairway",
    shape: "rect",
    x: 1500,
    y: 950,
    width: 360,
    height: 700,
  },
  {
    id: "h3-fairway-bunker",
    type: "bunker",
    shape: "circle",
    x: 1370,
    y: 1000,
    radius: 40,
  },
  {
    id: "h3-green",
    type: "green",
    shape: "circle",
    x: 1500,
    y: 600,
    radius: 80,
  },
  {
    id: "h3-bunker-left",
    type: "bunker",
    shape: "circle",
    x: 1410,
    y: 580,
    radius: 36,
  },
  {
    id: "h3-bunker-right",
    type: "bunker",
    shape: "circle",
    x: 1590,
    y: 620,
    radius: 38,
  },

  // ── Hole 4: West / Northwest Fairway & Green ────────────────────────────
  {
    id: "h4-fairway-corridor",
    type: "fairway",
    shape: "rect",
    x: 950,
    y: 1500,
    width: 700,
    height: 360,
  },
  {
    id: "h4-fairway-west",
    type: "fairway",
    shape: "rect",
    x: 650,
    y: 550,
    width: 750,
    height: 550,
  },
  {
    id: "h4-connecting-fairway",
    type: "fairway",
    shape: "rect",
    x: 850,
    y: 1000,
    width: 320,
    height: 700,
    rotation: -0.785, // -45 degrees diagonal corridor
  },
  {
    id: "h4-green",
    type: "green",
    shape: "circle",
    x: 400,
    y: 420,
    radius: 80,
  },
  {
    id: "h4-bunker-left",
    type: "bunker",
    shape: "circle",
    x: 320,
    y: 410,
    radius: 36,
  },
  {
    id: "h4-bunker-right",
    type: "bunker",
    shape: "circle",
    x: 480,
    y: 440,
    radius: 36,
  },
];

/**
 * Returns the terrain type at world coordinate (x, y). Later zones in the
 * array take precedence over earlier zones; if no zone contains the point,
 * the default base terrain (Rough) is returned.
 */
export function getTerrainAt(
  x: number,
  y: number,
  zones: TerrainZone[] = COURSE_ZONES,
  defaultTerrain: TerrainType = DEFAULT_TERRAIN,
): TerrainType {
  for (let i = zones.length - 1; i >= 0; i--) {
    const zone = zones[i];
    if (isPointInZone(x, y, zone)) {
      return zone.type;
    }
  }
  return defaultTerrain;
}

/** Returns full physical properties of the terrain at (x, y) */
export function getTerrainPropertiesAt(
  x: number,
  y: number,
  zones: TerrainZone[] = COURSE_ZONES,
  defaultTerrain: TerrainType = DEFAULT_TERRAIN,
): TerrainProperties {
  const type = getTerrainAt(x, y, zones, defaultTerrain);
  return TERRAIN_PROPERTIES[type];
}
