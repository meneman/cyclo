import type { Ticker } from "pixi.js";
import { Container, Text } from "pixi.js";

import {
  INPUT_SEND_INTERVAL_MS,
  INTERPOLATION_DELAY_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../../../shared/constants";
import {
  ClientMessageType,
  ServerMessageType,
} from "../../../../shared/protocol";
import type { ServerMessage } from "../../../../shared/protocol";
import { stepPlayer } from "../../../../shared/simulation";
import type { PlayerState } from "../../../../shared/types";
import { resolveWsUrl } from "../../../net/config";
import { InputController } from "../../../net/InputController";
import { NetworkClient } from "../../../net/NetworkClient";
import { SnapshotInterpolator } from "../../../net/SnapshotInterpolator";

import { PlayerEntity } from "./PlayerEntity";
import { WorldBackground } from "./WorldBackground";

/** Fraction of the local/server position gap corrected per state update */
const RECONCILE_LERP = 0.15;
/** Beyond this gap we snap instead of smoothly correcting (teleport / desync) */
const RECONCILE_SNAP_DISTANCE = 200;

/** Full-screen top-down multiplayer world: camera follows the local (predicted) player */
export class GameScreen extends Container {
  private readonly camera = new Container();
  private readonly hud: Text;

  private readonly network = new NetworkClient(resolveWsUrl());
  private readonly input = new InputController();
  private readonly interpolator = new SnapshotInterpolator(
    INTERPOLATION_DELAY_MS,
  );

  private readonly entities = new Map<string, PlayerEntity>();
  private localId: string | null = null;
  private localState: PlayerState | null = null;

  private unsubscribeMessage: (() => void) | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private connected = false;
  private playerCount = 0;
  private sendAccumulatorMs = 0;

  private viewWidth = 0;
  private viewHeight = 0;

  constructor() {
    super();

    this.camera.addChild(new WorldBackground(WORLD_WIDTH, WORLD_HEIGHT));
    this.addChild(this.camera);

    this.hud = new Text({
      text: "connecting…",
      style: { fontFamily: "monospace", fontSize: 14, fill: 0xe6edf3 },
    });
    this.hud.position.set(12, 10);
    this.addChild(this.hud);
  }

  /** Called by Navigation right after the screen is added to the stage */
  public prepare(): void {
    this.unsubscribeMessage = this.network.onMessage((message) =>
      this.handleServerMessage(message),
    );
    this.unsubscribeConnection = this.network.onConnectionChange(
      (connected) => {
        this.connected = connected;
      },
    );
    this.network.connect();
  }

  public update(ticker: Ticker): void {
    const dtSeconds = ticker.deltaMS / 1000;
    const currentInput = this.input.get();

    if (this.localState) {
      // Client-side prediction: move immediately using the same simulation
      // step the server runs, then gently reconciled in reconcileLocalPlayer().
      stepPlayer(this.localState, currentInput, dtSeconds);
      this.entities.get(this.localState.id)?.setState(this.localState);
      this.updateCamera(this.localState.x, this.localState.y);
    }

    for (const [id, entity] of this.entities) {
      if (id === this.localId) continue;
      const sample = this.interpolator.sample(id);
      if (sample) entity.setState(sample);
    }

    this.sendAccumulatorMs += ticker.deltaMS;
    if (this.sendAccumulatorMs >= INPUT_SEND_INTERVAL_MS) {
      this.sendAccumulatorMs = 0;
      this.network.send({
        type: ClientMessageType.Input,
        seq: this.network.nextSeq(),
        input: currentInput,
      });
    }

    this.hud.text = `${this.connected ? "connected" : "reconnecting…"} · ${this.playerCount} player${this.playerCount === 1 ? "" : "s"}`;
  }

  /** Resize the screen, fired whenever window size changes */
  public resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    if (this.localState) {
      this.updateCamera(this.localState.x, this.localState.y);
    }
  }

  /** Fully reset — the screen instance may be pooled and reused */
  public reset(): void {
    this.unsubscribeMessage?.();
    this.unsubscribeConnection?.();
    this.network.disconnect();
    this.input.destroy();

    for (const entity of this.entities.values()) entity.destroy();
    this.entities.clear();

    this.localId = null;
    this.localState = null;
    this.playerCount = 0;
    this.connected = false;
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case ServerMessageType.Welcome:
        this.localId = message.id;
        for (const player of message.players) {
          this.spawnEntity(player, player.id === this.localId);
        }
        this.localState =
          message.players.find((p) => p.id === this.localId) ?? null;
        this.playerCount = message.players.length;
        break;

      case ServerMessageType.PlayerJoined:
        this.spawnEntity(message.player, false);
        this.playerCount = this.entities.size;
        break;

      case ServerMessageType.PlayerLeft:
        this.entities.get(message.id)?.destroy();
        this.entities.delete(message.id);
        this.playerCount = this.entities.size;
        break;

      case ServerMessageType.State:
        this.interpolator.push(message.players);
        this.reconcileLocalPlayer(message.players);
        break;
    }
  }

  private spawnEntity(snapshot: PlayerState, isLocal: boolean): void {
    if (this.entities.has(snapshot.id)) return;
    const entity = new PlayerEntity(snapshot, isLocal);
    this.entities.set(snapshot.id, entity);
    this.camera.addChild(entity);
  }

  /** Softly pulls the predicted local player back toward the server's authoritative position */
  private reconcileLocalPlayer(players: PlayerState[]): void {
    if (!this.localState || !this.localId) return;
    const authoritative = players.find((p) => p.id === this.localId);
    if (!authoritative) return;

    const dx = authoritative.x - this.localState.x;
    const dy = authoritative.y - this.localState.y;
    const distance = Math.hypot(dx, dy);

    if (distance > RECONCILE_SNAP_DISTANCE) {
      this.localState.x = authoritative.x;
      this.localState.y = authoritative.y;
    } else if (distance > 0.5) {
      this.localState.x += dx * RECONCILE_LERP;
      this.localState.y += dy * RECONCILE_LERP;
    }
  }

  private updateCamera(focusX: number, focusY: number): void {
    const halfW = this.viewWidth / 2;
    const halfH = this.viewHeight / 2;

    const camX =
      WORLD_WIDTH <= this.viewWidth
        ? WORLD_WIDTH / 2
        : clamp(focusX, halfW, WORLD_WIDTH - halfW);
    const camY =
      WORLD_HEIGHT <= this.viewHeight
        ? WORLD_HEIGHT / 2
        : clamp(focusY, halfH, WORLD_HEIGHT - halfH);

    this.camera.x = halfW - camX;
    this.camera.y = halfH - camY;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
