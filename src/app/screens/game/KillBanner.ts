import { Container, Text } from "pixi.js";

/**
 * Big "KILL" popup banner displayed in the upper center of the monitor
 * when the local player's golf shot knocks down / eliminates an opponent.
 */
export class KillBanner extends Container {
  private readonly killText: Text;
  private readonly subText: Text;
  private animTimer = 0;
  private active = false;

  private static readonly SLAM_DURATION = 0.12;
  private static readonly HOLD_DURATION = 0.9;
  private static readonly FADE_DURATION = 0.6;
  private static readonly TOTAL_DURATION =
    KillBanner.SLAM_DURATION +
    KillBanner.HOLD_DURATION +
    KillBanner.FADE_DURATION;

  constructor() {
    super();

    this.killText = new Text({
      text: "KILL",
      style: {
        fontFamily: "Impact, 'Arial Black', sans-serif",
        fontSize: 92,
        fontWeight: "bold",
        fill: 0xff1e27,
        stroke: { color: 0x000000, width: 8 },
        align: "center",
        letterSpacing: 4,
      },
    });
    this.killText.anchor.set(0.5, 0.5);
    this.addChild(this.killText);

    this.subText = new Text({
      text: "",
      style: {
        fontFamily: "monospace",
        fontSize: 18,
        fontWeight: "bold",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 4 },
        align: "center",
        letterSpacing: 2,
      },
    });
    this.subText.anchor.set(0.5, 0.5);
    this.subText.y = 58;
    this.addChild(this.subText);

    this.visible = false;
  }

  /**
   * Triggers the big KILL banner slam animation.
   * @param victimName Optional name of the player or bot eliminated.
   */
  public show(victimName?: string): void {
    if (victimName) {
      this.subText.text = `+1 FRAG · ELIMINATED ${victimName.toUpperCase()}`;
    } else {
      this.subText.text = "+1 FRAG";
    }

    this.animTimer = 0;
    this.active = true;
    this.visible = true;
    this.alpha = 1;
    this.scale.set(1.5);
  }

  public update(dtSeconds: number): void {
    if (!this.active) return;

    this.animTimer += dtSeconds;

    if (this.animTimer < KillBanner.SLAM_DURATION) {
      // Punchy slam: scale snaps from 1.5 down to 1.0
      const progress = this.animTimer / KillBanner.SLAM_DURATION;
      const s = 1.5 - 0.5 * Math.sin((progress * Math.PI) / 2);
      this.scale.set(s);
      this.alpha = 1;
    } else if (
      this.animTimer <
      KillBanner.SLAM_DURATION + KillBanner.HOLD_DURATION
    ) {
      this.scale.set(1.0);
      this.alpha = 1;
    } else if (this.animTimer < KillBanner.TOTAL_DURATION) {
      this.scale.set(1.0);
      const fadeProgress =
        (this.animTimer - KillBanner.SLAM_DURATION - KillBanner.HOLD_DURATION) /
        KillBanner.FADE_DURATION;
      this.alpha = Math.max(0, 1 - fadeProgress);
    } else {
      this.active = false;
      this.visible = false;
    }
  }

  public reposition(viewportWidth: number, viewportHeight: number): void {
    this.position.set(viewportWidth / 2, viewportHeight * 0.32);
  }
}
