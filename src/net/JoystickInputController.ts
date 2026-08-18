import { Container, Graphics } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";

import type { InputState } from "../../shared/types";

const OUTER_RADIUS = 60;
const INNER_RADIUS = 28;
/** How far the handle graphic travels from center, kept inside the outer ring's edge */
const HANDLE_TRAVEL = OUTER_RADIUS - INNER_RADIUS;

/** Below this fraction of OUTER_RADIUS, no direction counts as held — avoids jitter near center */
const DEAD_ZONE = 0.2;

const HANDLE_ALPHA_IDLE = 0.35;
const HANDLE_ALPHA_ACTIVE = 0.7;

/**
 * Directional flags for each 45°-wide octant, indexed by
 * `round(atan2(dy, dx) / (PI/4)) & 7` — screen coords, y-down, starting at
 * 0 = right and going clockwise. Same 8 headings `desiredHeadingFromInput`
 * (shared/movement.ts) derives from held keys.
 */
const OCTANT_FLAGS: readonly Partial<InputState>[] = [
  { right: true },
  { down: true, right: true },
  { down: true },
  { down: true, left: true },
  { left: true },
  { up: true, left: true },
  { up: true },
  { up: true, right: true },
];

/**
 * Drag-to-steer touch control, mapped onto the same InputState shape the
 * keyboard produces — GameScreen merges both sources. Movement only, no
 * jump: Space stays keyboard-exclusive.
 *
 * Hand-rolled rather than using pixi-virtual-joystick: that package's
 * compiled output extends PIXI.Container via the old ES5
 * `__extends`/`_super.call(this)` pattern, which throws "Class constructor
 * cannot be invoked without 'new'" against Pixi v8's native
 * `class Container extends EventEmitter` — it has no ESM build and was
 * never updated for Pixi v8's class rewrite, so it's unusable here. This
 * ports the same octant/threshold/drag math directly onto plain Graphics,
 * using `globalpointermove` (Pixi v8's mechanism for tracking a drag once
 * the pointer leaves the small ring) instead.
 *
 * The handle position tracks the drag *delta from where the touch
 * started*, not the absolute pointer position — so pressing anywhere
 * inside the ring works, not just exactly on the handle.
 */
export class JoystickInputController {
  /** Pixi Container — add to the screen and position in resize() */
  public readonly view = new Container();

  private readonly inner: Graphics;

  private readonly state: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    jump: false,
  };

  /** While disabled, held directions read as released — used while chat is focused */
  private enabled = true;
  private dragging = false;
  private originX = 0;
  private originY = 0;

  constructor() {
    const outer = new Graphics()
      .circle(0, 0, OUTER_RADIUS)
      .fill({ color: 0x000000, alpha: 0.3 })
      .stroke({ width: 2, color: 0xe6edf3, alpha: 0.25 });
    this.inner = new Graphics()
      .circle(0, 0, INNER_RADIUS)
      .fill({ color: 0xe6edf3, alpha: HANDLE_ALPHA_IDLE });

    this.view.addChild(outer, this.inner);
    this.view.eventMode = "static";
    this.view.on("pointerdown", this.onDragStart);
    this.view.on("globalpointermove", this.onDragMove);
    this.view.on("pointerup", this.onDragEnd);
    this.view.on("pointerupoutside", this.onDragEnd);
  }

  public get(): InputState {
    return { ...this.state };
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.endDrag();
  }

  public destroy(): void {
    this.view.destroy({ children: true });
  }

  private readonly onDragStart = (event: FederatedPointerEvent): void => {
    if (!this.enabled) return;
    this.dragging = true;
    this.inner.alpha = HANDLE_ALPHA_ACTIVE;
    const local = event.getLocalPosition(this.view);
    this.originX = local.x;
    this.originY = local.y;
  };

  private readonly onDragMove = (event: FederatedPointerEvent): void => {
    if (!this.dragging) return;
    const local = event.getLocalPosition(this.view);
    this.applyDrag(local.x - this.originX, local.y - this.originY);
  };

  private readonly onDragEnd = (): void => {
    this.endDrag();
  };

  private applyDrag(dx: number, dy: number): void {
    this.clearDirections();

    const distance = Math.hypot(dx, dy);
    const travel = Math.min(distance, HANDLE_TRAVEL);
    this.inner.position.set(
      distance > 0 ? (dx / distance) * travel : 0,
      distance > 0 ? (dy / distance) * travel : 0,
    );

    if (distance / OUTER_RADIUS < DEAD_ZONE) return;
    const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) & 7;
    Object.assign(this.state, OCTANT_FLAGS[octant]);
  }

  private endDrag(): void {
    this.dragging = false;
    this.inner.alpha = HANDLE_ALPHA_IDLE;
    this.inner.position.set(0, 0);
    this.clearDirections();
  }

  private clearDirections(): void {
    this.state.up = false;
    this.state.down = false;
    this.state.left = false;
    this.state.right = false;
  }
}
