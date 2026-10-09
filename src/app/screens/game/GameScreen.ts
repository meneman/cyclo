import { sound } from "@pixi/sound";
import type { Ticker } from "pixi.js";
import { Container, Text } from "pixi.js";

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
  ClientMessageType,
  ServerMessageType,
} from "../../../../shared/protocol";
import type { ServerMessage } from "../../../../shared/protocol";
import { directionFromInput, stepPlayer } from "../../../../shared/simulation";
import { getTerrainAt } from "../../../../shared/terrain";
import type { InputState, PlayerState } from "../../../../shared/types";
import { BallPredictor } from "../../../net/BallPredictor";
import { resolveWsUrl } from "../../../net/config";
import { InputController } from "../../../net/InputController";
import { NetworkClient } from "../../../net/NetworkClient";
import { SnapshotInterpolator } from "../../../net/SnapshotInterpolator";
import { engine } from "../../getEngine";
import { userSettings } from "../../utils/userSettings";

import { ChatBox } from "./ChatBox";
import { KillBanner } from "./KillBanner";
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
  private readonly killBanner = new KillBanner();

  private readonly network = new NetworkClient(resolveWsUrl());
  private readonly input = new InputController();
  private readonly interpolator = new SnapshotInterpolator(
    INTERPOLATION_DELAY_MS,
  );
  private readonly ballPredictor = new BallPredictor();

  private readonly entities = new Map<string, PlayerEntity>();
  private localId: string | null = null;
  private localState: PlayerState | null = null;
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

    this.chatBox.zIndex = 80;
    this.chatBox.onSend = (text) => {
      this.network.send({ type: ClientMessageType.Chat, text });
    };
    this.addChild(this.chatBox);

    this.killBanner.zIndex = 100;
    this.addChild(this.killBanner);
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
    this.worldScene = new WorldScene();
    this.worldScene.setSize(initialWidth, initialHeight);
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
          this.network.send({
            type: ClientMessageType.Join,
            name: userSettings.getPlayerName() ?? "Player",
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
    this.input.setEnabled(!this.chatBox.editing);
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

    if (this.localState) {
      // Client-side prediction: move immediately using the same simulation
      // step the server runs, then gently reconciled in reconcileLocalPlayer().
      stepPlayer(this.localState, currentInput, dtSeconds);
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
      );
      this.worldScene.setSwing(
        this.localState.id,
        this.localState.charge ?? 0,
        this.localState.swingPower ?? 0,
        this.localState.swingSeq ?? 0,
        dtSeconds,
      );
      this.placeLabel(this.localState.id, this.localState.x, this.localState.y);
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
        this.worldScene.move(
          id,
          sample.x,
          sample.y,
          undefined,
          sample.facingX,
          sample.facingY,
        );
        this.worldScene.setSwing(
          id,
          sample.charge ?? 0,
          sample.swingPower ?? 0,
          sample.swingSeq ?? 0,
          dtSeconds,
        );
        this.placeLabel(id, sample.x, sample.y);
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

    this.ballPredictor.update(dtSeconds);
    this.worldScene.syncBalls(this.ballPredictor.getBalls());

    const hittable = this.localState
      ? findHittableBall(this.localState, this.ballPredictor.getSimBalls()) !==
        null
      : false;
    this.worldScene.updateLocalIndicators(this.localState, hittable);

    if (this.localState) {
      this.worldScene.render(this.localState.x, this.localState.y, dtSeconds);
    } else {
      this.worldScene.render(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, dtSeconds);
    }

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
    this.debugText.position.set(width - HUD_MARGIN, 108);
    this.killBanner.reposition(width, height);
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

    this.worldScene?.destroy();
    this.worldScene = null;

    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.localId = null;
    this.localState = null;
    this.playerCount = 0;
    this.connected = false;
    this.debugEnabled = false;
    this.debugText.visible = false;
    this.statsPanel.setStats(0, 0);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === CHAT_OPEN_KEY) {
      if (this.chatBox.editing) return; // typing "y" into a message — don't re-trigger
      event.preventDefault();
      this.chatBox.focus();
      return;
    }

    if (event.code !== DEBUG_TOGGLE_KEY) return;
    if (this.chatBox.editing) return; // typing "`" into a message
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
        this.ballPredictor.onSnapshot(message.balls);
        this.worldScene?.syncBalls(this.ballPredictor.getBalls());
        this.worldScene?.syncHoles(message.holes);
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
        this.playerCount = message.players.length;
        this.statsPanel.setStats(
          this.localState?.frags ?? 0,
          this.localState?.holes ?? 0,
        );
        break;
      }

      case ServerMessageType.PlayerJoined:
        console.info(
          `[golfi:game] player joined ${message.player.id} "${message.player.name}" at (${message.player.x.toFixed(0)}, ${message.player.y.toFixed(0)})`,
        );
        this.spawnEntity(message.player);
        this.playerCount = this.entities.size;
        break;

      case ServerMessageType.PlayerLeft: {
        const known = this.entities.has(message.id);
        console.info(`[golfi:game] player left ${message.id} (known=${known})`);
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
        this.interpolator.push(message.players);

        // Detect ball strikes: trigger sound if any ball's hitSeq incremented into flight/motion
        for (const ball of message.balls) {
          const prevSeq = this.previousBallHitSeqs.get(ball.id);
          if (prevSeq !== undefined && ball.hitSeq > prevSeq && !ball.resting) {
            this.playSound("card-slide-2");
          }
          this.previousBallHitSeqs.set(ball.id, ball.hitSeq);
        }

        this.ballPredictor.onSnapshot(message.balls);
        this.worldScene?.syncHoles(message.holes);
        this.reconcileLocalPlayer(message.players);
        // Names aren't part of the predicted/interpolated movement path —
        // the local player's Join (sent right after connect) always lands
        // after the server's initial Welcome/PlayerJoined snapshot, so the
        // real name only shows up once it comes back through a state tick.
        for (const player of message.players) {
          this.entities.get(player.id)?.setName(player.name);
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
    }
  }

  private playSound(alias: string): void {
    try {
      engine()?.audio?.sfx?.play(alias);
    } catch (err) {
      console.warn(`[golfi:audio] failed to play sound "${alias}":`, err);
    }
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
    this.worldScene?.spawn(snapshot.id, snapshot.x, snapshot.y);
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
    this.worldScene?.clear();
    this.localState = null;
  }

  /** Positions a player's overlay label from its world position */
  private placeLabel(id: string, x: number, y: number): void {
    if (!this.worldScene) return;
    let { sx, sy } = this.worldScene.project(x, y);

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
