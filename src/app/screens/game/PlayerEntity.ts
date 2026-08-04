import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";

import { PLAYER_RADIUS } from "../../../../shared/constants";
import type { PlayerSnapshot } from "../../../../shared/types";

/** How long a chat bubble stays above a player before fading out */
const CHAT_BUBBLE_DURATION_MS = 5000;

/** Visual representation of one player using the custom transparent cyclist sprite */
export class PlayerEntity extends Container {
  private readonly bikeSprite: Sprite;
  private readonly nameLabel: Text;
  private chatBubble: Container | null = null;
  private chatBubbleTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(snapshot: PlayerSnapshot) {
    super();

    // Player bike sprite from loaded asset
    const texture =
      Assets.get("player.png") ??
      Assets.get("main/player.png") ??
      Texture.from("player.png");

    this.bikeSprite = new Sprite(texture);
    this.bikeSprite.anchor.set(0.5, 0.5);

    // Scale bike to fit player collision radius (~58px long)
    const targetLength = PLAYER_RADIUS * 3.2;
    const currentWidth = this.bikeSprite.texture.width || 243;
    const scale = targetLength / currentWidth;
    this.bikeSprite.scale.set(scale);

    this.addChild(this.bikeSprite);

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

  public setState(
    snapshot: Pick<PlayerSnapshot, "x" | "y" | "rotation" | "jumping">,
  ): void {
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.bikeSprite.rotation = snapshot.rotation;
    this.alpha = snapshot.jumping ? 0.5 : 1;
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
