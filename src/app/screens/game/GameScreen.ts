import { sound } from "@pixi/sound";
import type { Ticker } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";

import { findHittableBall } from "../../../../shared/ballPhysics";
import {
  INPUT_SEND_INTERVAL_MS,
  INTERPOLATION_DELAY_MS,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../../../shared/constants";
import {
  addToInventoryFifo,
  getItem,
  normalizeInventory,
  removeFromInventory,
  resolvePlayerColor,
  resolveStats,
} from "../../../../shared/items";
import {
  ClientMessageType,
  ServerMessageType,
} from "../../../../shared/protocol";
import type { ServerMessage } from "../../../../shared/protocol";
import { directionFromInput, stepPlayer } from "../../../../shared/simulation";
import { getTerrainAt } from "../../../../shared/terrain";
import type {
  InputState,
  ItemPickupState,
  MatchState,
  PlayerState,
  TrampolineState,
} from "../../../../shared/types";
import { BallPredictor } from "../../../net/BallPredictor";
import { resolveWsUrl } from "../../../net/config";
import { InputController } from "../../../net/InputController";
import { NetworkClient } from "../../../net/NetworkClient";
import { SnapshotInterpolator } from "../../../net/SnapshotInterpolator";
import { engine } from "../../getEngine";
import { userSettings } from "../../utils/userSettings";

import { ChatBox } from "./ChatBox";
import { CountdownBanner } from "./CountdownBanner";
import { GameMenu } from "./GameMenu";
import { InventoryPanel } from "./InventoryPanel";
import { KillBanner } from "./KillBanner";
import { MatchEndOverlay } from "./MatchEndOverlay";
import { MatchScoreboard } from "./MatchScoreboard";
import { PlayerEntity } from "./PlayerEntity";
import { StatsPanel } from "./StatsPanel";
import { WorldScene } from "./WorldScene";

/** Fraction of the local/server position gap corrected per state update */
const RECONCILE_LERP = 0.15;
/** Maximum gap between predicted and authoritative position tolerated without nudging (avoids jitter/glide from network latency and tick discretization) */
const RECONCILE_DEADBAND = 25;
/** Beyond this gap we snap instead of smoothly correcting (teleport / desync) */
const RECONCILE_SNAP_DISTANCE = 200;
/** Toggles the coords/FPS readout — Backquote, since F3 is hijacked by browser "Find" */
const DEBUG_TOGGLE_KEY = "Backquote";
/** Focuses the chat input — clicking it does the same */
const CHAT_OPEN_KEY = "KeyY";
/** Margin from the viewport edges for the chat panel, top-left */
const CHAT_MARGIN = 16;
/** Margin from the right viewport edge for the connection HUD, top-right — mirrors the chat panel on the left */
const HUD_MARGIN = 12;
/** HUD/debug text fill — light so it stays readable over the green field */
const HUD_FILL = 0xe6edf3;

/**
 * Full-screen top-down multiplayer world. The Three.js scene behind the
 * transparent Pixi overlay draws the green field and the black player dots;
 * this screen owns network/input/interpolation, prediction + reconciliation,
 * and the overlay (name labels, chat, HUD). The camera follows the local
 * (predicted) player.
 */
export class GameScreen extends Container {
  /** Assets bundles required by this screen */
  public static assetBundles: string[] = [];

  private worldScene: WorldScene | null = null;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private readonly hud: Text;
  private readonly debugText: Text;
  private readonly chatBox = new ChatBox();
  private readonly statsPanel = new StatsPanel();
  private readonly inventoryPanel = new InventoryPanel();
  private readonly killBanner = new KillBanner();
  private readonly matchScoreboard = new MatchScoreboard();
  private readonly countdownBanner = new CountdownBanner();
  private readonly matchEndOverlay = new MatchEndOverlay();
  private readonly menuButton = new Container();
  private readonly gameMenu = new GameMenu();
  private currentPlayers: PlayerState[] = [];
  private currentMatch: MatchState | null = null;

  private readonly network = new NetworkClient(resolveWsUrl());
  private readonly input = new InputController();
  private readonly interpolator = new SnapshotInterpolator(
    INTERPOLATION_DELAY_MS,
  );
  private trampolines: TrampolineState[] = [];
  private readonly ballPredictor = new BallPredictor();
  private pickups: ItemPickupState[] = [];
  private readonly pickupLabels = new Map<string, Text>();

  private readonly entities = new Map<string, PlayerEntity>();
  private localId: string | null = null;
  private localState: PlayerState | null = null;
  private lastPersistedInventory = "";
  private debugEnabled = false;

  private unsubscribeMessage: (() => void) | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private connected = false;
  private playerCount = 0;
  private sendAccumulatorMs = 0;
  private updateFrames = 0;
  private lastStateAt = 0;
  private warnedNoLocalState = false;

  private readonly previousBallHitSeqs = new Map<string, number>();

  constructor() {
    super();
    this.sortableChildren = true;

    // Anchored top-right (right-aligned) since the chat panel now occupies the top-left
    this.hud = new Text({
      text: "connecting…",
      style: { fontFamily: "monospace", fontSize: 14, fill: HUD_FILL },
    });
    this.hud.anchor.set(1, 0);
    this.hud.zIndex = 80;
    this.addChild(this.hud);

    this.debugText = new Text({
      text: "",
      style: { fontFamily: "monospace", fontSize: 14, fill: HUD_FILL },
    });
    this.debugText.anchor.set(1, 0);
    this.debugText.visible = false;
    this.debugText.zIndex = 80;
    this.addChild(this.debugText);

    this.statsPanel.zIndex = 90;
    this.addChild(this.statsPanel);

    this.inventoryPanel.zIndex = 90;
    this.addChild(this.inventoryPanel);

    this.matchScoreboard.zIndex = 85;
    this.addChild(this.matchScoreboard);

    this.countdownBanner.zIndex = 95;
    this.addChild(this.countdownBanner);

    this.matchEndOverlay.zIndex = 160;
    this.matchEndOverlay.onRematch = () => {
      this.network.send({ type: ClientMessageType.Rematch });
    };
    this.matchEndOverlay.onLeave = () => {
      window.location.href = window.location.pathname;
    };
    this.addChild(this.matchEndOverlay);

    // Clickable Menu HUD button
    this.menuButton.eventMode = "static";
    this.menuButton.cursor = "pointer";
    this.drawMenuButton(false);
    const menuBtnText = new Text({
      text: "⚙ MENU (ESC)",
      style: {
        fontFamily: "monospace",
        fontSize: 12,
        fontWeight: "bold",
        fill: 0xe6edf3,
      },
    });
    menuBtnText.anchor.set(0.5);
    menuBtnText.position.set(75, 16);
    this.menuButton.addChild(menuBtnText);

    this.menuButton.on("pointerenter", () => this.drawMenuButton(true));
    this.menuButton.on("pointerleave", () => this.drawMenuButton(false));
    this.menuButton.on("pointertap", () => this.toggleMenu());
    this.menuButton.zIndex = 90;
    this.addChild(this.menuButton);

    this.chatBox.zIndex = 80;
    this.chatBox.onSend = (text) => {
      this.network.send({ type: ClientMessageType.Chat, text });
    };
    this.addChild(this.chatBox);

    this.killBanner.zIndex = 100;
    this.addChild(this.killBanner);

    this.gameMenu.zIndex = 150;
    this.gameMenu.onSelectColor = (color) => {
      userSettings.setPlayerColor(color);
      this.network.send({ type: ClientMessageType.SetColor, color });
      if (this.localState) {
        this.localState.color = color;
      }
      if (this.localId) {
        this.entities.get(this.localId)?.setColor(color);
        this.worldScene?.setColor(this.localId, color);
      }
    };
    this.gameMenu.onClose = () => {
      this.input.setEnabled(!this.chatBox.editing);
    };
    this.gameMenu.onEquipItem = (slot, itemId) => {
      if (itemId) {
        this.network.send({
          type: ClientMessageType.EquipItem,
          slot,
          itemId,
        });
      } else {
        this.network.send({ type: ClientMessageType.UnequipItem, slot });
      }
      const next = { ...(this.localState?.loadout ?? {}) };
      let inv = normalizeInventory(
        this.localState?.inventory ?? userSettings.getPlayerInventory(),
      );
      if (itemId) {
        // Mirror the server FIFO so the HUD never flickers on full.
        const result = addToInventoryFifo(inv, itemId);
        inv = result.inventory;
        if (result.evicted !== undefined) {
          const evictedDef = getItem(result.evicted);
          if (evictedDef && next[evictedDef.slot] === result.evicted) {
            delete next[evictedDef.slot];
          }
        }
        next[slot] = itemId;
      } else {
        delete next[slot];
      }
      if (this.localState) {
        this.localState.loadout = next;
        this.localState.inventory = inv;
      }
      userSettings.setPlayerLoadout(next);
      this.persistInventory(inv);
      this.gameMenu.setInventory(inv);
      this.inventoryPanel.setInventory(inv, next);
    };
    this.gameMenu.onDropItem = (itemId) => {
      this.network.send({ type: ClientMessageType.DropItem, itemId });
      const def = getItem(itemId);
      const inv = removeFromInventory(
        normalizeInventory(
          this.localState?.inventory ?? userSettings.getPlayerInventory(),
        ),
        itemId,
      );
      const next = { ...(this.localState?.loadout ?? {}) };
      if (def && next[def.slot] === itemId) {
        delete next[def.slot];
      }
      if (this.localState) {
        this.localState.loadout = next;
        this.localState.inventory = inv;
      }
      userSettings.setPlayerLoadout(next);
      this.persistInventory(inv);
      this.gameMenu.setLoadout(next);
      this.gameMenu.setInventory(inv);
      this.inventoryPanel.setInventory(inv, next);
    };
    this.addChild(this.gameMenu);
  }

  private drawMenuButton(hovered: boolean): void {
    let bg = this.menuButton.getChildByName("menuBg") as Graphics | null;
    if (!bg) {
      bg = new Graphics();
      bg.name = "menuBg";
      this.menuButton.addChildAt(bg, 0);
    }
    bg.clear();
    bg.roundRect(0, 0, 150, 32, 6);
    if (hovered) {
      bg.fill({ color: 0x21262d, alpha: 0.95 });
      bg.stroke({ color: 0x58a6ff, width: 1.5 });
    } else {
      bg.fill({ color: 0x0d1117, alpha: 0.85 });
      bg.stroke({ color: 0x30363d, width: 1.5 });
    }
  }

  /** Called by Navigation right after the screen is added to the stage */
  public prepare(): void {
    console.info(`[golfi:game] prepare, ws=${resolveWsUrl()}`);

    // Register audio effects if not already present
    if (!sound.exists("card-place-3")) {
      sound.add("card-place-3", {
        url: "/sounds/casino/Audio/card-place-3.ogg",
        preload: true,
      });
      sound.add("hit-player", {
        url: "/sounds/casino/Audio/card-place-3.ogg",
        preload: true,
      });
    }
    if (!sound.exists("card-slide-2")) {
      sound.add("card-slide-2", {
        url: "/sounds/casino/Audio/card-slide-2.ogg",
        preload: true,
      });
      sound.add("hit-ball", {
        url: "/sounds/casino/Audio/card-slide-2.ogg",
        preload: true,
      });
    }

    const initialWidth = engine()?.renderer?.width ?? VIEWBOX_WIDTH;
    const initialHeight = engine()?.renderer?.height ?? VIEWBOX_HEIGHT;
    this.viewportWidth = initialWidth;
    this.viewportHeight = initialHeight;
    this.killBanner.reposition(initialWidth, initialHeight);
    this.statsPanel.reposition(initialWidth, HUD_MARGIN, 36);
    this.matchScoreboard.reposition(initialWidth);
    this.countdownBanner.reposition(initialWidth, initialHeight);
    this.matchEndOverlay.reposition(initialWidth, initialHeight);
    this.worldScene = new WorldScene();
    this.worldScene.setSize(initialWidth, initialHeight);
    this.inventoryPanel.reposition(initialWidth, initialHeight, HUD_MARGIN);
    this.inventoryPanel.setInventory(
      userSettings.getPlayerInventory(),
      userSettings.getPlayerLoadout(),
    );
    this.input.onChange = (newInput) => {
      this.sendInput(newInput);
    };
    this.unsubscribeMessage = this.network.onMessage((message) =>
      this.handleServerMessage(message),
    );
    this.unsubscribeConnection = this.network.onConnectionChange(
      (connected) => {
        console.info(`[golfi:game] connection ${connected ? "up" : "down"}`);
        this.connected = connected;
        if (connected) {
          const savedColor = userSettings.getPlayerColor();
          this.network.send({
            type: ClientMessageType.Join,
            name: userSettings.getPlayerName() ?? "Player",
            ...(savedColor !== null ? { color: savedColor } : {}),
          });
        }
      },
    );
    this.network.connect();
    window.addEventListener("keydown", this.onKeyDown);
  }

  public update(ticker: Ticker): void {
    if (!this.worldScene) return;
    this.updateFrames++;
    if (this.updateFrames === 1) {
      console.info("[golfi:game] first update tick");
    }
    if (!this.localState && !this.warnedNoLocalState) {
      this.warnedNoLocalState = true;
      console.warn(
        "[golfi:game] no local player yet (waiting for Welcome) — camera parked at world center",
      );
    }
    this.input.setEnabled(!this.chatBox.editing && !this.gameMenu.isOpen);
    const dtSeconds = ticker.deltaMS / 1000;
    const currentInput = this.input.get();

    if (currentInput.charging && this.localState) {
      const { sx, sy } = this.worldScene.project(
        this.localState.x,
        this.localState.y,
      );
      const mx = this.input.pointerX;
      const my = this.input.pointerY;
      const dx = mx - sx;
      const dy = my - sy;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        currentInput.aimDx = dx / dist;
        currentInput.aimDy = dy / dist;
      }
    }

    const isMoving = directionFromInput(currentInput) !== null;

    const localStats = this.localState
      ? resolveStats(this.localState.loadout)
      : undefined;
    if (this.localState) {
      // Client-side prediction: move immediately using the same simulation
      // step the server runs, then gently reconciled in reconcileLocalPlayer().
      stepPlayer(
        this.localState,
        currentInput,
        dtSeconds,
        this.trampolines,
        localStats,
      );
      const localKnockedDown = (this.localState.knockdownTimer ?? 0) > 0;
      this.worldScene.setKnockdown(this.localState.id, localKnockedDown);
      this.entities.get(this.localState.id)?.setKnockedDown(localKnockedDown);
      this.worldScene.move(
        this.localState.id,
        this.localState.x,
        this.localState.y,
        isMoving,
        this.localState.facingX,
        this.localState.facingY,
        this.localState.z,
        localStats?.playerRadiusMult ?? 1,
      );
      this.worldScene.setSwing(
        this.localState.id,
        this.localState.charge ?? 0,
        this.localState.swingPower ?? 0,
        this.localState.swingSeq ?? 0,
        dtSeconds,
      );
      this.placeLabel(
        this.localState.id,
        this.localState.x,
        this.localState.y,
        this.localState.z ?? 0,
      );
      this.entities
        .get(this.localState.id)
        ?.setSwingCharge(
          this.localState.charge ?? 0,
          this.localState.swingPower ?? 0,
          this.localState.swingSeq ?? 0,
          this.localState.spinCharge ?? 0,
          this.localState.swingSpin ?? 0,
        );
    }

    for (const [id] of this.entities) {
      if (id === this.localId) continue;
      const sample = this.interpolator.sample(id);
      if (sample) {
        const remoteKnockedDown = (sample.knockdownTimer ?? 0) > 0;
        this.worldScene.setKnockdown(id, remoteKnockedDown);
        this.entities.get(id)?.setKnockedDown(remoteKnockedDown);
        const remoteStats = resolveStats(sample.loadout);
        this.worldScene.move(
          id,
          sample.x,
          sample.y,
          undefined,
          sample.facingX,
          sample.facingY,
          sample.z,
          remoteStats.playerRadiusMult,
        );
        this.worldScene.setSwing(
          id,
          sample.charge ?? 0,
          sample.swingPower ?? 0,
          sample.swingSeq ?? 0,
          dtSeconds,
        );
        this.placeLabel(id, sample.x, sample.y, sample.z ?? 0);
        this.entities
          .get(id)
          ?.setSwingCharge(
            sample.charge ?? 0,
            sample.swingPower ?? 0,
            sample.swingSeq ?? 0,
            sample.spinCharge ?? 0,
            sample.swingSpin ?? 0,
          );
      }
    }

    this.ballPredictor.update(dtSeconds, this.trampolines);
    this.worldScene.syncBalls(this.ballPredictor.getBalls());

    const hittable = this.localState
      ? findHittableBall(
          this.localState,
          this.ballPredictor.getSimBalls(),
          0,
          localStats,
        ) !== null
      : false;
    this.worldScene.updateLocalIndicators(
      this.localState,
      hittable,
      localStats,
    );

    if (this.localState) {
      this.worldScene.render(this.localState.x, this.localState.y, dtSeconds);
    } else {
      this.worldScene.render(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, dtSeconds);
    }
    this.positionPickupLabels();

    this.sendAccumulatorMs += ticker.deltaMS;
    if (this.sendAccumulatorMs >= INPUT_SEND_INTERVAL_MS) {
      this.sendInput(currentInput);
    }

    if (this.updateFrames % 300 === 0) {
      const x = this.localState?.x.toFixed(0) ?? "-";
      const y = this.localState?.y.toFixed(0) ?? "-";
      console.debug(
        `[golfi:game] heartbeat frame=${this.updateFrames} connected=${this.connected} players=${this.playerCount} entities=${this.entities.size} local=(${x},${y})`,
      );
    }

    this.hud.text = `${this.connected ? "connected" : "reconnecting…"} · ${this.playerCount} player${this.playerCount === 1 ? "" : "s"}`;
    this.killBanner.update(dtSeconds);
    this.matchScoreboard.update(dtSeconds);
    this.countdownBanner.update(dtSeconds);

    if (this.debugEnabled) {
      const x = this.localState?.x ?? 0;
      const y = this.localState?.y ?? 0;
      const terrain = this.localState ? getTerrainAt(x, y) : "none";
      this.debugText.text = `fps ${ticker.FPS.toFixed(0)} · x ${x.toFixed(1)} y ${y.toFixed(1)} · [${terrain.toUpperCase()}]`;
    }
  }

  /** Resize the screen, fired whenever window size changes */
  public resize(
    width: number = VIEWBOX_WIDTH,
    height: number = VIEWBOX_HEIGHT,
  ): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.chatBox.position.set(CHAT_MARGIN, CHAT_MARGIN);
    this.hud.position.set(width - HUD_MARGIN, 10);
    this.statsPanel.reposition(width, HUD_MARGIN, 36);
    this.inventoryPanel.reposition(width, height, HUD_MARGIN);
    this.matchScoreboard.reposition(width);
    this.countdownBanner.reposition(width, height);
    this.matchEndOverlay.reposition(width, height);
    this.menuButton.position.set(width - HUD_MARGIN - 150, 108);
    this.debugText.position.set(width - HUD_MARGIN, 150);
    this.killBanner.reposition(width, height);
    this.gameMenu.resize(width, height);
    this.worldScene?.setSize(width, height);
  }

  /** Fully reset — the screen instance may be pooled and reused */
  public reset(): void {
    console.info("[golfi:game] reset");
    this.unsubscribeMessage?.();
    this.unsubscribeConnection?.();
    this.network.disconnect();
    this.input.destroy();
    window.removeEventListener("keydown", this.onKeyDown);

    for (const entity of this.entities.values()) entity.destroy();
    this.entities.clear();
    this.interpolator.clear();
    this.ballPredictor.clear();
    this.clearPickupLabels();

    this.worldScene?.destroy();
    this.worldScene = null;

    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.localId = null;
    this.localState = null;
    this.lastPersistedInventory = "";
    this.lastMenuSyncKey = "";
    this.playerCount = 0;
    this.connected = false;
    this.debugEnabled = false;
    this.debugText.visible = false;
    this.statsPanel.setStats(0, 0);
    this.gameMenu.close();
    this.currentPlayers = [];
    this.currentMatch = null;
    this.matchEndOverlay.hide();
  }

  private toggleMenu(): void {
    const list =
      this.currentPlayers.length > 0
        ? this.currentPlayers
        : this.localState
          ? [this.localState]
          : [];
    this.gameMenu.toggle(
      this.localId,
      this.localState?.color ?? userSettings.getPlayerColor() ?? undefined,
      list,
      this.localState?.loadout ?? userSettings.getPlayerLoadout(),
      this.localState?.inventory ?? userSettings.getPlayerInventory(),
    );
    this.lastMenuSyncKey = "";
    this.input.setEnabled(!this.chatBox.editing && !this.gameMenu.isOpen);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Escape") {
      if (this.chatBox.editing) return;
      event.preventDefault();
      this.toggleMenu();
      return;
    }

    if (event.code === CHAT_OPEN_KEY) {
      if (this.chatBox.editing || this.gameMenu.isOpen) return; // typing "y" into a message — don't re-trigger
      event.preventDefault();
      this.chatBox.focus();
      return;
    }

    if (event.code !== DEBUG_TOGGLE_KEY) return;
    if (this.chatBox.editing || this.gameMenu.isOpen) return; // typing "`" into a message
    event.preventDefault();
    this.debugEnabled = !this.debugEnabled;
    this.debugText.visible = this.debugEnabled;
  };

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case ServerMessageType.Welcome: {
        // A reconnect issues a new player id, so stale entities and buffered
        // snapshots from the previous session would otherwise linger as
        // ghosts — start from a clean slate on every Welcome.
        console.info(
          `[golfi:game] welcome id=${message.id} players=${message.players.length} balls=${message.balls.length} world=${message.world.width}x${message.world.height} tick=${message.tickRateHz}Hz`,
        );
        this.clearWorldState();
        this.warnedNoLocalState = false;
        this.localId = message.id;
        this.previousBallHitSeqs.clear();
        for (const ball of message.balls) {
          this.previousBallHitSeqs.set(ball.id, ball.hitSeq);
        }
        this.trampolines = message.trampolines;
        // Older servers don't send pickups yet — default instead of crashing.
        this.pickups = message.pickups ?? [];
        this.ballPredictor.onSnapshot(message.balls);
        this.worldScene?.syncBalls(this.ballPredictor.getBalls());
        this.worldScene?.syncHoles(message.holes);
        this.worldScene?.syncTrampolines(message.trampolines);
        this.worldScene?.syncPickups(this.pickups);
        this.syncPickupLabels();
        for (const player of message.players) {
          this.spawnEntity(player);
        }
        this.localState =
          message.players.find((p) => p.id === this.localId) ?? null;
        if (this.localState) {
          console.info(
            `[golfi:game] local spawn at (${this.localState.x.toFixed(0)}, ${this.localState.y.toFixed(0)})`,
          );
        } else {
          console.warn("[golfi:game] welcome missing local player entry");
        }
        this.currentPlayers = message.players;
        this.playerCount = message.players.length;
        // Reconnects get a fresh server-side inventory — restore spares
        // first, then the equipped loadout, so the server FIFO rebuilds the
        // same owned set without evicting anything.
        const savedLoadout = userSettings.getPlayerLoadout();
        const savedInventory = userSettings.getPlayerInventory();
        const loadoutIds = (["ball", "club", "outfit"] as const).map(
          (slot) => savedLoadout[slot],
        );
        const spares = savedInventory.filter((id) => !loadoutIds.includes(id));
        let restoredInv: string[] = [];
        const restoreEquip = (itemId: string): void => {
          const def = getItem(itemId);
          if (!def) return;
          this.network.send({
            type: ClientMessageType.EquipItem,
            slot: def.slot,
            itemId,
          });
          restoredInv = addToInventoryFifo(restoredInv, itemId).inventory;
        };
        for (const itemId of spares) restoreEquip(itemId);
        for (const slot of ["ball", "club", "outfit"] as const) {
          const itemId = savedLoadout[slot];
          if (itemId) restoreEquip(itemId);
        }
        if (this.localState && restoredInv.length > 0) {
          this.localState.loadout = { ...savedLoadout };
          this.localState.inventory = restoredInv;
        }
        this.persistInventory(this.localState?.inventory ?? restoredInv);
        this.gameMenu.setLoadout(this.localState?.loadout ?? savedLoadout);
        this.gameMenu.setInventory(this.localState?.inventory ?? restoredInv);
        this.inventoryPanel.setInventory(
          this.localState?.inventory ?? restoredInv,
          this.localState?.loadout ?? savedLoadout,
        );
        this.currentMatch = message.match;
        this.matchScoreboard.setMatch(message.match, this.localId);
        this.countdownBanner.setCountdown(message.match.countdownSeconds);
        if (message.match.status === "finished") {
          this.matchEndOverlay.showMatchEnd(message.match, this.localId);
        } else {
          this.matchEndOverlay.hide();
        }
        this.statsPanel.setStats(
          this.localState?.frags ?? 0,
          this.localState?.holes ?? 0,
        );
        this.gameMenu.updatePlayers(
          this.currentPlayers,
          this.localId,
          this.localState?.color ?? userSettings.getPlayerColor() ?? undefined,
        );
        break;
      }

      case ServerMessageType.PlayerJoined:
        console.info(
          `[golfi:game] player joined ${message.player.id} "${message.player.name}" at (${message.player.x.toFixed(0)}, ${message.player.y.toFixed(0)})`,
        );
        this.currentPlayers.push(message.player);
        this.gameMenu.updatePlayers(
          this.currentPlayers,
          this.localId,
          this.localState?.color ?? userSettings.getPlayerColor() ?? undefined,
        );
        this.spawnEntity(message.player);
        this.playerCount = this.entities.size;
        break;

      case ServerMessageType.PlayerLeft: {
        const known = this.entities.has(message.id);
        console.info(`[golfi:game] player left ${message.id} (known=${known})`);
        this.currentPlayers = this.currentPlayers.filter(
          (p) => p.id !== message.id,
        );
        this.gameMenu.updatePlayers(
          this.currentPlayers,
          this.localId,
          this.localState?.color ?? userSettings.getPlayerColor() ?? undefined,
        );
        this.entities.get(message.id)?.destroy();
        this.entities.delete(message.id);
        this.worldScene?.remove(message.id);
        this.playerCount = this.entities.size;
        break;
      }

      case ServerMessageType.State: {
        const now = performance.now();
        if (now - this.lastStateAt > 5000) {
          console.debug(
            `[golfi:game] state flowing: ${message.players.length} players, ${message.balls.length} balls`,
          );
        }
        this.lastStateAt = now;
        this.currentPlayers = message.players;
        if (this.gameMenu.isOpen) {
          this.gameMenu.updatePlayers(
            this.currentPlayers,
            this.localId,
            this.localState?.color ??
              userSettings.getPlayerColor() ??
              undefined,
          );
          this.syncMenuLoadout();
        }
        this.interpolator.push(message.players);

        // Detect ball strikes: trigger sound if any ball's hitSeq incremented into flight/motion
        for (const ball of message.balls) {
          const prevSeq = this.previousBallHitSeqs.get(ball.id);
          if (prevSeq !== undefined && ball.hitSeq > prevSeq && !ball.resting) {
            this.playSound("card-slide-2");
          }
          this.previousBallHitSeqs.set(ball.id, ball.hitSeq);
        }

        this.trampolines = message.trampolines;
        // Older servers don't send pickups yet — default instead of crashing.
        this.pickups = message.pickups ?? [];
        this.ballPredictor.onSnapshot(message.balls);
        this.worldScene?.syncHoles(message.holes);
        this.worldScene?.syncTrampolines(message.trampolines);
        this.worldScene?.syncPickups(this.pickups);
        this.syncPickupLabels();
        this.reconcileLocalPlayer(message.players);
        // Names aren't part of the predicted/interpolated movement path —
        // the local player's Join (sent right after connect) always lands
        // after the server's initial Welcome/PlayerJoined snapshot, so the
        // real name only shows up once it comes back through a state tick.
        for (const player of message.players) {
          const entity = this.entities.get(player.id);
          const stats = resolveStats(player.loadout);
          const effectiveColor = resolvePlayerColor(stats, player.color);
          if (entity) {
            entity.setName(player.name);
            entity.setColor(effectiveColor);
            this.worldScene?.setColor(player.id, effectiveColor);
          }
          if (player.id === this.localId && this.localState) {
            this.localState.color = player.color;
            this.localState.loadout = player.loadout
              ? { ...player.loadout }
              : undefined;
            // Walk-over pickups land here: mirror server truth into the HUD.
            this.localState.inventory = normalizeInventory(player.inventory);
            this.persistInventory(this.localState.inventory);
            this.inventoryPanel.setInventory(
              this.localState.inventory,
              this.localState.loadout,
            );
            this.syncMenuLoadout();
          }
        }
        break;
      }

      case ServerMessageType.Chat:
        this.chatBox.receive({ name: message.name, text: message.text });
        this.entities.get(message.id)?.showChatBubble(message.text);
        break;

      case ServerMessageType.Kill: {
        this.playSound("card-place-3");
        if (message.killerId === this.localId) {
          this.killBanner.show(message.victimName);
          if (this.localState) {
            this.localState.frags = (this.localState.frags ?? 0) + 1;
            this.statsPanel.setStats(
              this.localState.frags,
              this.localState.holes ?? 0,
            );
          }
        }
        break;
      }

      case ServerMessageType.HoleScored: {
        if (message.playerId === this.localId) {
          if (this.localState) {
            this.localState.holes = (this.localState.holes ?? 0) + 1;
            this.statsPanel.setStats(
              this.localState.frags ?? 0,
              this.localState.holes,
            );
          }
        }
        break;
      }

      case ServerMessageType.MatchState: {
        const prevStatus = this.currentMatch?.status;
        this.currentMatch = message.match;
        this.matchScoreboard.setMatch(message.match, this.localId);
        this.countdownBanner.setCountdown(message.match.countdownSeconds);

        if (prevStatus === "countdown" && message.match.status === "playing") {
          this.playSound("card-place-3");
          this.countdownBanner.triggerMatchStart();
        }

        if (message.match.status === "finished") {
          this.matchEndOverlay.showMatchEnd(message.match, this.localId);
        } else {
          this.matchEndOverlay.hide();
        }
        break;
      }
    }
  }

  private playSound(alias: string): void {
    try {
      engine()?.audio?.sfx?.play(alias);
    } catch (err) {
      console.warn(`[golfi:audio] failed to play sound "${alias}":`, err);
    }
  }

  /** Persists the inventory only when it actually changed (ticks run at 20Hz) */
  private persistInventory(inv: readonly string[]): void {
    const key = inv.join(",");
    if (key === this.lastPersistedInventory) return;
    this.lastPersistedInventory = key;
    userSettings.setPlayerInventory(inv);
  }

  /**
   * Pushes loadout + inventory into the open menu, but only when something
   * actually changed — State ticks run at 20Hz and a rebuild per tick would
   * stutter the items list.
   */
  private lastMenuSyncKey = "";
  private syncMenuLoadout(): void {
    if (!this.gameMenu.isOpen) return;
    const loadout = this.localState?.loadout ?? {};
    const inv = this.localState?.inventory ?? [];
    const key = `${loadout.ball ?? ""},${loadout.club ?? ""},${loadout.outfit ?? ""}|${inv.join(",")}`;
    if (key === this.lastMenuSyncKey) return;
    this.lastMenuSyncKey = key;
    this.gameMenu.setLoadout(loadout);
    this.gameMenu.setInventory(inv);
  }

  private spawnEntity(snapshot: PlayerState): void {
    if (this.entities.has(snapshot.id)) return;
    console.debug(
      `[golfi:game] spawn entity ${snapshot.id} "${snapshot.name}" at (${snapshot.x.toFixed(0)}, ${snapshot.y.toFixed(0)})`,
    );
    const entity = new PlayerEntity(snapshot);
    entity.zIndex = 10;
    this.entities.set(snapshot.id, entity);
    this.addChild(entity);
    const effectiveColor = resolvePlayerColor(
      resolveStats(snapshot.loadout),
      snapshot.color,
    );
    this.worldScene?.spawn(snapshot.id, snapshot.x, snapshot.y, effectiveColor);
    this.placeLabel(snapshot.id, snapshot.x, snapshot.y);
  }

  /** Drops all per-session world state (entities, interpolation history,
   *  local prediction) — used on Welcome and on full reset. */
  private clearWorldState(): void {
    this.previousBallHitSeqs.clear();
    for (const entity of this.entities.values()) entity.destroy();
    this.entities.clear();
    this.interpolator.clear();
    this.ballPredictor.clear();
    this.clearPickupLabels();
    this.worldScene?.clear();
    this.inventoryPanel.setInventory([], {});
    this.localState = null;
    this.currentPlayers = [];
  }

  /** Creates a floating effect label per pickup, drops labels for gone ones */
  private syncPickupLabels(): void {
    const alive = new Set(this.pickups.map((p) => p.id));
    for (const [id, label] of this.pickupLabels) {
      if (!alive.has(id)) {
        label.destroy();
        this.pickupLabels.delete(id);
      }
    }
    for (const pickup of this.pickups) {
      if (this.pickupLabels.has(pickup.id)) continue;
      const item = getItem(pickup.itemId);
      const label = new Text({
        text: `${item?.name ?? pickup.itemId}\n${item?.description ?? ""}`,
        style: {
          fontFamily: "monospace",
          fontSize: 12,
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 3 },
          align: "center",
        },
      });
      label.anchor.set(0.5);
      label.zIndex = 9;
      this.pickupLabels.set(pickup.id, label);
      this.addChild(label);
    }
  }

  /** Pins each pickup label above its circle in screen space */
  private positionPickupLabels(): void {
    if (!this.worldScene) return;
    for (const pickup of this.pickups) {
      const label = this.pickupLabels.get(pickup.id);
      if (!label) continue;
      const { sx, sy } = this.worldScene.project(pickup.x, pickup.y);
      label.position.set(sx, sy - 46);
    }
  }

  private clearPickupLabels(): void {
    for (const label of this.pickupLabels.values()) label.destroy();
    this.pickupLabels.clear();
    this.pickups = [];
  }

  /** Positions a player's overlay label from its world position */
  private placeLabel(id: string, x: number, y: number, z: number = 0): void {
    if (!this.worldScene) return;
    let { sx, sy } = this.worldScene.project(x, y, z);

    const isLocal = id === this.localId;
    let isOffScreen = false;
    let angle = 0;

    if (!isLocal) {
      const padding = 20;
      const w = this.viewportWidth || VIEWBOX_WIDTH;
      const h = this.viewportHeight || VIEWBOX_HEIGHT;

      const cw = w / 2;
      const ch = h / 2;
      const vx = sx - cw;
      const vy = sy - ch;

      if (Math.abs(vx) > cw - padding || Math.abs(vy) > ch - padding) {
        isOffScreen = true;
        angle = Math.atan2(vy, vx);

        const tx = (cw - padding) / (Math.abs(vx) || 1);
        const ty = (ch - padding) / (Math.abs(vy) || 1);
        const t = Math.min(tx, ty);

        sx = cw + vx * t;
        sy = ch + vy * t;
      }
    }

    this.entities.get(id)?.setScreenPosition(sx, sy, isOffScreen, angle);
  }

  private sendInput(input: InputState): void {
    this.sendAccumulatorMs = 0;
    this.network.send({
      type: ClientMessageType.Input,
      seq: this.network.nextSeq(),
      input,
    });
  }

  /** Softly pulls the predicted local player back toward the server's authoritative position */
  private reconcileLocalPlayer(players: PlayerState[]): void {
    if (!this.localState || !this.localId) return;
    const authoritative = players.find((p) => p.id === this.localId);
    if (!authoritative) return;

    if (authoritative.knockdownTimer !== undefined) {
      this.localState.knockdownTimer = authoritative.knockdownTimer;
    }
    if (authoritative.frags !== undefined) {
      this.localState.frags = authoritative.frags;
    }
    if (authoritative.holes !== undefined) {
      this.localState.holes = authoritative.holes;
    }
    this.statsPanel.setStats(
      this.localState.frags ?? 0,
      this.localState.holes ?? 0,
    );

    const dx = authoritative.x - this.localState.x;
    const dy = authoritative.y - this.localState.y;
    const distance = Math.hypot(dx, dy);

    if (distance > RECONCILE_SNAP_DISTANCE) {
      console.warn(
        `[golfi:game] reconcile SNAP gap=${distance.toFixed(0)} predicted=(${this.localState.x.toFixed(0)}, ${this.localState.y.toFixed(0)}) auth=(${authoritative.x.toFixed(0)}, ${authoritative.y.toFixed(0)})`,
      );
      this.localState.x = authoritative.x;
      this.localState.y = authoritative.y;
    } else if (distance > RECONCILE_DEADBAND) {
      this.localState.x += dx * RECONCILE_LERP;
      this.localState.y += dy * RECONCILE_LERP;
    }
  }
}
