import type { PlayerLoadout } from "../../../shared/types";
import { storage } from "../../engine/utils/storage";
import { engine } from "../getEngine";

// Keys for saved items in storage
const KEY_VOLUME_MASTER = "volume-master";
const KEY_VOLUME_BGM = "volume-bgm";
const KEY_VOLUME_SFX = "volume-sfx";
const KEY_PLAYER_NAME = "player-name";
const KEY_PLAYER_COLOR = "player-color";
const KEY_PLAYER_LOADOUT = "player-loadout";

/**
 * Persistent user settings of volumes.
 */
class UserSettings {
  public init() {
    engine().audio.setMasterVolume(this.getMasterVolume());
    engine().audio.bgm.setVolume(this.getBgmVolume());
    engine().audio.sfx.setVolume(this.getSfxVolume());
  }

  /** Get overall sound volume */
  public getMasterVolume() {
    return storage.getNumber(KEY_VOLUME_MASTER) ?? 0.5;
  }

  /** Set overall sound volume */
  public setMasterVolume(value: number) {
    engine().audio.setMasterVolume(value);
    storage.setNumber(KEY_VOLUME_MASTER, value);
  }

  /** Get background music volume */
  public getBgmVolume() {
    return storage.getNumber(KEY_VOLUME_BGM) ?? 1;
  }

  /** Set background music volume */
  public setBgmVolume(value: number) {
    engine().audio.bgm.setVolume(value);
    storage.setNumber(KEY_VOLUME_BGM, value);
  }

  /** Get sound effects volume */
  public getSfxVolume() {
    return storage.getNumber(KEY_VOLUME_SFX) ?? 1;
  }

  /** Set sound effects volume */
  public setSfxVolume(value: number) {
    engine().audio.sfx.setVolume(value);
    storage.setNumber(KEY_VOLUME_SFX, value);
  }

  /** Get the player's saved display name, if they've set one before */
  public getPlayerName() {
    return storage.getString(KEY_PLAYER_NAME);
  }

  /** Set the player's display name */
  public setPlayerName(value: string) {
    storage.setString(KEY_PLAYER_NAME, value);
  }

  /** Get the player's saved color preference, if set */
  public getPlayerColor(): number | null {
    return storage.getNumber(KEY_PLAYER_COLOR) ?? null;
  }

  /** Set the player's saved color preference */
  public setPlayerColor(value: number): void {
    storage.setNumber(KEY_PLAYER_COLOR, value);
  }

  /** Get the player's saved item loadout, if they've equipped anything before */
  public getPlayerLoadout(): PlayerLoadout {
    const raw = storage.getObject(KEY_PLAYER_LOADOUT) as
      Partial<Record<"ball" | "club" | "outfit", unknown>> | undefined;
    const loadout: PlayerLoadout = {};
    if (raw && typeof raw === "object") {
      for (const slot of ["ball", "club", "outfit"] as const) {
        if (typeof raw[slot] === "string" && (raw[slot] as string).length > 0) {
          loadout[slot] = raw[slot] as string;
        }
      }
    }
    return loadout;
  }

  /** Set the player's saved item loadout */
  public setPlayerLoadout(value: PlayerLoadout): void {
    storage.setObject(KEY_PLAYER_LOADOUT, { ...value });
  }
}

/** SHared user settings instance */
export const userSettings = new UserSettings();
