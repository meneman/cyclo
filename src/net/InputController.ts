import type { InputState } from "../../shared/types";

/** Keyboard movement mapping: W/Up, S/Down, A/Left, D/Right */
const KEY_MAP: Record<string, keyof InputState> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

/** Tracks which movement keys are currently held down */
export class InputController {
  private readonly state: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  /** While disabled, held keys read as released and new key events are ignored — used while chat is focused */
  private enabled = true;

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  public get(): InputState {
    return { ...this.state };
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) return;
    this.state.up = false;
    this.state.down = false;
    this.state.left = false;
    this.state.right = false;
  }

  public destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    const key = KEY_MAP[event.code];
    if (!key) return;
    this.state[key] = true;
    event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    const key = KEY_MAP[event.code];
    if (!key) return;
    this.state[key] = false;
    event.preventDefault();
  };
}
