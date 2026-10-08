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
import { userSettings } from "../../utils/userSettings";

import { ChatBox } from "./ChatBox";
import { PlayerEntity } from "./PlayerEntity";
import { WorldScene } from "./WorldScene";

/** Fraction of the local/server position gap corrected per state update */
const RECONCILE_LERP = 0.15;
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
  private readonly hud: Text;
  private readonly debugText: Text;
  private readonly chatBox = new ChatBox();

  private readonly network = new NetworkClient(resolveWsUrl());
  private readonly input = new InputController();
  private readonly interpolator = new SnapshotInterpolator(
    INTERPOLATION_DELAY_MS,
  );

  private readonly entities = new Map<string, PlayerEntity>();
  private localId: string | null = null;
  private localState: PlayerState | null = null;
  private debugEnabled = false;

  private unsubscribeMessage: (() => void) | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private connected = false;
  private playerCount = 0;
  private sendAccumulatorMs = 0;

  constructor() {
    super();

    // Anchored top-right (right-aligned) since the chat panel now occupies the top-left
    this.hud = new Text({
      text: "connecting…",
      style: { fontFamily: "monospace", fontSize: 14, fill: HUD_FILL },
    });
    this.hud.anchor.set(1, 0);
    this.addChild(this.hud);

    this.debugText = new Text({
      text: "",
      style: { fontFamily: "monospace", fontSize: 14, fill: HUD_FILL },
    });
    this.debugText.anchor.set(1, 0);
    this.debugText.visible = false;
    this.addChild(this.debugText);

    this.chatBox.onSend = (text) => {
      this.network.send({ type: ClientMessageType.Chat, text });
    };
    this.addChild(this.chatBox);
  }

  /** Called by Navigation right after the screen is added to the stage */
  public prepare(): void {
    this.worldScene = new WorldScene();
    this.worldScene.setSize(window.innerWidth, window.innerHeight);
    this.unsubscribeMessage = this.network.onMessage((message) =>
      this.handleServerMessage(message),
    );
    this.unsubscribeConnection = this.network.onConnectionChange(
      (connected) => {
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
    this.input.setEnabled(!this.chatBox.editing);
    const dtSeconds = ticker.deltaMS / 1000;
    const currentInput = this.input.get();

    if (this.localState) {
      // Client-side prediction: move immediately using the same simulation
      // step the server runs, then gently reconciled in reconcileLocalPlayer().
      stepPlayer(this.localState, currentInput, dtSeconds);
      this.worldScene.move(
        this.localState.id,
        this.localState.x,
        this.localState.y,
      );
      this.placeLabel(this.localState.id, this.localState.x, this.localState.y);
    }

    for (const [id] of this.entities) {
      if (id === this.localId) continue;
      const sample = this.interpolator.sample(id);
      if (sample) {
        this.worldScene.move(id, sample.x, sample.y);
        this.placeLabel(id, sample.x, sample.y);
      }
    }

    if (this.localState) {
      this.worldScene.render(this.localState.x, this.localState.y);
    } else {
      this.worldScene.render(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    }

    this.sendAccumulatorMs += ticker.deltaMS;
    if (this.sendAccumulatorMs >= INPUT_SEND_INTERVAL_MS) {
      // Subtract (rather than zero) so the send rate doesn't sag under frame
      // jitter; clamp after a long hitch (e.g. suspended tab) to a single
      // catch-up send instead of a burst.
      this.sendAccumulatorMs =
        this.sendAccumulatorMs >= INPUT_SEND_INTERVAL_MS * 2
          ? 0
          : this.sendAccumulatorMs - INPUT_SEND_INTERVAL_MS;
      this.network.send({
        type: ClientMessageType.Input,
        seq: this.network.nextSeq(),
        input: currentInput,
      });
    }

    this.hud.text = `${this.connected ? "connected" : "reconnecting…"} · ${this.playerCount} player${this.playerCount === 1 ? "" : "s"}`;

    if (this.debugEnabled) {
      const x = this.localState?.x ?? 0;
      const y = this.localState?.y ?? 0;
      this.debugText.text = `fps ${ticker.FPS.toFixed(0)} · x ${x.toFixed(1)} y ${y.toFixed(1)}`;
    }
  }

  /** Resize the screen, fired whenever window size changes */
  public resize(width: number, height: number): void {
    this.chatBox.position.set(CHAT_MARGIN, CHAT_MARGIN);
    this.hud.position.set(width - HUD_MARGIN, 10);
    this.debugText.position.set(width - HUD_MARGIN, 30);
    this.worldScene?.setSize(width, height);
  }

  /** Fully reset — the screen instance may be pooled and reused */
  public reset(): void {
    this.unsubscribeMessage?.();
    this.unsubscribeConnection?.();
    this.network.disconnect();
    this.input.destroy();
    window.removeEventListener("keydown", this.onKeyDown);

    for (const entity of this.entities.values()) entity.destroy();
    this.entities.clear();
    this.interpolator.clear();

    this.worldScene?.destroy();
    this.worldScene = null;

    this.localId = null;
    this.localState = null;
    this.playerCount = 0;
    this.connected = false;
    this.debugEnabled = false;
    this.debugText.visible = false;
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
      case ServerMessageType.Welcome:
        // A reconnect issues a new player id, so stale entities and buffered
        // snapshots from the previous session would otherwise linger as
        // ghosts — start from a clean slate on every Welcome.
        this.clearWorldState();
        this.localId = message.id;
        for (const player of message.players) {
          this.spawnEntity(player);
        }
        this.localState =
          message.players.find((p) => p.id === this.localId) ?? null;
        this.playerCount = message.players.length;
        break;

      case ServerMessageType.PlayerJoined:
        this.spawnEntity(message.player);
        this.playerCount = this.entities.size;
        break;

      case ServerMessageType.PlayerLeft:
        this.entities.get(message.id)?.destroy();
        this.entities.delete(message.id);
        this.worldScene?.remove(message.id);
        this.playerCount = this.entities.size;
        break;

      case ServerMessageType.State:
        this.interpolator.push(message.players);
        this.reconcileLocalPlayer(message.players);
        // Names aren't part of the predicted/interpolated movement path —
        // the local player's Join (sent right after connect) always lands
        // after the server's initial Welcome/PlayerJoined snapshot, so the
        // real name only shows up once it comes back through a state tick.
        for (const player of message.players) {
          this.entities.get(player.id)?.setName(player.name);
        }
        break;

      case ServerMessageType.Chat:
        this.chatBox.receive({ name: message.name, text: message.text });
        this.entities.get(message.id)?.showChatBubble(message.text);
        break;
    }
  }

  private spawnEntity(snapshot: PlayerState): void {
    if (this.entities.has(snapshot.id)) return;
    const entity = new PlayerEntity(snapshot);
    this.entities.set(snapshot.id, entity);
    this.addChild(entity);
    this.worldScene?.spawn(snapshot.id, snapshot.x, snapshot.y);
    this.placeLabel(snapshot.id, snapshot.x, snapshot.y);
  }

  /** Drops all per-session world state (entities, interpolation history,
   *  local prediction) — used on Welcome and on full reset. */
  private clearWorldState(): void {
    for (const entity of this.entities.values()) entity.destroy();
    this.entities.clear();
    this.interpolator.clear();
    this.worldScene?.clear();
    this.localState = null;
  }

  /** Positions a player's overlay label from its world position */
  private placeLabel(id: string, x: number, y: number): void {
    if (!this.worldScene) return;
    const { sx, sy } = this.worldScene.project(x, y);
    this.entities.get(id)?.setScreenPosition(sx, sy);
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
}
