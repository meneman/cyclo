import { Graphics } from "pixi.js";

const GRID_STEP = 200;
const GRID_COLOR = 0x30363d;
const BORDER_COLOR = 0x58a6ff;
const FLOOR_COLOR = 0x14181f;

/** Static top-down floor: a bordered grid drawn once and never redrawn */
export class WorldBackground extends Graphics {
  constructor(worldWidth: number, worldHeight: number) {
    super();

    this.rect(0, 0, worldWidth, worldHeight).fill(FLOOR_COLOR);

    for (let x = 0; x <= worldWidth; x += GRID_STEP) {
      this.moveTo(x, 0).lineTo(x, worldHeight);
    }
    for (let y = 0; y <= worldHeight; y += GRID_STEP) {
      this.moveTo(0, y).lineTo(worldWidth, y);
    }
    this.stroke({ width: 1, color: GRID_COLOR });

    this.rect(0, 0, worldWidth, worldHeight).stroke({
      width: 6,
      color: BORDER_COLOR,
    });
  }
}
