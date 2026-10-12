import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AnimationClip, Group, Material, Texture } from "three";
import {
  Color,
  DataTexture,
  Mesh,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
} from "three";

export type RobotVariant = "classic" | "retro" | "cyber";

/** One playable character: a stylized 3D model. */
export interface CharacterEntry {
  /** Stable id, also used for deterministic per-player assignment */
  id: string;
  /** Display name of the character/variant */
  name?: string;
  /** URL relative to the app base (served from public/models/) */
  url: string;
  /** Base scale factor to normalize model height to ~28-29 world units */
  scale?: number;
  /** Visual styling and facial expression personality variant */
  variant?: RobotVariant;
}

export interface CharacterTemplate extends CharacterEntry {
  scene: Group;
  clips: AnimationClip[];
}

export const CHARACTER_ROSTER: readonly CharacterEntry[] = [
  {
    id: "robot-expressive",
    name: "Classic Bot",
    url: `${import.meta.env.BASE_URL}models/robot-expressive.glb`,
    scale: 6.0,
    variant: "classic",
  },
  {
    id: "robot-retro",
    name: "Retro Gold Bot",
    url: `${import.meta.env.BASE_URL}models/robot-expressive.glb`,
    scale: 6.0,
    variant: "retro",
  },
  {
    id: "robot-cyber",
    name: "Cyber Stealth Bot",
    url: `${import.meta.env.BASE_URL}models/robot-expressive.glb`,
    scale: 6.0,
    variant: "cyber",
  },
];

/**
 * Shared discrete 3-tone gradient ramp texture for cel-shading.
 * Generates discrete bands: shadow tone, midtone, and highlight.
 */
export function createToonGradientTexture(steps = 3): DataTexture {
  const data = new Uint8Array(steps * 4);
  const rampValues = [65, 160, 255];
  for (let i = 0; i < steps; i++) {
    const v = rampValues[i] ?? Math.round(((i + 1) / steps) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const texture = new DataTexture(data, steps, 1, RGBAFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

let sharedToonGradient: DataTexture | null = null;
export function getSharedToonGradient(): DataTexture {
  sharedToonGradient ??= createToonGradientTexture(3);
  return sharedToonGradient;
}

/**
 * High-contrast cartoon color palette for character model parts, replacing
 * the murky, near-black raw export tones with bright comic-book colors.
 */
export const CARTOON_PART_COLORS: Readonly<Record<string, number>> = {
  Skin: 0xffd5b3, // Warm anime/cartoon peach skin
  Hair: 0x4a2e18, // Warm chestnut brown
  HairBase: 0x4a2e18,
  Eyes: 0x1e293b, // Dark navy
  Pants: 0x2563eb, // Vibrant cartoon blue jeans
  Socks: 0xffffff, // Crisp white socks
  Shoes: 0xd97706, // Amber sneakers
};

/**
 * Deterministic character pick for a player id — every client assigns the
 * same character to the same player, so no protocol change is needed to keep
 * the choice in sync. Player ids are UUIDs, so a string hash spreads players
 * across the roster.
 */
export function characterForPlayerId(playerId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < playerId.length; i++) {
    hash ^= playerId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % CHARACTER_ROSTER.length;
}

/**
 * Finds the Idle/Walk clip by name suffix (converted clips are named like
 * "HumanArmature|Man_Idle"). Falls back to the first available clip, or null
 * when the template carries no animation at all.
 */
export function pickClip(
  clips: readonly AnimationClip[],
  kind: string,
): AnimationClip | null {
  const target = kind.toLowerCase();
  return (
    clips.find((clip) => clip.name.toLowerCase().endsWith(target)) ??
    clips.find((clip) => clip.name.toLowerCase().includes(target)) ??
    clips[0] ??
    null
  );
}

/**
 * Converts character materials to stylized MeshToonMaterial (cel-shading):
 * 1. Assigns a vibrant high-contrast cartoon palette (bright skin, blue jeans,
 *    warm hair, or friendly robot casing) so cel-shading stands out clearly.
 * 2. Clears spurious emissive values inherited from FBXLoader.
 * 3. Sets distinct default shirt/chassis colors.
 * 4. Applies discrete toon gradient map for cartoon light-stepping.
 */
export function tuneCharacterMaterials(
  scene: Group,
  characterId: string,
  gradientMap?: Texture | null,
  variant: RobotVariant = "classic",
): void {
  const ramp =
    gradientMap !== undefined ? gradientMap : getSharedToonGradient();

  // Apply facial expression morph targets based on robot variant personality
  scene.traverse((child) => {
    if (
      child instanceof Mesh &&
      child.morphTargetDictionary &&
      child.morphTargetInfluences
    ) {
      if (variant === "retro") {
        const idx = child.morphTargetDictionary["Surprised"];
        if (idx !== undefined) {
          child.morphTargetInfluences[idx] = 0.85;
        }
      } else if (variant === "cyber") {
        const idx = child.morphTargetDictionary["Angry"];
        if (idx !== undefined) {
          child.morphTargetInfluences[idx] = 0.85;
        }
      }
    }
  });

  scene.traverse((child) => {
    if (
      child instanceof Mesh &&
      child.material &&
      !child.name.endsWith("_Outline")
    ) {
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const newMaterials: Material[] = [];
      for (const mat of materials) {
        if ("isMeshStandardMaterial" in mat && mat.isMeshStandardMaterial) {
          const standardMat = mat as MeshStandardMaterial;
          let color: Color;
          if (standardMat.name === "Shirt") {
            color = new Color(
              characterId === "female-casual" ? 0xe05638 : 0x0284c7,
            );
          } else if (standardMat.name === "Main") {
            if (variant === "retro") {
              color = new Color(0xf59e0b); // Warm amber / golden chassis
            } else if (variant === "cyber") {
              color = new Color(0xe11d48); // High-tech crimson / ruby chassis
            } else {
              color = new Color(0x0ea5e9); // Vibrant sky blue / cyan
            }
          } else if (standardMat.name === "Grey") {
            if (variant === "retro") {
              color = new Color(0x78350f); // Warm vintage brass/bronze joints
            } else if (variant === "cyber") {
              color = new Color(0x334155); // Dark gunmetal slate mechanics
            } else {
              color = new Color(0x94a3b8); // Metallic silver
            }
          } else if (standardMat.name === "Black") {
            if (variant === "cyber") {
              color = new Color(0x09090b); // Deep obsidian visor
            } else {
              color = new Color(0x1e293b);
            }
          } else {
            const cartoonHex = CARTOON_PART_COLORS[standardMat.name];
            if (cartoonHex !== undefined) {
              color = new Color(cartoonHex);
            } else {
              color = standardMat.color.clone();
              color.convertLinearToSRGB();
            }
          }
          const toonMat = new MeshToonMaterial({
            name: standardMat.name,
            color,
            map: standardMat.map,
            gradientMap: ramp,
            emissive: new Color(0x000000),
          });
          toonMat.userData = { ...standardMat.userData };
          newMaterials.push(toonMat);
        } else if ("isMeshToonMaterial" in mat && mat.isMeshToonMaterial) {
          if (ramp) {
            (mat as MeshToonMaterial).gradientMap = ramp;
          }
          newMaterials.push(mat);
        } else {
          newMaterials.push(mat);
        }
      }
      child.material = Array.isArray(child.material)
        ? newMaterials
        : newMaterials[0];
    }
  });
}

/**
 * Loads every roster entry once — templates are cloned per player. A failed
 * entry resolves to null (callers fall back to a marker dot) instead of
 * rejecting the whole roster.
 */
export async function loadCharacterTemplates(): Promise<
  (CharacterTemplate | null)[]
> {
  console.info(
    `[golfi:roster] loading ${CHARACTER_ROSTER.length} templates: ${CHARACTER_ROSTER.map((e) => `${e.id} (${e.url})`).join(", ")}`,
  );
  const loader = new GLTFLoader();
  return Promise.all(
    CHARACTER_ROSTER.map(async (entry): Promise<CharacterTemplate | null> => {
      try {
        console.debug(`[golfi:roster] fetching ${entry.id} from ${entry.url}`);
        const gltf = await loader.loadAsync(entry.url);
        tuneCharacterMaterials(gltf.scene, entry.id, undefined, entry.variant);
        console.info(
          `[golfi:roster] loaded ${entry.id}: ${gltf.scene.children.length} root children, ${gltf.animations.length} clips [${gltf.animations.map((c) => c.name).join(", ")}]`,
        );
        if (gltf.animations.length === 0) {
          console.warn(
            `[golfi:roster] ${entry.id} has NO animations — players using it will T-pose/freeze`,
          );
        }
        return { ...entry, scene: gltf.scene, clips: gltf.animations };
      } catch (error) {
        console.error(
          `[golfi:roster] character failed to load: ${entry.id} (${entry.url}) — those players fall back to dots`,
          error,
        );
        return null;
      }
    }),
  );
}
