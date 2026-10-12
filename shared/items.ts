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

/** Balancing-Leitplanken: kein One-Hit-Meta, Carry-Bonus max +40 %. */
export const STAT_LIMITS: StatLimits = {
  carryMult: [0.5, 1.4],
  gravityMult: [0.5, 2],
  spinMult: [0, 3],
  rollDecelMult: [0.3, 3],
  restitutionAdd: [-0.3, 0.3],
  bounceFrictionAdd: [-0.4, 0.2],
  knockdownMult: [0.25, 2.5],
  knockdownTakenMult: [0.25, 2],
  collisionRadiusMult: [0.6, 1.8],
  hitRadiusAdd: [0, 12],
  ballRadiusMult: [0.5, 2.0],
  playerRadiusMult: [0.7, 1.5],
  playerSpeedMult: [0.7, 1.4],
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
    modifiers: {
      playerSpeedMult: 1.25,
      playerRadiusMult: 0.85,
      knockdownTakenMult: 1.2,
      playerColor: 0xf59e0b,
    },
  },
];

const ITEM_BY_ID = new Map<string, ItemDef>(
  ITEM_CATALOG.map((item) => [item.id, item]),
);

export function getItem(id: string): ItemDef | undefined {
  return ITEM_BY_ID.get(id);
}

export function isValidItemForSlot(itemId: string, slot: ItemSlot): boolean {
  const item = ITEM_BY_ID.get(itemId);
  return item !== undefined && item.slot === slot;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Löst ein Loadout zu effektiven Stats auf. Unbekannte IDs und
 * Slot-Fehlbelegungen werden still ignoriert (Server validiert streng,
 * der Resolver bleibt total und crasht nie).
 * Farb-Overrides: letztes definiertes Item in Slot-Reihenfolge gewinnt.
 */
export function resolveStats(loadout?: PlayerLoadout | null): EffectiveStats {
  const stats: EffectiveStats = { ...BASE_STATS };
  if (!loadout) return stats;

  for (const slot of ITEM_SLOTS) {
    const itemId = loadout[slot];
    if (!itemId) continue;
    const item = ITEM_BY_ID.get(itemId);
    if (!item || item.slot !== slot) continue;
    const m = item.modifiers;
    if (m.carryMult !== undefined) stats.carryMult *= m.carryMult;
    if (m.gravityMult !== undefined) stats.gravityMult *= m.gravityMult;
    if (m.spinMult !== undefined) stats.spinMult *= m.spinMult;
    if (m.rollDecelMult !== undefined) stats.rollDecelMult *= m.rollDecelMult;
    if (m.restitutionAdd !== undefined)
      stats.restitutionAdd += m.restitutionAdd;
    if (m.bounceFrictionAdd !== undefined)
      stats.bounceFrictionAdd += m.bounceFrictionAdd;
    if (m.knockdownMult !== undefined) stats.knockdownMult *= m.knockdownMult;
    if (m.knockdownTakenMult !== undefined)
      stats.knockdownTakenMult *= m.knockdownTakenMult;
    if (m.collisionRadiusMult !== undefined)
      stats.collisionRadiusMult *= m.collisionRadiusMult;
    if (m.hitRadiusAdd !== undefined) stats.hitRadiusAdd += m.hitRadiusAdd;
    if (m.ballRadiusMult !== undefined)
      stats.ballRadiusMult *= m.ballRadiusMult;
    if (m.playerRadiusMult !== undefined)
      stats.playerRadiusMult *= m.playerRadiusMult;
    if (m.playerSpeedMult !== undefined)
      stats.playerSpeedMult *= m.playerSpeedMult;
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
