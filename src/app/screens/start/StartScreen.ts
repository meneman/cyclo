import { Input } from "@pixi/ui";
import { Container, Graphics, Text } from "pixi.js";

import { PLAYER_COLORS } from "../../../../shared/constants";
import { engine } from "../../getEngine";
import { getUrlRoomId } from "../../../net/config";
import { Button } from "../../ui/Button";
import { Label } from "../../ui/Label";
import { userSettings } from "../../utils/userSettings";
import { GameScreen } from "../game/GameScreen";

const INPUT_WIDTH = 320;
const INPUT_HEIGHT = 56;
const DEFAULT_NAME = "Player";

/** First screen shown: player picks a display name and color before joining the world */
export class StartScreen extends Container {
  /** Assets bundles required by this screen */
  public static assetBundles = ["main"];

  private readonly title: Label;
  private readonly nameInput: Input;
  private readonly playButton: Button;
  private readonly colorContainer = new Container();
  private readonly roomBadge?: Text;
  private selectedColor: number;

  constructor() {
    super();

    this.selectedColor = userSettings.getPlayerColor() ?? PLAYER_COLORS[0];

    this.title = new Label({
      text: "golfi",
      style: {
        fontFamily: "monospace",
        fontSize: 48,
        fontWeight: "bold",
        fill: 0xffffff,
      },
    });
    this.addChild(this.title);

    const room = getUrlRoomId();
    if (room) {
      this.roomBadge = new Text({
        text: `Joining Match Room: ${room}`,
        style: {
          fontFamily: "monospace",
          fontSize: 14,
          fontWeight: "bold",
          fill: 0x38bdf8,
        },
      });
      this.roomBadge.anchor.set(0.5, 0.5);
      this.addChild(this.roomBadge);
    }

    const inputBg = new Graphics()
      .roundRect(0, 0, INPUT_WIDTH, INPUT_HEIGHT, 10)
      .fill(0xffffff);

    this.nameInput = new Input({
      bg: inputBg,
      placeholder: "Enter your name",
      value: userSettings.getPlayerName() ?? "",
      maxLength: 24,
      align: "center",
      textStyle: { fontFamily: "monospace", fontSize: 22, fill: 0x1a1a1a },
      padding: { top: 14, right: 16, bottom: 14, left: 16 },
    });
    this.nameInput.onEnter.connect(() => this.play());
    this.addChild(this.nameInput);

    this.buildColorPalette();
    this.addChild(this.colorContainer);

    this.playButton = new Button({ text: "Play", width: 200, height: 90 });
    this.playButton.onPress.connect(() => this.play());
    this.addChild(this.playButton);
  }

  private buildColorPalette(): void {
    this.colorContainer.removeChildren();

    const label = new Text({
      text: "Select Golfer Color",
      style: {
        fontFamily: "monospace",
        fontSize: 13,
        fontWeight: "bold",
        fill: 0x8b949e,
      },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, 0);
    this.colorContainer.addChild(label);

    const swatches = new Container();
    swatches.position.set(0, 20);

    const cols = 6;
    const radius = 13;
    const gap = 12;
    const totalW = cols * (radius * 2) + (cols - 1) * gap;
    const startX = -totalW / 2 + radius;

    PLAYER_COLORS.forEach((color: number, i: number) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (radius * 2 + gap);
      const cy = radius + row * (radius * 2 + gap);

      const circle = new Container();
      circle.eventMode = "static";
      circle.cursor = "pointer";
      circle.position.set(cx, cy);

      const isSel = color === this.selectedColor;
      const g = new Graphics();
      g.circle(0, 0, radius);
      g.fill({ color });
      if (isSel) {
        g.stroke({ color: 0xffffff, width: 3 });
      } else {
        g.stroke({ color: 0x000000, width: 1.5 });
      }
      circle.addChild(g);

      circle.on("pointertap", () => {
        this.selectedColor = color;
        userSettings.setPlayerColor(color);
        this.buildColorPalette();
      });

      swatches.addChild(circle);
    });

    this.colorContainer.addChild(swatches);
  }

  /** Resize the screen, fired whenever window size changes */
  public resize(width: number, height: number): void {
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    this.title.position.set(centerX, centerY - 140);
    if (this.roomBadge) {
      this.roomBadge.position.set(centerX, centerY - 95);
      this.nameInput.position.set(centerX - INPUT_WIDTH / 2, centerY - 60);
    } else {
      this.nameInput.position.set(centerX - INPUT_WIDTH / 2, centerY - 70);
    }
    this.colorContainer.position.set(centerX, centerY + 10);
    this.playButton.position.set(centerX, centerY + 140);
  }

  /** Show screen with animations */
  public async show(): Promise<void> {
    this.alpha = 1;
  }

  /** Hide screen with animations */
  public async hide(): Promise<void> {}

  private play(): void {
    const name = this.nameInput.value.trim().slice(0, 24) || DEFAULT_NAME;
    console.info(`[golfi:game] play as "${name}" -> GameScreen`);
    userSettings.setPlayerName(name);
    void engine().navigation.showScreen(GameScreen);
  }
}
