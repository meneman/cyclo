import { Container, Graphics, Text } from "pixi.js";
import type { MatchState } from "../../../../shared/types";

export class MatchScoreboard extends Container {
  private readonly bg = new Graphics();
  private readonly statusText: Text;
  private readonly detailText: Text;
  private readonly copyButton: Container = new Container();
  private readonly copyButtonBg = new Graphics();
  private readonly copyButtonText: Text;

  private currentMatch: MatchState | null = null;
  private copyToastTimer = 0;

  constructor() {
    super();
    this.addChild(this.bg);

    this.statusText = new Text({
      text: "WAITING FOR OPPONENT (1/2)",
      style: {
        fontFamily: "monospace",
        fontSize: 16,
        fontWeight: "bold",
        fill: 0xfacc15,
        align: "center",
      },
    });
    this.statusText.anchor.set(0.5, 0);
    this.addChild(this.statusText);

    this.detailText = new Text({
      text: "",
      style: {
        fontFamily: "monospace",
        fontSize: 13,
        fill: 0xe2e8f0,
        align: "center",
      },
    });
    this.detailText.anchor.set(0.5, 0);
    this.addChild(this.detailText);

    // Copy link button
    this.copyButton.eventMode = "static";
    this.copyButton.cursor = "pointer";
    this.copyButton.addChild(this.copyButtonBg);

    this.copyButtonText = new Text({
      text: "Copy Invite Link",
      style: {
        fontFamily: "monospace",
        fontSize: 12,
        fontWeight: "bold",
        fill: 0x38bdf8,
      },
    });
    this.copyButtonText.anchor.set(0.5, 0.5);
    this.copyButton.addChild(this.copyButtonText);

    this.copyButton.on("pointertap", () => this.handleCopyLink());
    this.addChild(this.copyButton);
  }

  public setMatch(match: MatchState, localId: string | null): void {
    this.currentMatch = match;
    this.renderMatch(match, localId);
  }

  private renderMatch(match: MatchState, localId: string | null): void {
    const p1 = match.players[0];
    const p2 = match.players[1];

    if (match.status === "waiting") {
      this.statusText.text = "WAITING FOR OPPONENT (1/2)";
      this.statusText.style.fill = 0xfacc15; // Yellow
      this.detailText.text = `Room: ${match.roomId}  ·  Share invite link to play 1v1`;
      this.copyButton.visible = true;
    } else if (match.status === "countdown") {
      const s = match.countdownSeconds ?? 10;
      this.statusText.text = `MATCH STARTS IN ${s}s`;
      this.statusText.style.fill = 0x38bdf8; // Sky blue
      const p1Name = p1?.name ?? "Player 1";
      const p2Name = p2?.name ?? "Player 2";
      this.detailText.text = `${p1Name}  VS  ${p2Name}`;
      this.copyButton.visible = false;
    } else if (match.status === "playing") {
      const p1Name = p1?.name ?? "P1";
      const p1Score = p1?.score ?? 0;
      const p2Name = p2?.name ?? "P2";
      const p2Score = p2?.score ?? 0;

      const p1Tag = p1?.id === localId ? " (You)" : "";
      const p2Tag = p2?.id === localId ? " (You)" : "";

      this.statusText.text = `${p1Name}${p1Tag}  ${p1Score}  —  RACE TO 10  —  ${p2Score}  ${p2Name}${p2Tag}`;
      this.statusText.style.fill = 0x4ade80; // Green
      this.detailText.text = `First to 10 points wins!  (Kills: +1 pt · Holes: +1 pt)`;
      this.copyButton.visible = false;
    } else if (match.status === "finished") {
      const winner = match.winnerName ?? "Unknown";
      this.statusText.text = `🏆 ${winner.toUpperCase()} WON THE MATCH!`;
      this.statusText.style.fill = 0xf59e0b; // Gold
      this.detailText.text = `Match Finished  ·  Check results`;
      this.copyButton.visible = false;
    }

    this.layout();
  }

  private layout(): void {
    const padX = 24;
    const padY = 10;
    const hasCopy = this.copyButton.visible;

    this.statusText.position.set(0, padY);
    this.detailText.position.set(0, padY + 22);

    let totalHeight = padY + 44;
    if (hasCopy) {
      this.copyButton.position.set(0, totalHeight + 14);
      totalHeight += 32;

      this.copyButtonBg.clear();
      this.copyButtonBg
        .roundRect(-75, -12, 150, 24, 6)
        .fill({ color: 0x1e293b, alpha: 0.9 })
        .stroke({ color: 0x38bdf8, width: 1.5 });
    }

    const approxWidth = Math.max(
      this.statusText.text.length * 11,
      this.detailText.text.length * 8.5,
    );
    const boxWidth = Math.max(420, approxWidth + padX * 2);

    this.bg.clear();
    this.bg
      .roundRect(-boxWidth / 2, 0, boxWidth, totalHeight + padY, 12)
      .fill({ color: 0x0f172a, alpha: 0.88 })
      .stroke({ color: 0x334155, width: 2 });
  }

  public reposition(viewportWidth: number): void {
    this.position.set(viewportWidth * 0.5, 12);
  }

  public getStatusText(): string {
    return this.statusText.text;
  }

  public getDetailText(): string {
    return this.detailText.text;
  }

  public isCopyButtonVisible(): boolean {
    return this.copyButton.visible;
  }

  public update(dtSeconds: number): void {
    if (this.copyToastTimer > 0) {
      this.copyToastTimer -= dtSeconds;
      if (this.copyToastTimer <= 0) {
        this.copyButtonText.text = "Copy Invite Link";
        this.copyButtonText.style.fill = 0x38bdf8;
      }
    }
  }

  private handleCopyLink(): void {
    if (!this.currentMatch) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(this.currentMatch.roomId)}`;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url).then(() => {
        this.copyToastTimer = 2.5;
        this.copyButtonText.text = "Link Copied!";
        this.copyButtonText.style.fill = 0x4ade80;
      });
    }
  }
}
