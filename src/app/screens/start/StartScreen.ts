import { Input } from "@pixi/ui";
import { Container, Graphics } from "pixi.js";

import { engine } from "../../getEngine";
import { Button } from "../../ui/Button";
import { Label } from "../../ui/Label";
import { userSettings } from "../../utils/userSettings";
import { GameScreen } from "../game/GameScreen";

const INPUT_WIDTH = 320;
const INPUT_HEIGHT = 56;
const DEFAULT_NAME = "Player";

/** First screen shown: player picks a display name before joining the world */
export class StartScreen extends Container {
  /** Assets bundles required by this screen */
  public static assetBundles = ["main"];

  private readonly title: Label;
  private readonly nameInput: Input;
  private readonly playButton: Button;

  constructor() {
    super();

    this.title = new Label({
      text: "cyclo",
      style: {
        fontFamily: "monospace",
        fontSize: 48,
        fontWeight: "bold",
        fill: 0xffffff,
      },
    });
    this.addChild(this.title);

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

    this.playButton = new Button({ text: "Play", width: 200, height: 90 });
    this.playButton.onPress.connect(() => this.play());
    this.addChild(this.playButton);
  }

  /** Resize the screen, fired whenever window size changes */
  public resize(width: number, height: number): void {
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    this.title.position.set(centerX, centerY - 120);
    this.nameInput.position.set(
      centerX - INPUT_WIDTH / 2,
      centerY - INPUT_HEIGHT / 2,
    );
    this.playButton.position.set(centerX, centerY + 100);
  }

  /** Show screen with animations */
  public async show(): Promise<void> {
    this.alpha = 1;
  }

  /** Hide screen with animations */
  public async hide(): Promise<void> {}

  private play(): void {
    const name = this.nameInput.value.trim().slice(0, 24) || DEFAULT_NAME;
    console.info(`[cyclo:game] play as "${name}" -> GameScreen`);
    userSettings.setPlayerName(name);
    void engine().navigation.showScreen(GameScreen);
  }
}
