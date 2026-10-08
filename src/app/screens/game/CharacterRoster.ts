import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AnimationClip, Group, MeshStandardMaterial } from "three";
import { Mesh } from "three";

/** One playable character: a converted Quaternius (CC0) base model. */
export interface CharacterEntry {
  /** Stable id, also used for deterministic per-player assignment */
  id: string;
  /** URL relative to the app base (served from public/models/) */
  url: string;
}

export interface CharacterTemplate extends CharacterEntry {
  scene: Group;
  clips: AnimationClip[];
}

export const CHARACTER_ROSTER: readonly CharacterEntry[] = [
  {
    id: "male-casual",
    url: `${import.meta.env.BASE_URL}models/male-casual.glb`,
  },
  {
    id: "female-casual",
    url: `${import.meta.env.BASE_URL}models/female-casual.glb`,
  },
];

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
  return clips.find((clip) => clip.name.endsWith(kind)) ?? clips[0] ?? null;
}

/**
 * Normalizes character materials after loading:
 * 1. Undoes the double-gamma crush from the FBX export pipeline so skin,
 *    hair, and clothing reflect their intended tones rather than near-black.
 * 2. Clears spurious emissive values inherited from FBXLoader.
 * 3. Re-tints female-casual's shirt from olive-green (which blends into
 *    the green playfield) to a contrasting coral-red (0xe05638).
 */
export function tuneCharacterMaterials(
  scene: Group,
  characterId: string,
): void {
  scene.traverse((child) => {
    if (child instanceof Mesh && child.material) {
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const mat of materials) {
        if ("isMeshStandardMaterial" in mat && mat.isMeshStandardMaterial) {
          const standardMat = mat as MeshStandardMaterial;
          standardMat.emissive.setHex(0x000000);
          standardMat.roughness = 0.8;
          standardMat.metalness = 0.1;
          if (characterId === "female-casual" && standardMat.name === "Shirt") {
            // Prevent female-casual from camouflaging on the green field
            standardMat.color.setHex(0xe05638);
          } else {
            // Compensate for double-linearized diffuse colors in the GLB
            standardMat.color.convertLinearToSRGB();
          }
        }
      }
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
    `[cyclo:roster] loading ${CHARACTER_ROSTER.length} templates: ${CHARACTER_ROSTER.map((e) => `${e.id} (${e.url})`).join(", ")}`,
  );
  const loader = new GLTFLoader();
  return Promise.all(
    CHARACTER_ROSTER.map(async (entry): Promise<CharacterTemplate | null> => {
      try {
        console.debug(`[cyclo:roster] fetching ${entry.id} from ${entry.url}`);
        const gltf = await loader.loadAsync(entry.url);
        tuneCharacterMaterials(gltf.scene, entry.id);
        console.info(
          `[cyclo:roster] loaded ${entry.id}: ${gltf.scene.children.length} root children, ${gltf.animations.length} clips [${gltf.animations.map((c) => c.name).join(", ")}]`,
        );
        if (gltf.animations.length === 0) {
          console.warn(
            `[cyclo:roster] ${entry.id} has NO animations — players using it will T-pose/freeze`,
          );
        }
        return { ...entry, scene: gltf.scene, clips: gltf.animations };
      } catch (error) {
        console.error(
          `[cyclo:roster] character failed to load: ${entry.id} (${entry.url}) — those players fall back to dots`,
          error,
        );
        return null;
      }
    }),
  );
}
