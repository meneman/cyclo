import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { parseClientMessage, sanitizeInputState } from "./protocol";

describe("sanitizeInputState", () => {
  test("coerces arbitrary values to booleans", () => {
    assert.deepEqual(
      sanitizeInputState({
        up: 1,
        down: 0,
        left: "x",
        right: null,
        charging: 1,
      }),
      { up: true, down: false, left: true, right: false, charging: true },
    );
  });

  test("missing or non-object input yields all-false", () => {
    assert.deepEqual(sanitizeInputState(null), {
      up: false,
      down: false,
      left: false,
      right: false,
      charging: false,
    });
    assert.deepEqual(sanitizeInputState({}), {
      up: false,
      down: false,
      left: false,
      right: false,
      charging: false,
    });
  });

  test("drops legacy drive fields (gas/brake/jump semantics are gone)", () => {
    assert.deepEqual(sanitizeInputState({ gas: true, brake: true }), {
      up: false,
      down: false,
      left: false,
      right: false,
      charging: false,
    });
  });
});

describe("parseClientMessage", () => {
  test("accepts well-formed input messages", () => {
    const message = parseClientMessage(
      JSON.stringify({
        type: "input",
        seq: 3,
        input: { up: true },
      }),
    );
    assert.ok(message !== null && message.type === "input");
    assert.equal(message.seq, 3);
  });

  test("rejects malformed payloads instead of throwing into the sim", () => {
    assert.equal(parseClientMessage("not json{"), null);
    assert.equal(parseClientMessage(JSON.stringify({})), null);
    assert.equal(
      parseClientMessage(JSON.stringify({ type: "input", seq: 1 })),
      null,
    );
    assert.equal(
      parseClientMessage(
        JSON.stringify({ type: "input", seq: Number.NaN, input: {} }),
      ),
      null,
    );
    assert.equal(
      parseClientMessage(JSON.stringify({ type: "join", name: 42 })),
      null,
    );
    assert.equal(parseClientMessage(JSON.stringify({ type: "nope" })), null);
  });
});
