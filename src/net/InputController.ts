import type { InputState } from "../../shared/types";

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

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  public get(): InputState {
    return { ...this.state };
  }

  public destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = KEY_MAP[event.code];
    if (!key) return;
    this.state[key] = true;
    event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const key = KEY_MAP[event.code];
    if (!key) return;
    this.state[key] = false;
    event.preventDefault();
  };
}
