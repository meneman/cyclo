import { Assets, Container, Sprite, Text, Texture } from "pixi.js";

import { PLAYER_RADIUS } from "../../../../shared/constants";
import type { PlayerSnapshot } from "../../../../shared/types";

/** Visual representation of one player using the custom transparent cyclist sprite */
export class PlayerEntity extends Container {
  private readonly bikeSprite: Sprite;
  private readonly nameLabel: Text;

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
}
