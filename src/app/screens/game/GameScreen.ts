import type { Sprite, Ticker } from "pixi.js";
import { Assets, Container, Text } from "pixi.js";

import { lerpAngle } from "../../../../shared/angleMath";
import type { CollisionMap } from "../../../../shared/collisionMap";
import {
  INPUT_SEND_INTERVAL_MS,
  INTERPOLATION_DELAY_MS,
  MAP_NAME,
  MAP_RENDER_SCALE,
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
import { loadCollisionMap } from "../../../net/collisionMapLoader";
import { resolveWsUrl } from "../../../net/config";
import { InputController } from "../../../net/InputController";
import { JoystickInputController } from "../../../net/JoystickInputController";
import { JumpButtonController } from "../../../net/JumpButtonController";
import { NetworkClient } from "../../../net/NetworkClient";
import { SnapshotInterpolator } from "../../../net/SnapshotInterpolator";
import { userSettings } from "../../utils/userSettings";

import { ChatBox, CHAT_HEIGHT } from "./ChatBox";
import { createCollisionMapDebugOverlay } from "./CollisionMapDebugOverlay";
import { PlayerEntity } from "./PlayerEntity";
import { WorldBackground } from "./WorldBackground";

/** Fraction of the local/server position gap corrected per state update */
const RECONCILE_LERP = 0.15;
/** Beyond this gap we snap instead of smoothly correcting (teleport / desync) */
const RECONCILE_SNAP_DISTANCE = 200;
/** Fraction of the local/server rotation gap corrected per state update, shortest-path aware */
const RECONCILE_ROTATION_LERP = 0.15;
/** Camera zoom — streets are narrow at 1:1, so we render closer than actual world scale */
const CAMERA_ZOOM = 3;
/** Toggles the collision-map overlay + coords/FPS readout — Backquote, since F3 is hijacked by browser "Find" */
const DEBUG_TOGGLE_KEY = "Backquote";
/** Focuses the chat input — clicking it does the same */
const CHAT_OPEN_KEY = "KeyY";
/** Margin from the viewport edges for the chat panel */
const CHAT_MARGIN = 16;
/** Margin from the viewport edges for the touch steering pad, bottom-right */
const JOYSTICK_MARGIN = 90;
/** Jump button position relative to the steering pad — up and to the left, reachable by the same thumb */
const JUMP_BUTTON_OFFSET_X = -110;
const JUMP_BUTTON_OFFSET_Y = -20;

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
  private collisionMap: CollisionMap | undefined = undefined;
  private background: WorldBackground | null = null;
  private collisionOverlay: Sprite | null = null;
  private debugEnabled = false;

  private unsubscribeMessage: (() => void) | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private connected = false;
  private playerCount = 0;
  private sendAccumulatorMs = 0;

  private viewWidth = 0;
  private viewHeight = 0;

  constructor() {
    super();

    this.camera.scale.set(CAMERA_ZOOM);
    this.addChild(this.camera);

    this.hud = new Text({
      text: "connecting…",
      style: { fontFamily: "monospace", fontSize: 14, fill: 0xe6edf3 },
    });
    this.hud.position.set(12, 10);
    this.addChild(this.hud);

    this.debugText = new Text({
      text: "",
      style: { fontFamily: "monospace", fontSize: 14, fill: 0xe6edf3 },
    });
    this.debugText.position.set(12, 30);
    this.debugText.visible = false;
    this.addChild(this.debugText);

    this.chatBox.onSend = (text) => {
      this.network.send({ type: ClientMessageType.Chat, text });
    };
    this.addChild(this.chatBox);
    this.addChild(this.touchInput.view);
    this.addChild(this.jumpButton.view);
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

    void this.loadMap();
  }

  /** Loads the map background + collision mask in parallel with connecting to the server */
  private async loadMap(): Promise<void> {
    const [collisionMap, texture] = await Promise.all([
      loadCollisionMap(MAP_NAME),
      // Rasterized client-side at the same scale the collision mask was
      // generated at, so both land on the same pixel grid (see MAP_RENDER_SCALE).
      Assets.load({
        src: `/maps/${MAP_NAME}/map.svg`,
        data: { resolution: MAP_RENDER_SCALE },
      }),
    ]);
    this.collisionMap = collisionMap;
    this.background = new WorldBackground(texture, WORLD_WIDTH, WORLD_HEIGHT);
    this.camera.addChildAt(this.background, 0);

    this.collisionOverlay = createCollisionMapDebugOverlay(collisionMap);
    this.collisionOverlay.visible = this.debugEnabled;
    this.camera.addChildAt(this.collisionOverlay, 1);
  }

  public update(ticker: Ticker): void {
    this.input.setEnabled(!this.chatBox.editing);
    this.touchInput.setEnabled(!this.chatBox.editing);
    this.jumpButton.setEnabled(!this.chatBox.editing);
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
        this.collisionMap,
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
      this.sendAccumulatorMs = 0;
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
    this.chatBox.position.set(CHAT_MARGIN, height - CHAT_HEIGHT - CHAT_MARGIN);
    const joystickX = width - JOYSTICK_MARGIN;
    const joystickY = height - JOYSTICK_MARGIN;
    this.touchInput.view.position.set(joystickX, joystickY);
    this.jumpButton.view.position.set(
      joystickX + JUMP_BUTTON_OFFSET_X,
      joystickY + JUMP_BUTTON_OFFSET_Y,
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

    this.background?.destroy();
    this.background = null;
    this.collisionOverlay?.destroy();
    this.collisionOverlay = null;

    this.localId = null;
    this.localState = null;
    this.localJump = { timeRemaining: 0, keyWasHeld: false };
    this.localMovement = { speed: 0 };
    this.collisionMap = undefined;
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
    if (this.collisionOverlay)
      this.collisionOverlay.visible = this.debugEnabled;
  };

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case ServerMessageType.Welcome:
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
