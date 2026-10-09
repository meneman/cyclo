import { Container, Text } from "pixi.js";

export class CountdownBanner extends Container {
  private readonly numberText: Text;
  private readonly startText: Text;
  private animTimer = 0;
  private currentSeconds: number | null = null;
  private showStart = false;

  constructor() {
    super();

    this.numberText = new Text({
      text: "",
      style: {
        fontFamily: "Impact, 'Arial Black', sans-serif",
        fontSize: 120,
        fontWeight: "bold",
        fill: 0xfacc15, // Yellow
        stroke: { color: 0x000000, width: 8 },
        align: "center",
      },
    });
    this.numberText.anchor.set(0.5, 0.5);
    this.addChild(this.numberText);

    this.startText = new Text({
      text: "MATCH START!",
      style: {
        fontFamily: "Impact, 'Arial Black', sans-serif",
        fontSize: 84,
        fontWeight: "bold",
        fill: 0x22c55e, // Green
        stroke: { color: 0x000000, width: 8 },
        align: "center",
        letterSpacing: 4,
      },
    });
    this.startText.anchor.set(0.5, 0.5);
    this.startText.visible = false;
    this.addChild(this.startText);

    this.visible = false;
  }

  public setCountdown(seconds: number | null): void {
    if (seconds === null || seconds <= 0) {
      if (this.currentSeconds !== null && this.currentSeconds > 0) {
        this.triggerMatchStart();
      } else {
        this.visible = false;
      }
      this.currentSeconds = null;
      return;
    }

    if (this.currentSeconds !== seconds) {
      this.currentSeconds = seconds;
      this.numberText.text = seconds.toString();
      this.numberText.visible = true;
      this.startText.visible = false;
      this.visible = true;
      this.animTimer = 0;
      this.scale.set(1.4);
      this.alpha = 1;
    }
  }

  public triggerMatchStart(): void {
    this.showStart = true;
    this.animTimer = 0;
    this.numberText.visible = false;
    this.startText.visible = true;
    this.visible = true;
    this.scale.set(1.6);
    this.alpha = 1;
  }

  public update(dtSeconds: number): void {
    if (!this.visible) return;

    this.animTimer += dtSeconds;

    if (this.showStart) {
      // 0.0 -> 0.15: Slam down from 1.6 to 1.0
      if (this.animTimer < 0.15) {
        const t = this.animTimer / 0.15;
        this.scale.set(1.6 - 0.6 * t);
      } else if (this.animTimer < 1.0) {
        this.scale.set(1.0);
        this.alpha = 1;
      } else if (this.animTimer < 1.6) {
        // Fade out
        const t = (this.animTimer - 1.0) / 0.6;
        this.alpha = 1 - t;
      } else {
        this.visible = false;
        this.showStart = false;
      }
    } else if (this.currentSeconds !== null) {
      // Quick pop per second: scale settles from 1.4 to 1.0
      if (this.animTimer < 0.2) {
        const t = this.animTimer / 0.2;
        this.scale.set(1.4 - 0.4 * t);
      } else {
        this.scale.set(1.0);
      }
    }
  }

  public reposition(viewportWidth: number, viewportHeight: number): void {
    this.position.set(viewportWidth * 0.5, viewportHeight * 0.38);
  }

  public getNumberText(): string {
    return this.numberText.text;
  }

  public isNumberVisible(): boolean {
    return this.numberText.visible;
  }

  public isStartVisible(): boolean {
    return this.startText.visible;
  }
}
