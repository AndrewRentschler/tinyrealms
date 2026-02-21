/**
 * Item picker (item definitions for world placement) builder.
 */
import {
  EDITOR_DEFAULT_RESPAWN_MIN,
  EDITOR_DEFAULT_RESPAWN_MS,
  EDITOR_ITEM_INSPECT_RADIUS,
  EDITOR_ITEM_REMOVE_RADIUS,
} from "../../constants/editor.ts";
import type { ItemDef, PlacedItem } from "./types.ts";
import {
  createEmptyStateMessage,
  createPickerListItem,
} from "./helpers.ts";

export const ITEM_PLACE_DEBUG = true;

export interface ItemPickerContext {
  itemDefs: ItemDef[];
  selectedItemDef: ItemDef | null;
  placedItems: PlacedItem[];
  itemListEl: HTMLElement;
  itemRespawnCheck: HTMLInputElement;
  itemRespawnTimeInput: HTMLInputElement;
  tileInfoEl: HTMLDivElement;
  game: { worldItemLayer?: { addItem(item: unknown, def: ItemDef): void; removeItem(id: string): void; showGhost(def: ItemDef): void; hideGhost(): void; updateGhost(x: number, y: number): void } } | null;
  loadItemDefs(): void;
  renderItemList(): void;
  updateGhostForCurrentSelection(): void;
  showSaveStatus(text: string, isError?: boolean): void;
}

export function buildItemPicker(ctx: ItemPickerContext): HTMLElement {
  const picker = document.createElement("div");
  picker.className = "tileset-picker";

  const header = document.createElement("div");
  header.className = "tileset-picker-header";

  const label = document.createElement("div");
  label.className = "tileset-picker-label";
  label.textContent = "Items";
  header.appendChild(label);

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "editor-tool-btn";
  refreshBtn.textContent = "↻ Refresh";
  refreshBtn.style.fontSize = "11px";
  refreshBtn.addEventListener("click", () => ctx.loadItemDefs());
  header.appendChild(refreshBtn);

  picker.appendChild(header);

  const itemListEl = document.createElement("div");
  itemListEl.className = "object-list";
  picker.appendChild(itemListEl);
  (ctx as { itemListEl: HTMLElement }).itemListEl = itemListEl;

  const respawnRow = document.createElement("div");
  respawnRow.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:6px 8px;border-top:1px solid var(--border);";

  const itemRespawnCheck = document.createElement("input");
  itemRespawnCheck.type = "checkbox";
  itemRespawnCheck.id = "item-respawn-check";

  const respawnLabel = document.createElement("label");
  respawnLabel.htmlFor = "item-respawn-check";
  respawnLabel.textContent = "Respawn after";
  respawnLabel.style.cssText =
    "font-size:11px;color:var(--text);cursor:pointer;";

  const itemRespawnTimeInput = document.createElement("input");
  itemRespawnTimeInput.type = "number";
  itemRespawnTimeInput.min = "1";
  itemRespawnTimeInput.value = String(EDITOR_DEFAULT_RESPAWN_MIN);
  itemRespawnTimeInput.style.cssText =
    "width:42px;font-size:11px;padding:2px 4px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:3px;";

  const minLabel = document.createElement("span");
  minLabel.textContent = "min";
  minLabel.style.cssText = "font-size:11px;color:var(--text-muted);";

  respawnRow.appendChild(itemRespawnCheck);
  respawnRow.appendChild(respawnLabel);
  respawnRow.appendChild(itemRespawnTimeInput);
  respawnRow.appendChild(minLabel);
  picker.appendChild(respawnRow);

  (ctx as { itemRespawnCheck: HTMLInputElement }).itemRespawnCheck =
    itemRespawnCheck;
  (ctx as { itemRespawnTimeInput: HTMLInputElement }).itemRespawnTimeInput =
    itemRespawnTimeInput;

  return picker;
}

export function itemTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    weapon: "⚔️",
    armor: "🛡",
    accessory: "💍",
    consumable: "🧪",
    material: "🪵",
    key: "🔑",
    currency: "🪙",
    quest: "📜",
    misc: "📦",
  };
  return icons[type] || "📦";
}

export function logItemPlacement(
  message: string,
  details?: Record<string, unknown>,
): void {
  if (!ITEM_PLACE_DEBUG) return;
  const prefix = `[MapEditor:item-place] ${message}`;
  if (
    message.startsWith("Skipped") ||
    message.includes("missing") ||
    message.includes("blocked")
  ) {
    if (details) console.warn(prefix, details);
    else console.warn(prefix);
    return;
  }
  if (details) console.log(prefix, details);
  else console.log(prefix);
}

export function placeItem(
  ctx: ItemPickerContext,
  worldX: number,
  worldY: number,
): void {
  if (!ctx.selectedItemDef) {
    logItemPlacement("Skipped placement: no selected item definition.", {
      worldX,
      worldY,
    });
    ctx.showSaveStatus("Select an item first", true);
    return;
  }
  const respawn = ctx.itemRespawnCheck.checked;
  const respawnMin =
    parseFloat(ctx.itemRespawnTimeInput.value) || EDITOR_DEFAULT_RESPAWN_MIN;
  const item: PlacedItem = {
    id: crypto.randomUUID(),
    itemDefName: ctx.selectedItemDef.name,
    x: Math.round(worldX),
    y: Math.round(worldY),
    quantity: 1,
    respawn: respawn || undefined,
    respawnMs: respawn ? Math.round(respawnMin * 60 * 1000) : undefined,
  };
  ctx.placedItems.push(item);
  logItemPlacement("Placed item.", {
    itemDefName: item.itemDefName,
    displayName: ctx.selectedItemDef.displayName,
    worldX,
    worldY,
    placedX: item.x,
    placedY: item.y,
    respawn: item.respawn ?? false,
    respawnMs: item.respawnMs ?? null,
    totalPlacedItems: ctx.placedItems.length,
  });
  const respawnNote = respawn ? ` (respawns in ${respawnMin}m)` : "";
  ctx.tileInfoEl.textContent = `Placed: ${ctx.selectedItemDef.displayName}${respawnNote} (${ctx.placedItems.length} items total)`;

  if (ctx.game?.worldItemLayer) {
    ctx.game.worldItemLayer.addItem(
      {
        id: item.id,
        itemDefName: item.itemDefName,
        x: item.x,
        y: item.y,
        quantity: item.quantity,
      },
      ctx.selectedItemDef,
    );
  } else {
    logItemPlacement("World item layer missing during placement render.", {
      hasGame: !!ctx.game,
      hasWorldItemLayer: !!ctx.game?.worldItemLayer,
    });
  }
}

export function removeItemAt(
  ctx: ItemPickerContext,
  worldX: number,
  worldY: number,
): void {
  const radius = EDITOR_ITEM_REMOVE_RADIUS;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < ctx.placedItems.length; i++) {
    const item = ctx.placedItems[i];
    const dx = item.x - worldX;
    const dy = item.y - worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < radius && dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) {
    const removed = ctx.placedItems.splice(bestIdx, 1)[0];
    if (ctx.game?.worldItemLayer) {
      ctx.game.worldItemLayer.removeItem(removed.id);
    }
    ctx.tileInfoEl.textContent = `Removed item (${ctx.placedItems.length} remaining)`;
  }
}

export function inspectItemAt(
  ctx: ItemPickerContext,
  worldX: number,
  worldY: number,
): boolean {
  const radius = EDITOR_ITEM_INSPECT_RADIUS;
  let bestItem: PlacedItem | null = null;
  let bestDist = Infinity;
  for (const item of ctx.placedItems) {
    const dx = item.x - worldX;
    const dy = item.y - worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < radius && dist < bestDist) {
      bestDist = dist;
      bestItem = item;
    }
  }
  if (!bestItem) return false;
  logItemPlacement(
    "Placement click intercepted by existing nearby item (inspect mode).",
    {
      clickedWorldX: worldX,
      clickedWorldY: worldY,
      nearestItemId: bestItem.id,
      nearestItemDefName: bestItem.itemDefName,
      nearestItemX: bestItem.x,
      nearestItemY: bestItem.y,
      nearestDistancePx: Math.round(bestDist),
      inspectRadiusPx: radius,
    },
  );

  const parts: string[] = [`Item: ${bestItem.itemDefName}`];
  parts.push(`qty: ${bestItem.quantity}`);
  if (bestItem.respawn) {
    const mins = Math.round((bestItem.respawnMs ?? EDITOR_DEFAULT_RESPAWN_MS) / 60_000);
    parts.push(`respawn: ${mins}m`);
  }
  if (bestItem.pickedUpAt) {
    const ago = Math.round((Date.now() - bestItem.pickedUpAt) / 1000);
    parts.push(`picked up ${ago}s ago`);
  }
  parts.push(`pos: (${Math.round(bestItem.x)}, ${Math.round(bestItem.y)})`);
  parts.push("hold Shift to force place");
  ctx.tileInfoEl.textContent = parts.join("  |  ");
  return true;
}

export function renderItemList(ctx: ItemPickerContext): void {
  ctx.itemListEl.innerHTML = "";

  if (ctx.itemDefs.length === 0) {
    ctx.itemListEl.appendChild(
      createEmptyStateMessage("No items yet. Create some in the Item Editor!"),
    );
    return;
  }

  for (const def of ctx.itemDefs) {
    const iconSpan = document.createElement("span");
    iconSpan.style.cssText = "margin-right:6px;font-size:14px;";
    if (def.iconTilesetUrl && def.iconTileW) {
      const c = document.createElement("canvas");
      c.width = 20;
      c.height = 20;
      c.style.cssText =
        "width:20px;height:20px;image-rendering:pixelated;vertical-align:middle;margin-right:4px;";
      const img = new Image();
      img.src = def.iconTilesetUrl;
      img.onload = () => {
        const cx = c.getContext("2d")!;
        cx.imageSmoothingEnabled = false;
        const sw = def.iconTileW!;
        const sh = def.iconTileH!;
        const scale = Math.min(20 / sw, 20 / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        cx.drawImage(
          img,
          def.iconTileX!,
          def.iconTileY!,
          sw,
          sh,
          (20 - dw) / 2,
          (20 - dh) / 2,
          dw,
          dh,
        );
      };
      iconSpan.appendChild(c);
    } else if (def.iconSpriteDefName) {
      iconSpan.textContent = "🎞️";
    } else {
      iconSpan.textContent = itemTypeIcon(def.type);
    }

    const row = createPickerListItem({
      id: def.name,
      label: def.displayName,
      sublabel: def.rarity,
      isActive: ctx.selectedItemDef?.name === def.name,
      leadingContent: iconSpan,
      onClick: () => {
        (ctx as { selectedItemDef: ItemDef | null }).selectedItemDef = def;
        ctx.tileInfoEl.textContent = `Item: ${def.displayName}`;
        ctx.renderItemList();
        ctx.updateGhostForCurrentSelection();
      },
    });
    ctx.itemListEl.appendChild(row);
  }
}
