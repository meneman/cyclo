import { ButtonContainer } from "@pixi/ui";
import { Graphics } from "pixi.js";

import type { InputState } from "../../shared/types";

const RADIUS = 40;

/**
 * Hold-to-jump touch button, mapped onto the same InputState shape the
 * keyboard produces — GameScreen merges it in alongside the keyboard and
 * the movement joystick. Mirrors Space: `jump` is true while held, the
 * server does its own rising-edge detection (shared/simulation.ts
 * JumpState), so reporting "currently pressed" is all this needs to do.
 */
export class JumpButtonController {
  /** Pixi Container (a @pixi/ui ButtonContainer) — add to the screen and position in resize() */
  public readonly view: ButtonContainer;

  private readonly state: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    jump: false,
  };

  constructor() {
    const graphic = new Graphics()
      .circle(0, 0, RADIUS)
      .fill({ color: 0x000000, alpha: 0.3 })
      .stroke({ width: 2, color: 0xe6edf3, alpha: 0.25 })
      .poly([0, -16, 12, 6, -12, 6])
      .fill({ color: 0xe6edf3, alpha: 0.6 });

    this.view = new ButtonContainer(graphic);
    // onUp also covers "released outside" — @pixi/ui's processUpOut emits
    // both onUpOut and onUp, so this alone is enough to always clear jump.
    this.view.onDown.connect(() => {
      this.state.jump = true;
    });
    this.view.onUp.connect(() => {
      this.state.jump = false;
    });
  }

  public get(): InputState {
    return { ...this.state };
  }

  public setEnabled(enabled: boolean): void {
    // Setting enabled=false while held also releases it (ButtonEvents.processUp),
    // which fires onUp above and clears state.jump.
    this.view.enabled = enabled;
  }

  public destroy(): void {
    this.view.destroy({ children: true });
  }
}
