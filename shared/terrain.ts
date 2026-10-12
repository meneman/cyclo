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
    name: "Normal Terrain",
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

export const DEFAULT_TERRAIN: TerrainType = "fairway";

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
 * With sand, grass, and secondary hazard zones removed, the entire arena uses
 * purely the base normal terrain.
 */
export const COURSE_ZONES: TerrainZone[] = [];

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
