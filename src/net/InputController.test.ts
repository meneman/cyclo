import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import type { InputState } from "../../shared/types";
import { InputController } from "./InputController";

describe("InputController", () => {
  test("triggers onChange immediately on key down and key up transitions", () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    const originalWindow = globalThis.window;

    globalThis.window = {
      addEventListener: (type: string, listener: (e: unknown) => void) => {
        listeners[type] = listener;
      },
      removeEventListener: (type: string) => {
        delete listeners[type];
      },
    } as unknown as Window & typeof globalThis;

    try {
      const controller = new InputController();
      const emitted: InputState[] = [];
      controller.onChange = (state) => {
        emitted.push({ ...state });
      };

      // Press 'KeyW' (up)
      listeners.keydown?.({
        code: "KeyW",
        preventDefault: () => {},
      });
      assert.equal(emitted.length, 1);
      assert.equal(emitted[0].up, true);
      assert.equal(controller.get().up, true);

      // Repeat 'KeyW' (should not re-fire onChange)
      listeners.keydown?.({
        code: "KeyW",
        preventDefault: () => {},
      });
      assert.equal(emitted.length, 1);

      // Release 'KeyW'
      listeners.keyup?.({
        code: "KeyW",
        preventDefault: () => {},
      });
      assert.equal(emitted.length, 2);
      assert.equal(emitted[1].up, false);
      assert.equal(controller.get().up, false);

      // Set disabled when keys held down fires onChange with false
      listeners.keydown?.({
        code: "KeyD",
        preventDefault: () => {},
      });
      assert.equal(emitted.length, 3);
      assert.equal(emitted[2].right, true);

      controller.setEnabled(false);
      assert.equal(emitted.length, 4);
      assert.equal(emitted[3].right, false);

      controller.destroy();
      assert.equal(Object.keys(listeners).length, 0);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  test("window blur releases stuck keys so the player cannot pin into a wall", () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    const originalWindow = globalThis.window;

    globalThis.window = {
      addEventListener: (type: string, listener: (e: unknown) => void) => {
        listeners[type] = listener;
      },
      removeEventListener: (type: string) => {
        delete listeners[type];
      },
    } as unknown as Window & typeof globalThis;

    try {
      const controller = new InputController();
      const emitted: InputState[] = [];
      controller.onChange = (state) => {
        emitted.push({ ...state });
      };

      // Hold Right (run into the east wall), then lose window focus
      // without any keyup — e.g. alt-tab while the key is down.
      listeners.keydown?.({
        code: "KeyD",
        preventDefault: () => {},
      });
      assert.equal(controller.get().right, true);

      listeners.blur?.({});
      const released = controller.get();
      assert.equal(released.up, false);
      assert.equal(released.down, false);
      assert.equal(released.left, false);
      assert.equal(released.right, false);
      assert.equal(released.charging, false);
      assert.equal(emitted.length, 2);
      assert.equal(emitted[1].right, false);

      controller.destroy();
      assert.equal(Object.keys(listeners).length, 0);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
