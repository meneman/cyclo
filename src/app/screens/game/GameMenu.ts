import { Container, Graphics, Text } from "pixi.js";

import { PLAYER_COLORS } from "../../../../shared/constants";
import type { PlayerState } from "../../../../shared/types";
import { userSettings } from "../../utils/userSettings";

export const MENU_PANEL_WIDTH = 720;
export const MENU_PANEL_HEIGHT = 560;

export const COLOR_NAMES: Record<number, string> = {
  0xef4444: "Red",
  0x3b82f6: "Blue",
  0x22c55e: "Green",
  0xf59e0b: "Amber",
  0xa855f7: "Purple",
  0xec4899: "Pink",
  0x14b8a6: "Teal",
  0xf97316: "Orange",
  0x06b6d4: "Cyan",
  0x84cc16: "Lime",
  0xe11d48: "Rose",
  0x8b5cf6: "Violet",
};

export type MenuTab = "players" | "color" | "settings";

/**
 * In-game menu overlay displaying:
 * 1. Players currently on the server (names, color swatches, bot/player tags, frags, holes)
 * 2. Color selection palette (12 colors, live update of golfer & ball)
 * 3. Settings panel (dummy controls for graphics, shadows, FPS, plus volume sliders)
 */
export class GameMenu extends Container {
  public onSelectColor?: (color: number) => void;
  public onClose?: () => void;

  private _isOpen = false;
  private currentTab: MenuTab = "players";
  private selectedColor: number = PLAYER_COLORS[0];
  private localPlayerId: string | null = null;
  private playerList: PlayerState[] = [];

  // Dummy setting states
  private dummyGraphics = "High";
  private dummyShadows = true;
  private dummyFpsHud = true;
  private dummyAimArc = "Dotted";

  private readonly backdrop = new Graphics();
  private readonly panel = new Container();
  private readonly panelBg = new Graphics();
  private readonly header = new Container();
  private readonly tabBar = new Container();
  private readonly contentArea = new Container();
  private readonly footer = new Container();

  private tabButtons: Map<
    MenuTab,
    { bg: Graphics; label: Text; container: Container }
  > = new Map();

  constructor() {
    super();
    this.visible = false;
    this.eventMode = "static";

    // Fullscreen dark backdrop
    this.backdrop.eventMode = "static";
    this.backdrop.cursor = "default";
    this.backdrop.on("pointerdown", () => this.close());
    this.addChild(this.backdrop);

    // Centered dialog panel
    this.panel.eventMode = "static";
    this.panel.addChild(this.panelBg);
    this.panel.addChild(this.header);
    this.panel.addChild(this.tabBar);
    this.panel.addChild(this.contentArea);
    this.panel.addChild(this.footer);
    this.addChild(this.panel);

    this.buildHeader();
    this.buildTabBar();
    this.buildFooter();
    this.renderActiveTab();
  }

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public open(
    localId?: string | null,
    localColor?: number,
    players?: PlayerState[],
  ): void {
    this._isOpen = true;
    this.visible = true;
    if (localId !== undefined) this.localPlayerId = localId;
    if (localColor !== undefined) this.selectedColor = localColor;
    if (players !== undefined) this.playerList = [...players];
    this.renderActiveTab();
  }

  public close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.visible = false;
    this.onClose?.();
  }

  public toggle(
    localId?: string | null,
    localColor?: number,
    players?: PlayerState[],
  ): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open(localId, localColor, players);
    }
  }

  public updatePlayers(
    players: PlayerState[],
    localId?: string | null,
    localColor?: number,
  ): void {
    this.playerList = [...players];
    if (localId !== undefined) this.localPlayerId = localId;
    if (localColor !== undefined) this.selectedColor = localColor;
    if (this._isOpen && this.currentTab === "players") {
      this.renderPlayersTab();
    }
  }

  public setSelectedColor(color: number): void {
    this.selectedColor = color;
    if (this._isOpen && this.currentTab === "color") {
      this.renderColorTab();
    }
  }

  public resize(width: number, height: number): void {
    this.backdrop.clear();
    this.backdrop.rect(0, 0, width, height);
    this.backdrop.fill({ color: 0x000000, alpha: 0.72 });

    const px = Math.max(0, (width - MENU_PANEL_WIDTH) / 2);
    const py = Math.max(0, (height - MENU_PANEL_HEIGHT) / 2);
    this.panel.position.set(px, py);

    this.panelBg.clear();
    this.panelBg.roundRect(0, 0, MENU_PANEL_WIDTH, MENU_PANEL_HEIGHT, 14);
    this.panelBg.fill({ color: 0x0d1117, alpha: 0.96 });
    this.panelBg.stroke({ color: 0x30363d, width: 2 });
  }

  private buildHeader(): void {
    this.header.removeChildren();

    const title = new Text({
      text: "GOLFI MENU",
      style: {
        fontFamily: "monospace",
        fontSize: 22,
        fontWeight: "bold",
        fill: 0xffffff,
      },
    });
    title.position.set(24, 20);
    this.header.addChild(title);

    // Close [X] button at top right
    const closeBtn = new Container();
    closeBtn.eventMode = "static";
    closeBtn.cursor = "pointer";

    const closeBg = new Graphics();
    closeBg.roundRect(0, 0, 36, 36, 8);
    closeBg.fill({ color: 0x21262d });
    closeBg.stroke({ color: 0x30363d, width: 1 });
    closeBtn.addChild(closeBg);

    const closeIcon = new Text({
      text: "✕",
      style: {
        fontFamily: "monospace",
        fontSize: 16,
        fontWeight: "bold",
        fill: 0xc9d1d9,
      },
    });
    closeIcon.anchor.set(0.5);
    closeIcon.position.set(18, 18);
    closeBtn.addChild(closeIcon);

    closeBtn.on("pointerenter", () => {
      closeBg.clear();
      closeBg.roundRect(0, 0, 36, 36, 8);
      closeBg.fill({ color: 0x30363d });
      closeBg.stroke({ color: 0xf85149, width: 1.5 });
    });
    closeBtn.on("pointerleave", () => {
      closeBg.clear();
      closeBg.roundRect(0, 0, 36, 36, 8);
      closeBg.fill({ color: 0x21262d });
      closeBg.stroke({ color: 0x30363d, width: 1 });
    });
    closeBtn.on("pointertap", () => this.close());

    closeBtn.position.set(MENU_PANEL_WIDTH - 24 - 36, 16);
    this.header.addChild(closeBtn);
  }

  private buildTabBar(): void {
    this.tabBar.removeChildren();
    this.tabButtons.clear();

    const tabs: Array<{ id: MenuTab; label: string }> = [
      { id: "players", label: "👥 Players" },
      { id: "color", label: "🎨 Color" },
      { id: "settings", label: "⚙ Settings" },
    ];

    const tabWidth = 140;
    const tabHeight = 36;
    const gap = 8;
    const startX = 24;
    const startY = 62;

    tabs.forEach((tab, index) => {
      const btn = new Container();
      btn.eventMode = "static";
      btn.cursor = "pointer";
      btn.position.set(startX + index * (tabWidth + gap), startY);

      const bg = new Graphics();
      btn.addChild(bg);

      const label = new Text({
        text: tab.label,
        style: {
          fontFamily: "monospace",
          fontSize: 14,
          fontWeight: "bold",
          fill: 0xffffff,
        },
      });
      label.anchor.set(0.5);
      label.position.set(tabWidth / 2, tabHeight / 2);
      btn.addChild(label);

      btn.on("pointertap", () => {
        if (this.currentTab !== tab.id) {
          this.currentTab = tab.id;
          this.updateTabStyles();
          this.renderActiveTab();
        }
      });

      this.tabButtons.set(tab.id, { bg, label, container: btn });
      this.tabBar.addChild(btn);
    });

    this.updateTabStyles();
  }

  private updateTabStyles(): void {
    const tabWidth = 140;
    const tabHeight = 36;

    for (const [id, { bg, label }] of this.tabButtons) {
      const isActive = id === this.currentTab;
      bg.clear();
      bg.roundRect(0, 0, tabWidth, tabHeight, 8);
      if (isActive) {
        bg.fill({ color: 0x1f6feb });
        bg.stroke({ color: 0x58a6ff, width: 1.5 });
        label.style.fill = 0xffffff;
      } else {
        bg.fill({ color: 0x161b22 });
        bg.stroke({ color: 0x30363d, width: 1 });
        label.style.fill = 0x8b949e;
      }
    }
  }

  private buildFooter(): void {
    this.footer.removeChildren();

    const footerY = MENU_PANEL_HEIGHT - 60;

    // Resume Button
    const resumeBtn = new Container();
    resumeBtn.eventMode = "static";
    resumeBtn.cursor = "pointer";

    const btnWidth = 200;
    const btnHeight = 42;
    resumeBtn.position.set((MENU_PANEL_WIDTH - btnWidth) / 2, footerY);

    const btnBg = new Graphics();
    btnBg.roundRect(0, 0, btnWidth, btnHeight, 8);
    btnBg.fill({ color: 0x238636 });
    btnBg.stroke({ color: 0x2ea043, width: 1.5 });
    resumeBtn.addChild(btnBg);

    const btnText = new Text({
      text: "RESUME GAME",
      style: {
        fontFamily: "monospace",
        fontSize: 15,
        fontWeight: "bold",
        fill: 0xffffff,
      },
    });
    btnText.anchor.set(0.5);
    btnText.position.set(btnWidth / 2, btnHeight / 2);
    resumeBtn.addChild(btnText);

    resumeBtn.on("pointerenter", () => {
      btnBg.clear();
      btnBg.roundRect(0, 0, btnWidth, btnHeight, 8);
      btnBg.fill({ color: 0x2ea043 });
      btnBg.stroke({ color: 0x3fb950, width: 1.5 });
    });
    resumeBtn.on("pointerleave", () => {
      btnBg.clear();
      btnBg.roundRect(0, 0, btnWidth, btnHeight, 8);
      btnBg.fill({ color: 0x238636 });
      btnBg.stroke({ color: 0x2ea043, width: 1.5 });
    });
    resumeBtn.on("pointertap", () => this.close());

    this.footer.addChild(resumeBtn);

    // Subtle hint
    const hint = new Text({
      text: "Press ESC or click backdrop to close",
      style: {
        fontFamily: "monospace",
        fontSize: 12,
        fill: 0x8b949e,
      },
    });
    hint.position.set(24, footerY + 12);
    this.footer.addChild(hint);
  }

  private renderActiveTab(): void {
    this.contentArea.removeChildren();
    this.updateTabStyles();

    switch (this.currentTab) {
      case "players":
        this.renderPlayersTab();
        break;
      case "color":
        this.renderColorTab();
        break;
      case "settings":
        this.renderSettingsTab();
        break;
    }
  }

  // ── Tab 1: Players ────────────────────────────────────────────────────────

  private renderPlayersTab(): void {
    this.contentArea.removeChildren();

    const startY = 112;
    const title = new Text({
      text: `PLAYERS ON SERVER (${this.playerList.length})`,
      style: {
        fontFamily: "monospace",
        fontSize: 15,
        fontWeight: "bold",
        fill: 0xe6edf3,
      },
    });
    title.position.set(24, startY);
    this.contentArea.addChild(title);

    const listContainer = new Container();
    listContainer.position.set(24, startY + 28);
    this.contentArea.addChild(listContainer);

    const rowWidth = MENU_PANEL_WIDTH - 48;
    const rowHeight = 36;
    const maxVisibleRows = 8;
    const displayedPlayers = this.playerList.slice(0, maxVisibleRows);

    if (displayedPlayers.length === 0) {
      const emptyText = new Text({
        text: "Connecting to server...",
        style: {
          fontFamily: "monospace",
          fontSize: 14,
          fill: 0x8b949e,
        },
      });
      emptyText.position.set(10, 15);
      listContainer.addChild(emptyText);
      return;
    }

    displayedPlayers.forEach((player, i) => {
      const row = new Container();
      row.position.set(0, i * (rowHeight + 4));

      const isLocal = player.id === this.localPlayerId;
      const isBot =
        player.id.startsWith("bot-") || player.name.startsWith("Bot ");

      const rowBg = new Graphics();
      rowBg.roundRect(0, 0, rowWidth, rowHeight, 6);
      rowBg.fill({
        color: isLocal ? 0x1f2937 : i % 2 === 0 ? 0x161b22 : 0x12171f,
      });
      rowBg.stroke({
        color: isLocal ? 0x3b82f6 : 0x21262d,
        width: isLocal ? 1.5 : 1,
      });
      row.addChild(rowBg);

      // Color Swatch Circle
      const swatch = new Graphics();
      swatch.circle(20, rowHeight / 2, 7);
      swatch.fill({ color: player.color });
      swatch.stroke({ color: 0x000000, width: 1.5 });
      row.addChild(swatch);

      // Player Name
      const nameText = new Text({
        text: player.name,
        style: {
          fontFamily: "monospace",
          fontSize: 14,
          fontWeight: isLocal ? "bold" : "normal",
          fill: isLocal ? 0x58a6ff : 0xe6edf3,
        },
      });
      nameText.anchor.set(0, 0.5);
      nameText.position.set(38, rowHeight / 2);
      row.addChild(nameText);

      // Tag Badge (YOU / BOT / PLAYER)
      const badgeContainer = new Container();
      const badgeBg = new Graphics();
      let badgeLabel = "PLAYER";
      let badgeColor = 0x30363d;
      let badgeTextColor = 0x8b949e;
      let badgeWidth = 60;

      if (isLocal) {
        badgeLabel = "YOU";
        badgeColor = 0x238636;
        badgeTextColor = 0xffffff;
        badgeWidth = 42;
      } else if (isBot) {
        badgeLabel = "BOT";
        badgeColor = 0x21262d;
        badgeTextColor = 0x8b949e;
        badgeWidth = 42;
      }

      const badgeText = new Text({
        text: badgeLabel,
        style: {
          fontFamily: "monospace",
          fontSize: 11,
          fontWeight: "bold",
          fill: badgeTextColor,
        },
      });
      badgeBg.roundRect(0, 0, badgeWidth, 20, 4);
      badgeBg.fill({ color: badgeColor });

      badgeContainer.addChild(badgeBg);
      badgeText.anchor.set(0.5);
      badgeText.position.set(badgeWidth / 2, 10);
      badgeContainer.addChild(badgeText);
      badgeContainer.position.set(240, (rowHeight - 20) / 2);
      row.addChild(badgeContainer);

      // Frags & Holes Stats
      const fragsText = new Text({
        text: `⚡ ${player.frags ?? 0} kills`,
        style: {
          fontFamily: "monospace",
          fontSize: 13,
          fontWeight: "bold",
          fill: 0xff6b6b,
        },
      });
      fragsText.anchor.set(0, 0.5);
      fragsText.position.set(340, rowHeight / 2);
      row.addChild(fragsText);

      const holesText = new Text({
        text: `⛳ ${player.holes ?? 0} holes`,
        style: {
          fontFamily: "monospace",
          fontSize: 13,
          fontWeight: "bold",
          fill: 0x38ef7d,
        },
      });
      holesText.anchor.set(0, 0.5);
      holesText.position.set(460, rowHeight / 2);
      row.addChild(holesText);

      listContainer.addChild(row);
    });

    if (this.playerList.length > maxVisibleRows) {
      const moreText = new Text({
        text: `+ ${this.playerList.length - maxVisibleRows} more golfers roam the course`,
        style: {
          fontFamily: "monospace",
          fontSize: 12,
          fill: 0x8b949e,
        },
      });
      moreText.position.set(0, maxVisibleRows * (rowHeight + 4) + 6);
      listContainer.addChild(moreText);
    }
  }

  // ── Tab 2: Color Selection ────────────────────────────────────────────────

  private renderColorTab(): void {
    this.contentArea.removeChildren();

    const startY = 112;
    const title = new Text({
      text: "SELECT YOUR GOLFER COLOR",
      style: {
        fontFamily: "monospace",
        fontSize: 15,
        fontWeight: "bold",
        fill: 0xe6edf3,
      },
    });
    title.position.set(24, startY);
    this.contentArea.addChild(title);

    const subtitle = new Text({
      text: "Instantly updates your shirt, nametag dot, and golf ball owner ring:",
      style: {
        fontFamily: "monospace",
        fontSize: 12,
        fill: 0x8b949e,
      },
    });
    subtitle.position.set(24, startY + 22);
    this.contentArea.addChild(subtitle);

    const gridContainer = new Container();
    gridContainer.position.set(24, startY + 48);
    this.contentArea.addChild(gridContainer);

    const cols = 4;
    const swatchW = 156;
    const swatchH = 56;
    const gapX = 16;
    const gapY = 12;

    PLAYER_COLORS.forEach((color, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      const btn = new Container();
      btn.eventMode = "static";
      btn.cursor = "pointer";
      btn.position.set(col * (swatchW + gapX), row * (swatchH + gapY));

      const isSelected = color === this.selectedColor;
      const colorName = COLOR_NAMES[color] ?? `#${color.toString(16)}`;

      const bg = new Graphics();
      bg.roundRect(0, 0, swatchW, swatchH, 8);
      bg.fill({ color });
      if (isSelected) {
        bg.stroke({ color: 0xffffff, width: 3.5 });
      } else {
        bg.stroke({ color: 0x000000, width: 1.5 });
      }
      btn.addChild(bg);

      // Name Label
      const name = new Text({
        text: colorName,
        style: {
          fontFamily: "monospace",
          fontSize: 14,
          fontWeight: "bold",
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 3 },
        },
      });
      name.anchor.set(0.5);
      name.position.set(swatchW / 2, swatchH / 2);
      btn.addChild(name);

      if (isSelected) {
        const check = new Text({
          text: "✓",
          style: {
            fontFamily: "monospace",
            fontSize: 16,
            fontWeight: "bold",
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 3 },
          },
        });
        check.position.set(swatchW - 22, 6);
        btn.addChild(check);
      }

      btn.on("pointerenter", () => {
        if (!isSelected) {
          bg.clear();
          bg.roundRect(0, 0, swatchW, swatchH, 8);
          bg.fill({ color });
          bg.stroke({ color: 0xffffff, width: 2 });
        }
      });
      btn.on("pointerleave", () => {
        if (!isSelected) {
          bg.clear();
          bg.roundRect(0, 0, swatchW, swatchH, 8);
          bg.fill({ color });
          bg.stroke({ color: 0x000000, width: 1.5 });
        }
      });

      btn.on("pointertap", () => {
        this.selectedColor = color;
        userSettings.setPlayerColor(color);
        this.onSelectColor?.(color);
        this.renderColorTab();
      });

      gridContainer.addChild(btn);
    });

    // Preview Card
    const previewContainer = new Container();
    previewContainer.position.set(24, startY + 48 + 3 * (swatchH + gapY) + 10);

    const prevBg = new Graphics();
    prevBg.roundRect(0, 0, MENU_PANEL_WIDTH - 48, 44, 8);
    prevBg.fill({ color: 0x161b22 });
    prevBg.stroke({ color: 0x30363d, width: 1 });
    previewContainer.addChild(prevBg);

    const currentName = COLOR_NAMES[this.selectedColor] ?? "Custom";
    const prevText = new Text({
      text: `Active Color: ${currentName} (#${this.selectedColor.toString(16).padStart(6, "0").toUpperCase()})`,
      style: {
        fontFamily: "monospace",
        fontSize: 14,
        fontWeight: "bold",
        fill: 0xe6edf3,
      },
    });
    prevText.anchor.set(0, 0.5);
    prevText.position.set(16, 22);
    previewContainer.addChild(prevText);

    const prevSwatch = new Graphics();
    prevSwatch.circle(MENU_PANEL_WIDTH - 48 - 24, 22, 10);
    prevSwatch.fill({ color: this.selectedColor });
    prevSwatch.stroke({ color: 0xffffff, width: 2 });
    previewContainer.addChild(prevSwatch);

    this.contentArea.addChild(previewContainer);
  }

  // ── Tab 3: Settings (Dummy for now) ────────────────────────────────────────

  private renderSettingsTab(): void {
    this.contentArea.removeChildren();

    const startY = 112;
    const title = new Text({
      text: "SETTINGS (PREVIEW)",
      style: {
        fontFamily: "monospace",
        fontSize: 15,
        fontWeight: "bold",
        fill: 0xe6edf3,
      },
    });
    title.position.set(24, startY);
    this.contentArea.addChild(title);

    const subtitle = new Text({
      text: "Game options & dummy toggle preview for upcoming feature updates:",
      style: {
        fontFamily: "monospace",
        fontSize: 12,
        fill: 0x8b949e,
      },
    });
    subtitle.position.set(24, startY + 22);
    this.contentArea.addChild(subtitle);

    const settingsContainer = new Container();
    settingsContainer.position.set(24, startY + 50);
    this.contentArea.addChild(settingsContainer);

    let currentY = 0;

    // 1. Graphics Quality (Dummy)
    currentY = this.createToggleRow(
      settingsContainer,
      currentY,
      "Graphics Quality",
      ["Low", "Medium", "High", "Ultra"],
      this.dummyGraphics,
      (opt) => {
        this.dummyGraphics = opt;
        this.renderSettingsTab();
      },
    );

    // 2. Dynamic Course Shadows (Dummy)
    currentY = this.createToggleRow(
      settingsContainer,
      currentY,
      "Dynamic Shadows",
      ["Enabled", "Disabled"],
      this.dummyShadows ? "Enabled" : "Disabled",
      (opt) => {
        this.dummyShadows = opt === "Enabled";
        this.renderSettingsTab();
      },
    );

    // 3. Performance HUD (Dummy)
    currentY = this.createToggleRow(
      settingsContainer,
      currentY,
      "Performance HUD",
      ["ON", "OFF"],
      this.dummyFpsHud ? "ON" : "OFF",
      (opt) => {
        this.dummyFpsHud = opt === "ON";
        this.renderSettingsTab();
      },
    );

    // 4. Aim Trajectory (Dummy)
    currentY = this.createToggleRow(
      settingsContainer,
      currentY,
      "Aim Trajectory",
      ["Dotted", "Minimal"],
      this.dummyAimArc,
      (opt) => {
        this.dummyAimArc = opt;
        this.renderSettingsTab();
      },
    );

    // 5. Sound Volume Controls (Hooked to userSettings)
    const masterVol = Math.round(userSettings.getMasterVolume() * 100);
    const volLabel = masterVol === 0 ? "Muted" : `${masterVol}%`;
    currentY = this.createToggleRow(
      settingsContainer,
      currentY,
      `Master Volume (${volLabel})`,
      ["Mute", "50%", "100%"],
      masterVol === 0 ? "Mute" : masterVol === 50 ? "50%" : "100%",
      (opt) => {
        const val = opt === "Mute" ? 0 : opt === "50%" ? 0.5 : 1;
        userSettings.setMasterVolume(val);
        this.renderSettingsTab();
      },
    );

    // Disclaimer
    const note = new Text({
      text: "* Settings marked with (Dummy) are interactive UI placeholders for upcoming graphics configs.",
      style: {
        fontFamily: "monospace",
        fontSize: 11,
        fill: 0x8b949e,
      },
    });
    note.position.set(0, currentY + 10);
    settingsContainer.addChild(note);
  }

  private createToggleRow(
    parent: Container,
    y: number,
    title: string,
    options: string[],
    selectedOption: string,
    onSelect: (option: string) => void,
  ): number {
    const row = new Container();
    row.position.set(0, y);

    const label = new Text({
      text: title,
      style: {
        fontFamily: "monospace",
        fontSize: 14,
        fontWeight: "bold",
        fill: 0xc9d1d9,
      },
    });
    label.position.set(0, 8);
    row.addChild(label);

    const btnGroup = new Container();
    btnGroup.position.set(240, 0);

    const btnWidth = 90;
    const btnHeight = 32;
    const gap = 8;

    options.forEach((opt, idx) => {
      const btn = new Container();
      btn.eventMode = "static";
      btn.cursor = "pointer";
      btn.position.set(idx * (btnWidth + gap), 0);

      const isSel = opt === selectedOption;

      const bg = new Graphics();
      bg.roundRect(0, 0, btnWidth, btnHeight, 6);
      if (isSel) {
        bg.fill({ color: 0x1f6feb });
        bg.stroke({ color: 0x58a6ff, width: 1.5 });
      } else {
        bg.fill({ color: 0x21262d });
        bg.stroke({ color: 0x30363d, width: 1 });
      }
      btn.addChild(bg);

      const btnText = new Text({
        text: opt,
        style: {
          fontFamily: "monospace",
          fontSize: 12,
          fontWeight: isSel ? "bold" : "normal",
          fill: isSel ? 0xffffff : 0x8b949e,
        },
      });
      btnText.anchor.set(0.5);
      btnText.position.set(btnWidth / 2, btnHeight / 2);
      btn.addChild(btnText);

      btn.on("pointertap", () => onSelect(opt));
      btnGroup.addChild(btn);
    });

    row.addChild(btnGroup);
    parent.addChild(row);

    return y + 42;
  }
}
