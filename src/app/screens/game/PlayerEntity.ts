import { Container, Graphics, Text } from "pixi.js";

import { PLAYER_RADIUS } from "../../../../shared/constants";
import type { PlayerSnapshot } from "../../../../shared/types";

/** Visual representation of one player: body, facing indicator, name label */
export class PlayerEntity extends Container {
  private readonly heading: Graphics;
  private readonly nameLabel: Text;

  constructor(snapshot: PlayerSnapshot, isLocal: boolean) {
    super();

    const body = new Graphics()
      .circle(0, 0, PLAYER_RADIUS)
      .fill(snapshot.color);
    if (isLocal) {
      body.circle(0, 0, PLAYER_RADIUS).stroke({ width: 3, color: 0xffffff });
    }
    this.addChild(body);

    this.heading = new Graphics()
      .poly([
        PLAYER_RADIUS + 10,
        0,
        PLAYER_RADIUS - 4,
        -6,
        PLAYER_RADIUS - 4,
        6,
      ])
      .fill(0xffffff);
    this.addChild(this.heading);

    this.nameLabel = new Text({
      text: snapshot.name,
      style: {
        fontFamily: "monospace",
        fontSize: 13,
        fill: 0xe6edf3,
        align: "center",
      },
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.y = -PLAYER_RADIUS - 8;
    this.addChild(this.nameLabel);

    this.setState(snapshot);
  }

  public setState(
    snapshot: Pick<PlayerSnapshot, "x" | "y" | "rotation">,
  ): void {
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.heading.rotation = snapshot.rotation;
  }

  public setName(name: string): void {
    this.nameLabel.text = name;
  }
}
