import { Container, Graphics, Text } from "pixi.js";

const PANEL_WIDTH = 150;
const PANEL_HEIGHT = 64;
const PANEL_PADDING_X = 14;
const PANEL_PADDING_Y = 10;

/**
 * Side stats display panel showing authoritatively tracked:
 * - FRAGS: <count>
 * - Holes: <count>
 */
export class StatsPanel extends Container {
  private readonly bg: Graphics;
  private readonly fragsLabel: Text;
  private readonly holesLabel: Text;

  private currentFrags = -1;
  private currentHoles = -1;

  constructor() {
    super();

    this.bg = new Graphics();
    this.drawBackground();
    this.addChild(this.bg);

    this.fragsLabel = new Text({
      text: "FRAGS: 0",
      style: {
        fontFamily: "monospace",
        fontSize: 15,
        fontWeight: "bold",
        fill: 0xff4d4d,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.fragsLabel.position.set(PANEL_PADDING_X, PANEL_PADDING_Y);
    this.addChild(this.fragsLabel);

    this.holesLabel = new Text({
      text: "Holes: 0",
      style: {
        fontFamily: "monospace",
        fontSize: 15,
        fontWeight: "bold",
        fill: 0x38ef7d,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.holesLabel.position.set(PANEL_PADDING_X, PANEL_PADDING_Y + 24);
    this.addChild(this.holesLabel);

    this.setStats(0, 0);
  }

  private drawBackground(): void {
    this.bg.clear();
    this.bg.roundRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 8);
    this.bg.fill({ color: 0x0d1117, alpha: 0.82 });
    this.bg.stroke({ color: 0x30363d, width: 1.5, alpha: 0.9 });
  }

  public setStats(frags: number, holes: number): void {
    if (this.currentFrags !== frags) {
      this.currentFrags = frags;
      this.fragsLabel.text = `FRAGS: ${frags}`;
    }
    if (this.currentHoles !== holes) {
      this.currentHoles = holes;
      this.holesLabel.text = `Holes: ${holes}`;
    }
  }

  public reposition(
    viewportWidth: number,
    margin: number = 12,
    top: number = 38,
  ): void {
    this.position.set(viewportWidth - margin - PANEL_WIDTH, top);
  }
}
