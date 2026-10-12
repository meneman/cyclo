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

  test("contextmenu suppresses default and releases stuck keys", () => {
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

      // Hold Left and charging
      listeners.keydown?.({
        code: "KeyA",
        preventDefault: () => {},
      });
      listeners.keydown?.({
        code: "Space",
        preventDefault: () => {},
      });
      assert.equal(controller.get().left, true);
      assert.equal(controller.get().charging, true);

      let defaultPrevented = false;
      listeners.contextmenu?.({
        preventDefault: () => {
          defaultPrevented = true;
        },
      });

      assert.equal(defaultPrevented, true);
      const released = controller.get();
      assert.equal(released.left, false);
      assert.equal(released.charging, false);
      assert.equal(emitted.length, 3);
      assert.equal(emitted[2].left, false);
      assert.equal(emitted[2].charging, false);

      controller.destroy();
      assert.equal(Object.keys(listeners).length, 0);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  test("document visibilitychange to hidden releases stuck keys", () => {
    const windowListeners: Record<string, (e: unknown) => void> = {};
    const docListeners: Record<string, (e: unknown) => void> = {};
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    globalThis.window = {
      addEventListener: (type: string, listener: (e: unknown) => void) => {
        windowListeners[type] = listener;
      },
      removeEventListener: (type: string) => {
        delete windowListeners[type];
      },
    } as unknown as Window & typeof globalThis;

    const mockDoc = {
      hidden: false,
      addEventListener: (type: string, listener: (e: unknown) => void) => {
        docListeners[type] = listener;
      },
      removeEventListener: (type: string) => {
        delete docListeners[type];
      },
      getElementById: () => null,
    };
    globalThis.document = mockDoc as unknown as Document;

    try {
      const controller = new InputController();
      const emitted: InputState[] = [];
      controller.onChange = (state) => {
        emitted.push({ ...state });
      };

      // Hold Up
      windowListeners.keydown?.({
        code: "KeyW",
        preventDefault: () => {},
      });
      assert.equal(controller.get().up, true);

      // Visibilitychange while hidden
      mockDoc.hidden = true;
      docListeners.visibilitychange?.({});

      const released = controller.get();
      assert.equal(released.up, false);
      assert.equal(emitted.length, 2);
      assert.equal(emitted[1].up, false);

      controller.destroy();
      assert.equal(Object.keys(windowListeners).length, 0);
      assert.equal(Object.keys(docListeners).length, 0);
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    }
  });
});
