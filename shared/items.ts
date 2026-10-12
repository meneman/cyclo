import type { PlayerLoadout } from "./types";

/** Ausrüstungsslot — genau ein Item pro Slot, erzwingt Trade-offs statt Stacking. */
export type ItemSlot = "ball" | "club" | "outfit";

export const ITEM_SLOTS: readonly ItemSlot[] = ["ball", "club", "outfit"];

/**
 * Deklarative Modifikatoren eines Items. Mults werden multipliziert, Adds
 * addiert, danach gegen STAT_LIMITS geclampt — deterministisch und
 * serialisierbar, damit Server und Client identisch auflösen.
 *
 * Vier Aspekte:
 * - physics: carry, gravity, spin, roll, bounce
 * - damage: knockdown (austilen), knockdownTaken (einstecken), collisionRadius
 * - size: ballRadius, playerRadius, hitRadius (Trefferzone), speed
 * - color: ballColor, trailColor, playerColor (reine Optik)
 */
export interface ItemModifiers {
  carryMult?: number;
  gravityMult?: number;
  spinMult?: number;
  rollDecelMult?: number;
  restitutionAdd?: number;
  bounceFrictionAdd?: number;
  knockdownMult?: number;
  knockdownTakenMult?: number;
  collisionRadiusMult?: number;
  hitRadiusAdd?: number;
  ballRadiusMult?: number;
  playerRadiusMult?: number;
  playerSpeedMult?: number;
  ballColor?: number;
  trailColor?: number;
  playerColor?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  slot: ItemSlot;
  description: string;
  color: number;
  modifiers: ItemModifiers;
}

/** Vollständig aufgelöste, geclampte Werte eines Loadouts. */
export interface EffectiveStats {
  carryMult: number;
  gravityMult: number;
  spinMult: number;
  rollDecelMult: number;
  restitutionAdd: number;
  bounceFrictionAdd: number;
  knockdownMult: number;
  knockdownTakenMult: number;
  collisionRadiusMult: number;
  hitRadiusAdd: number;
  ballRadiusMult: number;
  playerRadiusMult: number;
  playerSpeedMult: number;
  ballColor?: number;
  trailColor?: number;
  playerColor?: number;
}

export const BASE_STATS: EffectiveStats = {
  carryMult: 1,
  gravityMult: 1,
  spinMult: 1,
  rollDecelMult: 1,
  restitutionAdd: 0,
  bounceFrictionAdd: 0,
  knockdownMult: 1,
  knockdownTakenMult: 1,
  collisionRadiusMult: 1,
  hitRadiusAdd: 0,
  ballRadiusMult: 1,
  playerRadiusMult: 1,
  playerSpeedMult: 1,
};

interface StatLimits {
  carryMult: [number, number];
  gravityMult: [number, number];
  spinMult: [number, number];
  rollDecelMult: [number, number];
  restitutionAdd: [number, number];
  bounceFrictionAdd: [number, number];
  knockdownMult: [number, number];
  knockdownTakenMult: [number, number];
  collisionRadiusMult: [number, number];
  hitRadiusAdd: [number, number];
  ballRadiusMult: [number, number];
  playerRadiusMult: [number, number];
  playerSpeedMult: [number, number];
}

/** Balancing-Leitplanken: Skaliert spürbar bis zu 5 Stacks ohne frühzeitigen Lock. */
export const STAT_LIMITS: StatLimits = {
  carryMult: [0.3, 5.0],
  gravityMult: [0.3, 8.0],
  spinMult: [0, 15],
  rollDecelMult: [0.1, 5],
  restitutionAdd: [-0.5, 0.5],
  bounceFrictionAdd: [-0.6, 0.4],
  knockdownMult: [0.1, 10],
  knockdownTakenMult: [0.05, 5],
  collisionRadiusMult: [0.3, 5.0],
  hitRadiusAdd: [0, 60],
  ballRadiusMult: [0.2, 8.0],
  playerRadiusMult: [0.3, 5.0],
  playerSpeedMult: [0.2, 3.5],
};

/**
 * Starter-Katalog: jedes Item verändert mindestens einen der vier Aspekte.
 * Neues Item hinzufügen = genau ein Eintrag hier, kein Engine-Umbau nötig.
 */
export const ITEM_CATALOG: readonly ItemDef[] = [
  {
    id: "cannonball",
    name: "Cannonball",
    slot: "ball",
    description: "Schwere Sprengkugel: +35 % Carry, riesig, langer Knockdown.",
    color: 0x64748b,
    modifiers: {
      carryMult: 1.35,
      ballRadiusMult: 1.8,
      knockdownMult: 1.5,
      rollDecelMult: 1.2,
      ballColor: 0x1f2937,
      trailColor: 0xf97316,
    },
  },
  {
    id: "marble-mini",
    name: "Marble Mini",
    slot: "ball",
    description: "Winzig und flink: schwer zu treffen, rollt ewig weit.",
    color: 0x06b6d4,
    modifiers: {
      ballRadiusMult: 0.6,
      rollDecelMult: 0.7,
      carryMult: 0.95,
      ballColor: 0x06b6d4,
      trailColor: 0x06b6d4,
    },
  },
  {
    id: "curve-king",
    name: "Curve King",
    slot: "ball",
    description: "Extremer Spin: Kurven, die um Hindernisse fliegen.",
    color: 0xa855f7,
    modifiers: {
      spinMult: 2.4,
      ballColor: 0xa855f7,
      trailColor: 0xa855f7,
    },
  },
  {
    id: "driver-x",
    name: "Driver X",
    slot: "club",
    description: "Maximale Weite (+40 % Carry) plus größere Trefferzone.",
    color: 0xf59e0b,
    modifiers: {
      carryMult: 1.4,
      hitRadiusAdd: 4,
      spinMult: 0.9,
    },
  },
  {
    id: "wrecker",
    name: "Wrecker",
    slot: "club",
    description: "Abrissbirne: doppelter Knockdown, größerer Kollisionsradius.",
    color: 0xef4444,
    modifiers: {
      knockdownMult: 2.0,
      collisionRadiusMult: 1.3,
      carryMult: 0.9,
      spinMult: 0.6,
    },
  },
  {
    id: "sniper",
    name: "Sniper",
    slot: "club",
    description: "Präzision: riesige Trefferzone, etwas weniger Weite.",
    color: 0x10b981,
    modifiers: {
      hitRadiusAdd: 10,
      carryMult: 0.92,
      gravityMult: 0.9,
    },
  },
  {
    id: "tank-suit",
    name: "Tank Suit",
    slot: "outfit",
    description: "Panzerung: halber Knockdown, groß und langsam.",
    color: 0x14b8a6,
    modifiers: {
      knockdownTakenMult: 0.5,
      playerRadiusMult: 1.4,
      playerSpeedMult: 0.88,
      playerColor: 0x22c55e,
    },
  },
  {
    id: "swift-tee",
    name: "Swift Tee",
    slot: "outfit",
    description:
      "Schnell und schmal: +25 % Speed, schwerer zu treffen, fragil.",
    color: 0xf97316,
    modifiers: {
      playerSpeedMult: 1.25,
      playerRadiusMult: 0.85,
      knockdownTakenMult: 1.2,
      playerColor: 0xf59e0b,
    },
  },
  {
    id: "titan-ball",
    name: "Titan Ball",
    slot: "ball",
    description: "Riesige Kugel und massiger Körper: beides deutlich größer.",
    color: 0x3b82f6,
    modifiers: {
      ballRadiusMult: 1.5,
      playerRadiusMult: 1.38,
    },
  },
  {
    id: "tailwind",
    name: "Tailwind",
    slot: "club",
    description: "Schnellerer Ballflug, langsamere Füße.",
    color: 0xec4899,
    modifiers: {
      gravityMult: 1.5,
      playerSpeedMult: 0.8,
    },
  },
];

const ITEM_BY_ID = new Map<string, ItemDef>(
  ITEM_CATALOG.map((item) => [item.id, item]),
);

/**
 * Map pickups: one per new effect card, placed side by side `dx` units from
 * the world center, ITEM_PICKUP_Y_OFFSET above the middle.
 */
export interface ItemPickupSpawn {
  itemId: string;
  dx: number;
}

export const ITEM_PICKUP_SPAWNS: readonly ItemPickupSpawn[] = [
  { itemId: "titan-ball", dx: -100 },
  { itemId: "tailwind", dx: 100 },
];

/** Max distinct items one player can own (inventory cap, walk-over + menu share it). */
export const MAX_INVENTORY_ITEMS = 5;

/** Max copies of a single item a player can stack. */
export const MAX_STACKS_PER_ITEM = 5;

export function getItem(id: string): ItemDef | undefined {
  return ITEM_BY_ID.get(id);
}

/**
 * Normalizes untrusted item stack counts: keys must be known item ids, values
 * integers clamped between 1 and MAX_STACKS_PER_ITEM.
 */
export function normalizeStacks(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!ITEM_BY_ID.has(k)) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const clamped = Math.floor(Math.min(Math.max(v, 1), MAX_STACKS_PER_ITEM));
    if (clamped >= 1) {
      out[k] = clamped;
    }
  }
  return out;
}

/**
 * Normalizes untrusted inventory data: keeps known item ids only, deduped,
 * capped at MAX_INVENTORY_ITEMS. Never throws — server and client use it on
 * every inbound snapshot so malformed state can't poison the game.
 */
export function normalizeInventory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    if (!ITEM_BY_ID.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
    if (out.length >= MAX_INVENTORY_ITEMS) break;
  }
  return out;
}

/** True when itemId is already owned or there is room to add it. */
export function canAddToInventory(
  inventory: readonly string[],
  itemId: string,
): boolean {
  if (!ITEM_BY_ID.has(itemId)) return false;
  return inventory.includes(itemId) || inventory.length < MAX_INVENTORY_ITEMS;
}

/** Adds itemId when known and room (or already owned) — returns a new array. */
export function addToInventory(
  inventory: readonly string[],
  itemId: string,
): string[] {
  if (!ITEM_BY_ID.has(itemId)) return [...inventory];
  if (inventory.includes(itemId)) return [...inventory];
  if (inventory.length >= MAX_INVENTORY_ITEMS) return [...inventory];
  return [...inventory, itemId];
}

/** Removes itemId — returns a new array. */
export function removeFromInventory(
  inventory: readonly string[],
  itemId: string,
): string[] {
  return inventory.filter((id) => id !== itemId);
}

/**
 * Adds itemId with FIFO eviction: unknown ids are ignored, already-owned ids
 * are a no-op, and when full the OLDEST (first) entry is dropped to make room.
 * Returns the new inventory plus the evicted id, if any.
 */
export function addToInventoryFifo(
  inventory: readonly string[],
  itemId: string,
): { inventory: string[]; evicted?: string } {
  if (!ITEM_BY_ID.has(itemId)) return { inventory: [...inventory] };
  if (inventory.includes(itemId)) return { inventory: [...inventory] };
  if (inventory.length < MAX_INVENTORY_ITEMS) {
    return { inventory: [...inventory, itemId] };
  }
  const [evicted, ...rest] = inventory;
  return { inventory: [...rest, itemId], evicted };
}

export function isValidItemForSlot(itemId: string, slot: ItemSlot): boolean {
  const item = ITEM_BY_ID.get(itemId);
  return item !== undefined && item.slot === slot;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Löst ein Loadout zu effektiven Stats auf unter Berücksichtigung von Item-Stacks.
 * Multiplikatoren werden potenziert (mult^stacks), Additive skaliert (add*stacks).
 * Unbekannte IDs und Slot-Fehlbelegungen werden still ignoriert (Server validiert streng,
 * der Resolver bleibt total und crasht nie).
 * Farb-Overrides: letztes definiertes Item in Slot-Reihenfolge gewinnt.
 */
export function resolveStats(
  loadout?: PlayerLoadout | null,
  itemStacks?: Record<string, number> | null,
): EffectiveStats {
  const stats: EffectiveStats = { ...BASE_STATS };
  if (!loadout) return stats;

  for (const slot of ITEM_SLOTS) {
    const itemId = loadout[slot];
    if (!itemId) continue;
    const item = ITEM_BY_ID.get(itemId);
    if (!item || item.slot !== slot) continue;
    const rawStacks = itemStacks?.[itemId];
    const stacks =
      typeof rawStacks === "number" && Number.isFinite(rawStacks)
        ? Math.min(Math.max(Math.floor(rawStacks), 1), MAX_STACKS_PER_ITEM)
        : 1;
    const m = item.modifiers;
    if (m.carryMult !== undefined)
      stats.carryMult *= Math.pow(m.carryMult, stacks);
    if (m.gravityMult !== undefined)
      stats.gravityMult *= Math.pow(m.gravityMult, stacks);
    if (m.spinMult !== undefined)
      stats.spinMult *= Math.pow(m.spinMult, stacks);
    if (m.rollDecelMult !== undefined)
      stats.rollDecelMult *= Math.pow(m.rollDecelMult, stacks);
    if (m.restitutionAdd !== undefined)
      stats.restitutionAdd += m.restitutionAdd * stacks;
    if (m.bounceFrictionAdd !== undefined)
      stats.bounceFrictionAdd += m.bounceFrictionAdd * stacks;
    if (m.knockdownMult !== undefined)
      stats.knockdownMult *= Math.pow(m.knockdownMult, stacks);
    if (m.knockdownTakenMult !== undefined)
      stats.knockdownTakenMult *= Math.pow(m.knockdownTakenMult, stacks);
    if (m.collisionRadiusMult !== undefined)
      stats.collisionRadiusMult *= Math.pow(m.collisionRadiusMult, stacks);
    if (m.hitRadiusAdd !== undefined)
      stats.hitRadiusAdd += m.hitRadiusAdd * stacks;
    if (m.ballRadiusMult !== undefined)
      stats.ballRadiusMult *= Math.pow(m.ballRadiusMult, stacks);
    if (m.playerRadiusMult !== undefined)
      stats.playerRadiusMult *= Math.pow(m.playerRadiusMult, stacks);
    if (m.playerSpeedMult !== undefined)
      stats.playerSpeedMult *= Math.pow(m.playerSpeedMult, stacks);
    if (m.ballColor !== undefined) stats.ballColor = m.ballColor;
    if (m.trailColor !== undefined) stats.trailColor = m.trailColor;
    if (m.playerColor !== undefined) stats.playerColor = m.playerColor;
  }

  stats.carryMult = clamp(stats.carryMult, ...STAT_LIMITS.carryMult);
  stats.gravityMult = clamp(stats.gravityMult, ...STAT_LIMITS.gravityMult);
  stats.spinMult = clamp(stats.spinMult, ...STAT_LIMITS.spinMult);
  stats.rollDecelMult = clamp(
    stats.rollDecelMult,
    ...STAT_LIMITS.rollDecelMult,
  );
  stats.restitutionAdd = clamp(
    stats.restitutionAdd,
    ...STAT_LIMITS.restitutionAdd,
  );
  stats.bounceFrictionAdd = clamp(
    stats.bounceFrictionAdd,
    ...STAT_LIMITS.bounceFrictionAdd,
  );
  stats.knockdownMult = clamp(
    stats.knockdownMult,
    ...STAT_LIMITS.knockdownMult,
  );
  stats.knockdownTakenMult = clamp(
    stats.knockdownTakenMult,
    ...STAT_LIMITS.knockdownTakenMult,
  );
  stats.collisionRadiusMult = clamp(
    stats.collisionRadiusMult,
    ...STAT_LIMITS.collisionRadiusMult,
  );
  stats.hitRadiusAdd = clamp(stats.hitRadiusAdd, ...STAT_LIMITS.hitRadiusAdd);
  stats.ballRadiusMult = clamp(
    stats.ballRadiusMult,
    ...STAT_LIMITS.ballRadiusMult,
  );
  stats.playerRadiusMult = clamp(
    stats.playerRadiusMult,
    ...STAT_LIMITS.playerRadiusMult,
  );
  stats.playerSpeedMult = clamp(
    stats.playerSpeedMult,
    ...STAT_LIMITS.playerSpeedMult,
  );
  return stats;
}

/** True when at least one active modifier of the item hits or saturates its STAT_LIMITS clamp */
export function isItemAtLimit(item: ItemDef, stacks: number = 1): boolean {
  const clampedStacks = Math.max(1, Math.min(MAX_STACKS_PER_ITEM, stacks));
  const m = item.modifiers;
  if (
    m.carryMult !== undefined &&
    Math.pow(m.carryMult, clampedStacks) >= STAT_LIMITS.carryMult[1]
  )
    return true;
  if (m.gravityMult !== undefined) {
    const val = Math.pow(m.gravityMult, clampedStacks);
    if (val >= STAT_LIMITS.gravityMult[1] || val <= STAT_LIMITS.gravityMult[0])
      return true;
  }
  if (
    m.spinMult !== undefined &&
    Math.pow(m.spinMult, clampedStacks) >= STAT_LIMITS.spinMult[1]
  )
    return true;
  if (m.rollDecelMult !== undefined) {
    const val = Math.pow(m.rollDecelMult, clampedStacks);
    if (
      val <= STAT_LIMITS.rollDecelMult[0] ||
      val >= STAT_LIMITS.rollDecelMult[1]
    )
      return true;
  }
  if (m.restitutionAdd !== undefined) {
    const val = m.restitutionAdd * clampedStacks;
    if (
      val >= STAT_LIMITS.restitutionAdd[1] ||
      val <= STAT_LIMITS.restitutionAdd[0]
    )
      return true;
  }
  if (m.bounceFrictionAdd !== undefined) {
    const val = m.bounceFrictionAdd * clampedStacks;
    if (
      val <= STAT_LIMITS.bounceFrictionAdd[0] ||
      val >= STAT_LIMITS.bounceFrictionAdd[1]
    )
      return true;
  }
  if (
    m.knockdownMult !== undefined &&
    Math.pow(m.knockdownMult, clampedStacks) >= STAT_LIMITS.knockdownMult[1]
  )
    return true;
  if (
    m.knockdownTakenMult !== undefined &&
    Math.pow(m.knockdownTakenMult, clampedStacks) <=
      STAT_LIMITS.knockdownTakenMult[0]
  )
    return true;
  if (
    m.collisionRadiusMult !== undefined &&
    Math.pow(m.collisionRadiusMult, clampedStacks) >=
      STAT_LIMITS.collisionRadiusMult[1]
  )
    return true;
  if (
    m.hitRadiusAdd !== undefined &&
    m.hitRadiusAdd * clampedStacks >= STAT_LIMITS.hitRadiusAdd[1]
  )
    return true;
  if (m.ballRadiusMult !== undefined) {
    const val = Math.pow(m.ballRadiusMult, clampedStacks);
    if (
      val >= STAT_LIMITS.ballRadiusMult[1] ||
      val <= STAT_LIMITS.ballRadiusMult[0]
    )
      return true;
  }
  if (m.playerRadiusMult !== undefined) {
    const val = Math.pow(m.playerRadiusMult, clampedStacks);
    if (
      val >= STAT_LIMITS.playerRadiusMult[1] ||
      val <= STAT_LIMITS.playerRadiusMult[0]
    )
      return true;
  }
  if (m.playerSpeedMult !== undefined) {
    const val = Math.pow(m.playerSpeedMult, clampedStacks);
    if (
      val >= STAT_LIMITS.playerSpeedMult[1] ||
      val <= STAT_LIMITS.playerSpeedMult[0]
    )
      return true;
  }
  return false;
}

/** Formats scaled effects of an item for the given stack count, showing MAX when clamped */
export function formatItemStatsText(item: ItemDef, stacks: number = 1): string {
  const clampedStacks = Math.max(1, Math.min(MAX_STACKS_PER_ITEM, stacks));
  const m = item.modifiers;
  const parts: string[] = [];

  if (m.carryMult !== undefined) {
    const raw = Math.pow(m.carryMult, clampedStacks);
    const atMax = raw >= STAT_LIMITS.carryMult[1];
    const effective = Math.min(raw, STAT_LIMITS.carryMult[1]);
    const pct = Math.round((effective - 1) * 100);
    parts.push(`${pct >= 0 ? "+" : ""}${pct}% Carry${atMax ? " (MAX)" : ""}`);
  }
  if (m.gravityMult !== undefined) {
    const raw = Math.pow(m.gravityMult, clampedStacks);
    const atMax =
      raw >= STAT_LIMITS.gravityMult[1] || raw <= STAT_LIMITS.gravityMult[0];
    const effective = Math.min(
      Math.max(raw, STAT_LIMITS.gravityMult[0]),
      STAT_LIMITS.gravityMult[1],
    );
    parts.push(`${effective.toFixed(1)}x Gravity${atMax ? " (MAX)" : ""}`);
  }
  if (m.spinMult !== undefined) {
    const raw = Math.pow(m.spinMult, clampedStacks);
    const atMax = raw >= STAT_LIMITS.spinMult[1];
    const effective = Math.min(raw, STAT_LIMITS.spinMult[1]);
    parts.push(`${effective.toFixed(1)}x Spin${atMax ? " (MAX)" : ""}`);
  }
  if (m.rollDecelMult !== undefined) {
    const raw = Math.pow(m.rollDecelMult, clampedStacks);
    const atMax =
      raw <= STAT_LIMITS.rollDecelMult[0] ||
      raw >= STAT_LIMITS.rollDecelMult[1];
    const effective = Math.min(
      Math.max(raw, STAT_LIMITS.rollDecelMult[0]),
      STAT_LIMITS.rollDecelMult[1],
    );
    parts.push(`${effective.toFixed(2)}x Roll Decel${atMax ? " (MAX)" : ""}`);
  }
  if (m.restitutionAdd !== undefined) {
    const raw = m.restitutionAdd * clampedStacks;
    const atMax =
      raw >= STAT_LIMITS.restitutionAdd[1] ||
      raw <= STAT_LIMITS.restitutionAdd[0];
    const effective = Math.min(
      Math.max(raw, STAT_LIMITS.restitutionAdd[0]),
      STAT_LIMITS.restitutionAdd[1],
    );
    parts.push(
      `${effective >= 0 ? "+" : ""}${effective.toFixed(2)} Bounce${atMax ? " (MAX)" : ""}`,
    );
  }
  if (m.bounceFrictionAdd !== undefined) {
    const raw = m.bounceFrictionAdd * clampedStacks;
    const atMax =
      raw <= STAT_LIMITS.bounceFrictionAdd[0] ||
      raw >= STAT_LIMITS.bounceFrictionAdd[1];
    const effective = Math.min(
      Math.max(raw, STAT_LIMITS.bounceFrictionAdd[0]),
      STAT_LIMITS.bounceFrictionAdd[1],
    );
    parts.push(
      `${effective >= 0 ? "+" : ""}${effective.toFixed(2)} Friction${atMax ? " (MAX)" : ""}`,
    );
  }
  if (m.knockdownMult !== undefined) {
    const raw = Math.pow(m.knockdownMult, clampedStacks);
    const atMax = raw >= STAT_LIMITS.knockdownMult[1];
    const effective = Math.min(raw, STAT_LIMITS.knockdownMult[1]);
    parts.push(`${effective.toFixed(1)}x Knockdown${atMax ? " (MAX)" : ""}`);
  }
  if (m.knockdownTakenMult !== undefined) {
    const raw = Math.pow(m.knockdownTakenMult, clampedStacks);
    const atMax = raw <= STAT_LIMITS.knockdownTakenMult[0];
    const effective = Math.max(raw, STAT_LIMITS.knockdownTakenMult[0]);
    parts.push(
      `${effective.toFixed(2)}x Knockdown Taken${atMax ? " (MAX)" : ""}`,
    );
  }
  if (m.collisionRadiusMult !== undefined) {
    const raw = Math.pow(m.collisionRadiusMult, clampedStacks);
    const atMax = raw >= STAT_LIMITS.collisionRadiusMult[1];
    const effective = Math.min(raw, STAT_LIMITS.collisionRadiusMult[1]);
    parts.push(`${effective.toFixed(1)}x Ball Hitbox${atMax ? " (MAX)" : ""}`);
  }
  if (m.hitRadiusAdd !== undefined) {
    const raw = m.hitRadiusAdd * clampedStacks;
    const atMax = raw >= STAT_LIMITS.hitRadiusAdd[1];
    const effective = Math.min(raw, STAT_LIMITS.hitRadiusAdd[1]);
    parts.push(`+${effective} Reach${atMax ? " (MAX)" : ""}`);
  }
  if (m.ballRadiusMult !== undefined) {
    const raw = Math.pow(m.ballRadiusMult, clampedStacks);
    const atMax =
      raw >= STAT_LIMITS.ballRadiusMult[1] ||
      raw <= STAT_LIMITS.ballRadiusMult[0];
    const effective = Math.min(
      Math.max(raw, STAT_LIMITS.ballRadiusMult[0]),
      STAT_LIMITS.ballRadiusMult[1],
    );
    parts.push(`${effective.toFixed(1)}x Ball Size${atMax ? " (MAX)" : ""}`);
  }
  if (m.playerRadiusMult !== undefined) {
    const raw = Math.pow(m.playerRadiusMult, clampedStacks);
    const atMax =
      raw >= STAT_LIMITS.playerRadiusMult[1] ||
      raw <= STAT_LIMITS.playerRadiusMult[0];
    const effective = Math.min(
      Math.max(raw, STAT_LIMITS.playerRadiusMult[0]),
      STAT_LIMITS.playerRadiusMult[1],
    );
    parts.push(`${effective.toFixed(2)}x Body Size${atMax ? " (MAX)" : ""}`);
  }
  if (m.playerSpeedMult !== undefined) {
    const raw = Math.pow(m.playerSpeedMult, clampedStacks);
    const atMax =
      raw >= STAT_LIMITS.playerSpeedMult[1] ||
      raw <= STAT_LIMITS.playerSpeedMult[0];
    const effective = Math.min(
      Math.max(raw, STAT_LIMITS.playerSpeedMult[0]),
      STAT_LIMITS.playerSpeedMult[1],
    );
    const pct = Math.round((effective - 1) * 100);
    parts.push(`${pct >= 0 ? "+" : ""}${pct}% Speed${atMax ? " (MAX)" : ""}`);
  }
  return parts.join(", ");
}

/** Effektive Ballfarbe: Item-Override gewinnt, sonst Spielerfarbe. */
export function resolveBallColor(
  stats: EffectiveStats,
  fallbackColor: number,
): number {
  return stats.ballColor ?? fallbackColor;
}

/** Effektive Spielerfarbe: Item-Override gewinnt, sonst gewählte Farbe. */
export function resolvePlayerColor(
  stats: EffectiveStats,
  fallbackColor: number,
): number {
  return stats.playerColor ?? fallbackColor;
}
