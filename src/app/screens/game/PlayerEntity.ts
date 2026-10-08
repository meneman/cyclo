import { Container, Graphics, Text } from "pixi.js";

import { PLAYER_RADIUS } from "../../../../shared/constants";
import type { PlayerSnapshot } from "../../../../shared/types";

/** How long a chat bubble stays above a player before fading out */
const CHAT_BUBBLE_DURATION_MS = 5000;

/** Visual representation of one player: a colored marker circle + name label */
export class PlayerEntity extends Container {
  private readonly marker: Graphics;
  private readonly nameLabel: Text;
  private chatBubble: Container | null = null;
  private chatBubbleTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(snapshot: PlayerSnapshot) {
    super();

    this.marker = new Graphics()
      .circle(0, 0, PLAYER_RADIUS)
      .fill({ color: snapshot.color });
    this.addChild(this.marker);

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
    this.nameLabel.y = -PLAYER_RADIUS - 14;
    this.addChild(this.nameLabel);

    this.setState(snapshot);
  }

  public setState(snapshot: Pick<PlayerSnapshot, "x" | "y">): void {
    this.x = snapshot.x;
    this.y = snapshot.y;
  }

  public setName(name: string): void {
    this.nameLabel.text = name;
  }

  public setColor(color: number): void {
    this.marker.clear().circle(0, 0, PLAYER_RADIUS).fill({ color });
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
    bubble.y = -PLAYER_RADIUS - 34;
    this.addChild(bubble);

    this.chatBubble = bubble;
    this.chatBubbleTimeout = setTimeout(
      () => this.hideChatBubble(),
      CHAT_BUBBLE_DURATION_MS,
    );
  }

  public destroy(...args: Parameters<Container["destroy"]>): void {
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
