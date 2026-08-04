import { Sprite, Texture } from "pixi.js";

/** The map image, stretched to fill the (scaled-up) world so streets line up with the collision mask. */
export class WorldBackground extends Sprite {
  constructor(texture: Texture, worldWidth: number, worldHeight: number) {
    super(texture);
    this.width = worldWidth;
    this.height = worldHeight;
  }
}
