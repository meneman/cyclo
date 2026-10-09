import { Container, Graphics, Text } from "pixi.js";
import type { MatchState } from "../../../../shared/types";

export class MatchEndOverlay extends Container {
  private readonly backdrop = new Graphics();
  private readonly card = new Container();
  private readonly cardBg = new Graphics();
  private readonly titleText: Text;
  private readonly subtitleText: Text;
  private readonly scoreRows = new Container();
  private readonly rematchButton: Container;
  private readonly leaveButton: Container;

  public onRematch?: () => void;
  public onLeave?: () => void;

  constructor() {
    super();
    this.visible = false;
    this.eventMode = "static";

    this.addChild(this.backdrop);
    this.addChild(this.card);

    this.card.addChild(this.cardBg);

    this.titleText = new Text({
      text: "VICTORY!",
      style: {
        fontFamily: "Impact, 'Arial Black', sans-serif",
        fontSize: 54,
        fontWeight: "bold",
        fill: 0xfacc15,
        stroke: { color: 0x000000, width: 6 },
        align: "center",
        letterSpacing: 2,
      },
    });
    this.titleText.anchor.set(0.5, 0);
    this.card.addChild(this.titleText);

    this.subtitleText = new Text({
      text: "",
      style: {
        fontFamily: "monospace",
        fontSize: 15,
        fill: 0x94a3b8,
        align: "center",
      },
    });
    this.subtitleText.anchor.set(0.5, 0);
    this.card.addChild(this.subtitleText);

    this.card.addChild(this.scoreRows);

    this.rematchButton = this.createButton("Rematch", 0x16a34a, () => {
      this.onRematch?.();
    });
    this.card.addChild(this.rematchButton);

    this.leaveButton = this.createButton("Leave Match", 0x475569, () => {
      this.onLeave?.();
    });
    this.card.addChild(this.leaveButton);
  }

  private createButton(
    label: string,
    bgColor: number,
    onPress: () => void,
  ): Container {
    const btn = new Container();
    btn.eventMode = "static";
    btn.cursor = "pointer";

    const bg = new Graphics();
    bg.roundRect(-80, -22, 160, 44, 8);
    bg.fill({ color: bgColor, alpha: 0.9 });
    bg.stroke({ color: 0xffffff, width: 1.5 });
    btn.addChild(bg);

    const txt = new Text({
      text: label,
      style: {
        fontFamily: "monospace",
        fontSize: 14,
        fontWeight: "bold",
        fill: 0xffffff,
      },
    });
    txt.anchor.set(0.5);
    btn.addChild(txt);

    btn.on("pointertap", onPress);
    btn.on("pointerenter", () => {
      bg.alpha = 1.0;
    });
    btn.on("pointerleave", () => {
      bg.alpha = 0.9;
    });

    return btn;
  }

  public showMatchEnd(match: MatchState, localId: string | null): void {
    const isWinner = match.winnerId === localId;
    const winnerName = match.winnerName ?? "Player";

    if (isWinner) {
      this.titleText.text = "VICTORY!";
      this.titleText.style.fill = 0xfacc15; // Gold
      this.subtitleText.text = "You reached 10 points and won the match!";
    } else {
      this.titleText.text = "DEFEAT";
      this.titleText.style.fill = 0xef4444; // Red
      this.subtitleText.text = `${winnerName} reached 10 points first!`;
    }

    this.scoreRows.removeChildren();

    // Table Header
    const header = new Text({
      text: "PLAYER            FRAGS   HOLES   TOTAL",
      style: {
        fontFamily: "monospace",
        fontSize: 13,
        fontWeight: "bold",
        fill: 0x64748b,
      },
    });
    header.position.set(-200, 0);
    this.scoreRows.addChild(header);

    // Rows
    match.players.forEach((p, idx) => {
      const isLocal = p.id === localId;
      const name = `${p.name.slice(0, 14)}${isLocal ? " (You)" : ""}`.padEnd(
        18,
        " ",
      );
      const frags = p.frags.toString().padStart(5, " ");
      const holes = p.holes.toString().padStart(7, " ");
      const total = `${p.score} pts`.padStart(8, " ");

      const rowText = new Text({
        text: `${name}${frags}${holes}   ${total}`,
        style: {
          fontFamily: "monospace",
          fontSize: 14,
          fontWeight: isLocal ? "bold" : "normal",
          fill: isLocal ? 0x38bdf8 : 0xf1f5f9,
        },
      });
      rowText.position.set(-200, 26 + idx * 24);
      this.scoreRows.addChild(rowText);
    });

    this.visible = true;
  }

  public hide(): void {
    this.visible = false;
  }

  public reposition(width: number, height: number): void {
    this.backdrop.clear();
    this.backdrop
      .rect(0, 0, width, height)
      .fill({ color: 0x000000, alpha: 0.65 });

    const cardW = 500;
    const cardH = 340;

    this.cardBg.clear();
    this.cardBg
      .roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16)
      .fill({ color: 0x0f172a, alpha: 0.95 })
      .stroke({ color: 0x334155, width: 2 });

    this.titleText.position.set(0, -cardH / 2 + 28);
    this.subtitleText.position.set(0, -cardH / 2 + 95);
    this.scoreRows.position.set(0, -cardH / 2 + 135);

    this.rematchButton.position.set(-95, cardH / 2 - 45);
    this.leaveButton.position.set(95, cardH / 2 - 45);

    this.card.position.set(width * 0.5, height * 0.5);
  }

  public getTitleText(): string {
    return this.titleText.text;
  }

  public getSubtitleText(): string {
    return this.subtitleText.text;
  }
}
