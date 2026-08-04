import { Input, ScrollBox } from "@pixi/ui";
import { Container, Graphics, Text } from "pixi.js";

import type { ChatMessage } from "../../utils/chatHistory";
import { appendChatMessage, loadChatHistory } from "../../utils/chatHistory";

export const CHAT_WIDTH = 320;
export const CHAT_HEIGHT = 200;

const LOG_HEIGHT = 156;
const INPUT_HEIGHT = 30;
const MAX_VISIBLE_MESSAGES = 100;

/**
 * Reaches into @pixi/ui's Input to trigger the same "start editing" path a
 * real click on it takes (see its `pointertap` -> `handleActivation` flow) —
 * there's no public API to focus it programmatically, which we need for the
 * keyboard shortcut to open chat.
 */
function focusInput(input: Input): void {
  const internal = input as unknown as {
    activation: boolean;
    handleActivation: () => void;
  };
  internal.activation = true;
  internal.handleActivation();
}

function isInputEditing(input: Input): boolean {
  return (input as unknown as { editing: boolean }).editing;
}

/** Minimal always-on chat panel: scrollable, persisted history + a click/key-to-focus input row */
export class ChatBox extends Container {
  /** Called with the trimmed message text once the player submits one */
  public onSend: ((text: string) => void) | null = null;

  private readonly log: ScrollBox;
  private readonly input: Input;
  private escapePressedWhileEditing = false;

  constructor() {
    super();

    const backdrop = new Graphics()
      .roundRect(0, 0, CHAT_WIDTH, CHAT_HEIGHT, 8)
      .fill({ color: 0x000000, alpha: 0.5 });
    this.addChild(backdrop);

    this.log = new ScrollBox({
      width: CHAT_WIDTH - 12,
      height: LOG_HEIGHT,
      type: "vertical",
      globalScroll: false,
    });
    this.log.position.set(6, 6);
    this.addChild(this.log);

    const inputBg = new Graphics()
      .roundRect(0, 0, CHAT_WIDTH - 12, INPUT_HEIGHT, 6)
      .fill({ color: 0xffffff, alpha: 0.15 });

    this.input = new Input({
      bg: inputBg,
      placeholder: "Press Y to chat…",
      maxLength: 200,
      align: "left",
      textStyle: { fontFamily: "monospace", fontSize: 13, fill: 0xffffff },
      padding: { top: 0, right: 8, bottom: 0, left: 8 },
    });
    this.input.position.set(6, CHAT_HEIGHT - INPUT_HEIGHT - 6);
    this.input.onEnter.connect((text) => this.handleSubmit(text));
    this.addChild(this.input);

    // Capture phase, so this runs before Input's own bubble-phase keydown
    // handler processes Escape and emits onEnter — that's the only way we
    // get to tell "Escape" apart from "Enter" (both just call stopEditing()).
    window.addEventListener("keydown", this.onKeyDownCapture, {
      capture: true,
    });

    for (const message of loadChatHistory()) this.appendLogLine(message);
  }

  /** True while the player is actively typing a message */
  public get editing(): boolean {
    return isInputEditing(this.input);
  }

  /** Focuses the input, as if the player clicked it */
  public focus(): void {
    focusInput(this.input);
  }

  /** Appends an incoming (already server-broadcast) message to the log + local history */
  public receive(message: ChatMessage): void {
    appendChatMessage(message);
    this.appendLogLine(message);
  }

  public destroy(...args: Parameters<Container["destroy"]>): void {
    window.removeEventListener("keydown", this.onKeyDownCapture, {
      capture: true,
    });
    super.destroy(...args);
  }

  private readonly onKeyDownCapture = (event: KeyboardEvent): void => {
    if (event.code === "Escape" && this.editing) {
      this.escapePressedWhileEditing = true;
    }
  };

  private handleSubmit(text: string): void {
    this.input.value = "";
    const cancelled = this.escapePressedWhileEditing;
    this.escapePressedWhileEditing = false;
    if (cancelled) return;

    const trimmed = text.trim();
    if (trimmed) this.onSend?.(trimmed);
  }

  private appendLogLine(message: ChatMessage): void {
    const line = new Text({
      text: `${message.name}: ${message.text}`,
      style: {
        fontFamily: "monospace",
        fontSize: 13,
        fill: 0xe6edf3,
        wordWrap: true,
        wordWrapWidth: CHAT_WIDTH - 24,
      },
    });
    this.log.addItem(line);
    if (this.log.items.length > MAX_VISIBLE_MESSAGES) this.log.removeItem(0);
    this.log.scrollBottom();
  }
}
