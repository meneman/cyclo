import type { Ticker } from "pixi.js";
import { Container, Text } from "pixi.js";

import { lerpAngle } from "../../../../shared/angleMath";
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
import type {
  InputState,
  JumpState,
  MovementState,
  PlayerState,
} from "../../../../shared/types";
import { resolveWsUrl } from "../../../net/config";
import { InputController } from "../../../net/InputController";
import { JoystickInputController } from "../../../net/JoystickInputController";
import { JumpButtonController } from "../../../net/JumpButtonController";
import { NetworkClient } from "../../../net/NetworkClient";
import { SnapshotInterpolator } from "../../../net/SnapshotInterpolator";
import { isTouchDevice } from "../../utils/device";
import { userSettings } from "../../utils/userSettings";

import { ChatBox } from "./ChatBox";
import { PlayerEntity } from "./PlayerEntity";

/** Fraction of the local/server position gap corrected per state update */
const RECONCILE_LERP = 0.15;
/** Beyond this gap we snap instead of smoothly correcting (teleport / desync) */
const RECONCILE_SNAP_DISTANCE = 200;
/** Fraction of the local/server rotation gap corrected per state update, shortest-path aware */
const RECONCILE_ROTATION_LERP = 0.15;
/** Fraction of the local/server speed gap corrected per state update */
const RECONCILE_SPEED_LERP = 0.15;
/** Camera zoom — streets are narrow at 1:1, so we render closer than actual world scale */
const CAMERA_ZOOM = 3;
/** Toggles the coords/FPS readout — Backquote, since F3 is hijacked by browser "Find" */
const DEBUG_TOGGLE_KEY = "Backquote";
/** Focuses the chat input — clicking it does the same */
const CHAT_OPEN_KEY = "KeyY";
/** Margin from the viewport edges for the chat panel, top-left */
const CHAT_MARGIN = 16;
/** Margin from the right viewport edge for the connection HUD, top-right — mirrors the chat panel on the left */
const HUD_MARGIN = 12;
/** Margin from the viewport edges for the touch steering pad, bottom-right */
const JOYSTICK_MARGIN = 90;
/** Margin from the viewport edges for the jump button, bottom-left — its own thumb-reachable corner */
const JUMP_BUTTON_MARGIN = 70;

/** Full-screen top-down multiplayer world: camera follows the local (predicted) player */
export class GameScreen extends Container {
  /** Assets bundles required by this screen */
  public static assetBundles = ["main"];

  private readonly camera = new Container();
  private readonly hud: Text;
  private readonly debugText: Text;
  private readonly chatBox = new ChatBox();

  private readonly network = new NetworkClient(resolveWsUrl());
  private readonly input = new InputController();
  private readonly touchInput = new JoystickInputController();
  private readonly jumpButton = new JumpButtonController();
  private readonly interpolator = new SnapshotInterpolator(
    INTERPOLATION_DELAY_MS,
  );

  private readonly entities = new Map<string, PlayerEntity>();
  private localId: string | null = null;
  private localState: PlayerState | null = null;
  private localJump: JumpState = { timeRemaining: 0, keyWasHeld: false };
  private localMovement: MovementState = { speed: 0 };
  private debugEnabled = false;

  private unsubscribeMessage: (() => void) | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private connected = false;
  private playerCount = 0;
  private sendAccumulatorMs = 0;

  /** Touch controls only apply on touch devices — desktop relies on the keyboard */
  private readonly touchControlsEnabled = isTouchDevice();

  private viewWidth = 0;
  private viewHeight = 0;

  constructor() {
    super();

    this.camera.scale.set(CAMERA_ZOOM);
    this.addChild(this.camera);

    // Anchored top-right (right-aligned) since the chat panel now occupies the top-left
    this.hud = new Text({
      text: "connecting…",
      style: { fontFamily: "monospace", fontSize: 14, fill: 0xe6edf3 },
    });
    this.hud.anchor.set(1, 0);
    this.addChild(this.hud);

    this.debugText = new Text({
      text: "",
      style: { fontFamily: "monospace", fontSize: 14, fill: 0xe6edf3 },
    });
    this.debugText.anchor.set(1, 0);
    this.debugText.visible = false;
    this.addChild(this.debugText);

    this.chatBox.onSend = (text) => {
      this.network.send({ type: ClientMessageType.Chat, text });
    };
    this.addChild(this.chatBox);
    this.addChild(this.touchInput.view);
    this.addChild(this.jumpButton.view);

    // Desktop already has the keyboard — only show the on-screen controls
    // on touch devices, where they're the only way to move/jump.
    this.touchInput.view.visible = this.touchControlsEnabled;
    this.jumpButton.view.visible = this.touchControlsEnabled;
  }

  /** Called by Navigation right after the screen is added to the stage */
  public prepare(): void {
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
    this.input.setEnabled(!this.chatBox.editing);
    this.touchInput.setEnabled(
      this.touchControlsEnabled && !this.chatBox.editing,
    );
    this.jumpButton.setEnabled(
      this.touchControlsEnabled && !this.chatBox.editing,
    );
    const dtSeconds = ticker.deltaMS / 1000;
    const currentInput = mergeInputs(
      this.input.get(),
      this.touchInput.get(),
      this.jumpButton.get(),
    );

    if (this.localState) {
      // Client-side prediction: move immediately using the same simulation
      // step the server runs, then gently reconciled in reconcileLocalPlayer().
      stepPlayer(
        this.localState,
        currentInput,
        dtSeconds,
        this.localJump,
        this.localMovement,
      );
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
    this.viewWidth = width;
    this.viewHeight = height;
    this.chatBox.position.set(CHAT_MARGIN, CHAT_MARGIN);
    this.hud.position.set(width - HUD_MARGIN, 10);
    this.debugText.position.set(width - HUD_MARGIN, 30);
    this.touchInput.view.position.set(
      width - JOYSTICK_MARGIN,
      height - JOYSTICK_MARGIN,
    );
    this.jumpButton.view.position.set(
      JUMP_BUTTON_MARGIN,
      height - JUMP_BUTTON_MARGIN,
    );
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
    this.touchInput.destroy();
    this.jumpButton.destroy();
    window.removeEventListener("keydown", this.onKeyDown);

    for (const entity of this.entities.values()) entity.destroy();
    this.entities.clear();
    this.interpolator.clear();

    this.localId = null;
    this.localState = null;
    this.localJump = { timeRemaining: 0, keyWasHeld: false };
    this.localMovement = { speed: 0 };
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
    this.camera.addChild(entity);
  }

  /** Drops all per-session world state (entities, interpolation history,
   *  local prediction) — used on Welcome and on full reset. */
  private clearWorldState(): void {
    for (const entity of this.entities.values()) entity.destroy();
    this.entities.clear();
    this.interpolator.clear();
    this.localState = null;
    this.localJump = { timeRemaining: 0, keyWasHeld: false };
    this.localMovement = { speed: 0 };
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

    // Rotation now has inertia (turn-rate easing), so predicted heading can
    // drift from authoritative under different dt granularities — gently
    // correct it too, same as position.
    this.localState.rotation = lerpAngle(
      this.localState.rotation,
      authoritative.rotation,
      RECONCILE_ROTATION_LERP,
    );

    // Speed is simulated (accel/friction/turn penalty), so it drifts the same
    // way position does whenever client and server step with different dt.
    // Without this correction the trajectory re-diverges after every
    // position fix. The typeof guard tolerates servers predating the field.
    if (typeof authoritative.speed === "number") {
      if (distance > RECONCILE_SNAP_DISTANCE) {
        this.localMovement.speed = authoritative.speed;
      } else {
        this.localMovement.speed +=
          (authoritative.speed - this.localMovement.speed) *
          RECONCILE_SPEED_LERP;
      }
    }
  }

  private updateCamera(focusX: number, focusY: number): void {
    const halfW = this.viewWidth / 2;
    const halfH = this.viewHeight / 2;
    // Half the visible world extent, in world units, at the current zoom.
    const halfWorldW = halfW / CAMERA_ZOOM;
    const halfWorldH = halfH / CAMERA_ZOOM;

    const camX =
      WORLD_WIDTH <= halfWorldW * 2
        ? WORLD_WIDTH / 2
        : clamp(focusX, halfWorldW, WORLD_WIDTH - halfWorldW);
    const camY =
      WORLD_HEIGHT <= halfWorldH * 2
        ? WORLD_HEIGHT / 2
        : clamp(focusY, halfWorldH, WORLD_HEIGHT - halfWorldH);

    this.camera.x = halfW - camX * CAMERA_ZOOM;
    this.camera.y = halfH - camY * CAMERA_ZOOM;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Keyboard, joystick, and jump button each hold a subset of fields — a field counts if any source holds it */
function mergeInputs(...inputs: InputState[]): InputState {
  return {
    up: inputs.some((input) => input.up),
    down: inputs.some((input) => input.down),
    left: inputs.some((input) => input.left),
    right: inputs.some((input) => input.right),
    jump: inputs.some((input) => input.jump),
  };
}
