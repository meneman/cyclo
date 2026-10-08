import { Container, Graphics, Text } from "pixi.js";

import type { PlayerSnapshot } from "../../../../shared/types";

/**
 * Label height above the character's feet, in screen px: the models stand
 * ~480 units tall at CHARACTER_SCALE 0.06 under CAMERA_ZOOM 3
 * (~85px), so the name floats just above the head.
 */
const HEAD_OFFSET_PX = 92;

/** Height of the load bubble above the feet, directly above the name tag */
const LOAD_BUBBLE_OFFSET_PX = HEAD_OFFSET_PX + 18;
const METER_WIDTH = 52;
const METER_HEIGHT = 10;

/** How long a chat bubble stays above a player before fading out */
const CHAT_BUBBLE_DURATION_MS = 5000;

/**
 * Screen-space label for one player: name tag + chat bubble + swing load bubble.
 * The player marker itself is drawn by the Three.js world scene behind
 * the transparent Pixi overlay — this container is positioned every frame
 * from `WorldScene.project()`.
 */
export class PlayerEntity extends Container {
  private readonly nameLabel: Text;
  private chatBubble: Container | null = null;
  private chatBubbleTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly loadBubble: Container;
  private readonly loadBubbleBg = new Graphics();
  private readonly loadBubbleBar = new Graphics();
  private readonly loadBubbleText: Text;
  private loadBubbleTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastSeenSwingSeq = 0;

  constructor(snapshot: PlayerSnapshot) {
    super();

    this.nameLabel = new Text({
      text: snapshot.name,
      style: {
        fontFamily: "monospace",
        fontSize: 13,
        fill: 0xe6edf3,
        stroke: { color: 0x000000, width: 3 },
        align: "center",
      },
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.y = -HEAD_OFFSET_PX;
    this.addChild(this.nameLabel);

    this.loadBubble = new Container();
    this.loadBubble.y = -LOAD_BUBBLE_OFFSET_PX;
    this.loadBubble.visible = false;

    this.loadBubbleText = new Text({
      text: "",
      style: {
        fontFamily: "monospace",
        fontSize: 9,
        fontWeight: "bold",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
        align: "center",
      },
    });
    this.loadBubbleText.anchor.set(0.5, 0.5);

    this.loadBubble.addChild(
      this.loadBubbleBg,
      this.loadBubbleBar,
      this.loadBubbleText,
    );
    this.addChild(this.loadBubble);
  }

  public setScreenPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  public setName(name: string): void {
    this.nameLabel.text = name;
  }

  /** Shows a speech bubble above the player, replacing any that's still showing */
  public showChatBubble(text: string): void {
    this.hideChatBubble();

    const label = new Text({
      text,
      style: {
        fontFamily: "monospace",
        fontSize: 12,
        fill: 0x1a1a1a,
        wordWrap: true,
        wordWrapWidth: 160,
        align: "center",
      },
    });
    label.anchor.set(0.5, 0.5);

    const paddingX = 8;
    const paddingY = 6;
    const bg = new Graphics()
      .roundRect(
        -label.width / 2 - paddingX,
        -label.height / 2 - paddingY,
        label.width + paddingX * 2,
        label.height + paddingY * 2,
        6,
      )
      .fill({ color: 0xffffff, alpha: 0.9 });

    const bubble = new Container();
    bubble.addChild(bg, label);
    bubble.y = -HEAD_OFFSET_PX - 20;
    this.addChild(bubble);

    this.chatBubble = bubble;
    this.chatBubbleTimeout = setTimeout(
      () => this.hideChatBubble(),
      CHAT_BUBBLE_DURATION_MS,
    );
  }

  /**
   * Updates the swing load meter above the player:
   * - While charging (charge > 0): renders the dynamic load meter
   * - On release (swingSeq increments): flashes the release power briefly
   * - Otherwise: hides the bubble
   */
  public setSwingCharge(
    charge: number,
    swingPower: number,
    swingSeq: number,
  ): void {
    if (charge > 0) {
      if (this.loadBubbleTimeout) {
        clearTimeout(this.loadBubbleTimeout);
        this.loadBubbleTimeout = null;
      }
      this.loadBubble.visible = true;
      this.drawLoadBubble(charge, false);
      return;
    }

    if (swingSeq > this.lastSeenSwingSeq && swingPower > 0) {
      this.lastSeenSwingSeq = swingSeq;
      this.loadBubble.visible = true;
      this.drawLoadBubble(swingPower, true);
      if (this.loadBubbleTimeout) {
        clearTimeout(this.loadBubbleTimeout);
      }
      this.loadBubbleTimeout = setTimeout(() => {
        this.loadBubble.visible = false;
        this.loadBubbleTimeout = null;
      }, 450);
      return;
    }

    if (!this.loadBubbleTimeout) {
      this.loadBubble.visible = false;
    }
  }

  private drawLoadBubble(power: number, isRelease: boolean): void {
    const clamped = Math.min(Math.max(power, 0), 1);
    const w = METER_WIDTH;
    const h = METER_HEIGHT;
    const pad = 3;

    this.loadBubbleBg.clear();
    this.loadBubbleBg
      .roundRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, 5)
      .fill({ color: 0x090d16, alpha: 0.85 })
      .stroke({
        color: isRelease ? 0x67e8f9 : 0x334155,
        width: isRelease ? 2 : 1.5,
      });

    const barColor = isRelease
      ? 0x38bdf8
      : clamped < 0.5
        ? 0x22c55e
        : clamped < 0.8
          ? 0xeab308
          : 0xef4444;

    this.loadBubbleBar.clear();
    if (clamped > 0) {
      const barW = Math.max(2, w * clamped);
      this.loadBubbleBar
        .roundRect(-w / 2, -h / 2, barW, h, 3)
        .fill({ color: barColor, alpha: 0.95 });
    }

    this.loadBubbleText.text = isRelease
      ? `${Math.round(clamped * 100)}%`
      : clamped >= 0.99
        ? "MAX"
        : `${Math.round(clamped * 100)}%`;
  }

  public destroy(...args: Parameters<Container["destroy"]>): void {
    if (this.loadBubbleTimeout) {
      clearTimeout(this.loadBubbleTimeout);
      this.loadBubbleTimeout = null;
    }
    this.hideChatBubble();
    super.destroy(...args);
  }

  private hideChatBubble(): void {
    if (this.chatBubbleTimeout) {
      clearTimeout(this.chatBubbleTimeout);
      this.chatBubbleTimeout = null;
    }
    this.chatBubble?.destroy({ children: true });
    this.chatBubble = null;
  }
}
