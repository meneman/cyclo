import { Container, Graphics, Text } from "pixi.js";

import { MAX_INVENTORY_ITEMS, getItem } from "../../../../shared/items";
import type { PlayerLoadout } from "../../../../shared/types";

const PANEL_WIDTH = 190;
const PANEL_PADDING_X = 14;
const HEADER_HEIGHT = 26;
const ROW_HEIGHT = 20;

/**
 * Bottom-right inventory readout: owned item names (oldest first, max 5),
 * equipped entries highlighted. Same monochrome panel language as StatsPanel.
 */
export class InventoryPanel extends Container {
  private readonly bg: Graphics;
  private readonly header: Text;
  private readonly rows: Text[] = [];
  private lastKey = "";

  constructor() {
    super();

    this.bg = new Graphics();
    this.drawBackground();
    this.addChild(this.bg);

    this.header = new Text({
      text: `INV 0/${MAX_INVENTORY_ITEMS}`,
      style: {
        fontFamily: "monospace",
        fontSize: 13,
        fontWeight: "bold",
        fill: 0xe6edf3,
      },
    });
    this.header.position.set(PANEL_PADDING_X, 6);
    this.addChild(this.header);

    for (let i = 0; i < MAX_INVENTORY_ITEMS; i++) {
      const row = new Text({
        text: "—",
        style: {
          fontFamily: "monospace",
          fontSize: 13,
          fill: 0x30363d,
        },
      });
      row.position.set(PANEL_PADDING_X, HEADER_HEIGHT + i * ROW_HEIGHT);
      this.addChild(row);
      this.rows.push(row);
    }
  }

  private drawBackground(): void {
    this.bg.clear();
    this.bg.roundRect(
      0,
      0,
      PANEL_WIDTH,
      HEADER_HEIGHT + MAX_INVENTORY_ITEMS * ROW_HEIGHT + 8,
      8,
    );
    this.bg.fill({ color: 0x0d1117, alpha: 0.82 });
    this.bg.stroke({ color: 0x30363d, width: 1.5, alpha: 0.9 });
  }

  public setInventory(
    inventory: readonly string[],
    loadout?: PlayerLoadout | null,
    itemStacks?: Record<string, number> | null,
  ): void {
    const equipped = new Set(
      [loadout?.ball, loadout?.club, loadout?.outfit].filter(
        (id): id is string => typeof id === "string",
      ),
    );
    const stacksKey = inventory
      .map((id) => `${id}:${itemStacks?.[id] ?? 1}`)
      .join(",");
    const key = `${inventory.join(",")}|${[...equipped].sort().join(",")}|${stacksKey}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.header.text = `INV ${inventory.length}/${MAX_INVENTORY_ITEMS}`;
    for (let i = 0; i < MAX_INVENTORY_ITEMS; i++) {
      const row = this.rows[i];
      const itemId = inventory[i];
      const item = itemId !== undefined ? getItem(itemId) : undefined;
      if (!row || !item) {
        row.text = "—";
        row.style.fill = 0x30363d;
        continue;
      }
      const isEquipped = equipped.has(item.id);
      const count = itemStacks?.[item.id] ?? 1;
      const stackSuffix = count > 1 ? ` x${count}` : "";
      row.text = `${isEquipped ? "▸ " : "· "}${item.name}${stackSuffix}`;
      row.style.fill = isEquipped ? 0x58a6ff : 0xe6edf3;
    }
  }

  public reposition(
    viewportWidth: number,
    viewportHeight: number,
    margin: number = 12,
  ): void {
    this.position.set(
      viewportWidth - margin - PANEL_WIDTH,
      viewportHeight -
        margin -
        (HEADER_HEIGHT + MAX_INVENTORY_ITEMS * ROW_HEIGHT + 8),
    );
  }
}
