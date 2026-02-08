/**
 * Map editor panel – toolbar (paint/erase/collision/object),
 * layer panel, tileset picker, object picker, and canvas painting.
 */
import type { Game } from "../engine/Game.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import "./MapEditor.css";
import "./TilesetPicker.css";
import "./LayerPanel.css";

export type EditorTool = "paint" | "erase" | "collision" | "collision-erase" | "object" | "object-erase" | "npc" | "npc-erase" | "portal" | "label" | "item" | "item-erase";
const TOOLS: { key: EditorTool; label: string }[] = [
  { key: "paint",        label: "🖌 Paint" },
  { key: "collision",    label: "🚧 Collision" },
  { key: "object",       label: "📦 Object" },
  { key: "npc",          label: "🧑 NPC" },
  { key: "item",         label: "⚔️ Item" },
  { key: "portal",       label: "🚪 Portal" },
  { key: "label",        label: "🏷 Label" },
];

/** Delete sub-tools shown in the Delete dropdown */
const DELETE_OPTIONS: { key: EditorTool; label: string }[] = [
  { key: "erase",            label: "🧹 Tile" },
  { key: "collision-erase",  label: "🚧 Collision" },
  { key: "object-erase",     label: "📦 Object" },
  { key: "npc-erase",        label: "🧑 NPC" },
  { key: "item-erase",       label: "⚔️ Item" },
];

/** Registry of available tilesets */
export interface TilesetInfo {
  name: string;
  url: string;
  tileWidth: number;
  tileHeight: number;
  imageWidth: number;
  imageHeight: number;
}

const TILESETS: TilesetInfo[] = [
  { name: "Fantasy Interior", url: "/assets/tilesets/fantasy-interior.png", tileWidth: 24, tileHeight: 24, imageWidth: 768, imageHeight: 7056 },
  { name: "Fantasy Exterior", url: "/assets/tilesets/fantasy-exterior.png", tileWidth: 24, tileHeight: 24, imageWidth: 768, imageHeight: 7056 },
  { name: "Gentle",           url: "/assets/tilesets/gentle.png",           tileWidth: 24, tileHeight: 24, imageWidth: 384, imageHeight: 2040 },
  { name: "Gentle Objects",   url: "/assets/tilesets/gentle-obj.png",       tileWidth: 24, tileHeight: 24, imageWidth: 384, imageHeight: 2040 },
  { name: "Forest",           url: "/assets/tilesets/forest.png",           tileWidth: 24, tileHeight: 24, imageWidth: 384, imageHeight: 384 },
  { name: "Mage City",        url: "/assets/tilesets/magecity.png",         tileWidth: 24, tileHeight: 24, imageWidth: 384, imageHeight: 384 },
  { name: "Mage Objects",     url: "/assets/tilesets/mage-obj.png",         tileWidth: 24, tileHeight: 24, imageWidth: 384, imageHeight: 1536 },
  { name: "Overworld Palma",  url: "/assets/tilesets/overworld_palma.png",  tileWidth: 16, tileHeight: 16, imageWidth: 512, imageHeight: 512 },
  { name: "PS1 Camineet",    url: "/assets/tilesets/ps1-camineet.png",    tileWidth: 16, tileHeight: 16, imageWidth: 832, imageHeight: 640 },
  { name: "Mage City",       url: "/assets/tilesets/mage-city.png",       tileWidth: 32, tileHeight: 32, imageWidth: 256, imageHeight: 1408 },
];

const DISPLAY_TILE_SIZE = 32;

// ---------------------------------------------------------------------------
// Placed object (in-memory, saved to Convex)
// ---------------------------------------------------------------------------
export interface PlacedObject {
  id: string;             // local UUID or Convex _id
  spriteDefName: string;
  instanceName?: string;  // unique NPC instance name (links to npcProfiles)
  x: number;              // world px
  y: number;              // world px
  layer: number;
  isOn?: boolean;         // toggle state for toggleable objects
}

/** Sprite definition row from Convex (subset of fields) */
interface SpriteDef {
  _id: string;
  name: string;
  category: string;
  spriteSheetUrl: string;
  defaultAnimation: string;
  frameWidth: number;
  frameHeight: number;
  scale: number;
  // NPC-specific
  npcSpeed?: number;
  npcWanderRadius?: number;
  npcDirDown?: string;
  npcDirUp?: string;
  npcDirLeft?: string;
  npcDirRight?: string;
  npcGreeting?: string;
  // Sound
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  interactSoundUrl?: string;
  // Toggle
  toggleable?: boolean;
  onAnimation?: string;
  offAnimation?: string;
  onSoundUrl?: string;
}

// ---------------------------------------------------------------------------
// MapEditorPanel
// ---------------------------------------------------------------------------
export class MapEditorPanel {
  readonly el: HTMLElement;
  private game: Game | null = null;

  private tool: EditorTool = "paint";
  private selectedTile = 0;
  /** Multi-tile brush selection (col/row in tileset grid, size in tiles) */
  private selectedRegion = { col: 0, row: 0, w: 1, h: 1 };
  private activeLayer = 0;
  private activeTileset: TilesetInfo = TILESETS[0];

  // Tileset drag-selection state
  private tsDragStart: { col: number; row: number } | null = null;

  // Object placement state
  private spriteDefs: SpriteDef[] = [];
  private selectedSpriteDef: SpriteDef | null = null;
  placedObjects: PlacedObject[] = [];

  // NPC picker state (separate from objects)
  private npcPickerEl!: HTMLElement;
  private npcListEl!: HTMLElement;

  // Item placement state
  private itemDefs: { name: string; displayName: string; type: string; rarity: string;
    iconTilesetUrl?: string; iconTileX?: number; iconTileY?: number;
    iconTileW?: number; iconTileH?: number }[] = [];
  private selectedItemDef: typeof this.itemDefs[0] | null = null;
  placedItems: { id: string; itemDefName: string; x: number; y: number;
    quantity: number; respawn?: boolean }[] = [];
  private itemPickerEl!: HTMLElement;
  private itemListEl!: HTMLElement;

  // Portal editor state
  private portalDraft: {
    name: string;
    targetMap: string;
    targetSpawn: string;
    direction: string;
    transition: string;
  } = { name: "", targetMap: "", targetSpawn: "start1", direction: "", transition: "fade" };
  private portalPlacing = false; // true when in "click-to-place" mode
  private portalStart: { tx: number; ty: number } | null = null;
  private availableMaps: { name: string }[] = [];

  // Label editor state
  private labelDraftName = "";
  private labelStart: { tx: number; ty: number } | null = null;

  // DOM refs
  private toolButtons: HTMLButtonElement[] = [];
  private deleteBtn!: HTMLButtonElement;
  private layerButtons: HTMLButtonElement[] = [];
  private tilesetSelect!: HTMLSelectElement;
  private tileCanvas!: HTMLCanvasElement;
  private tileCtx!: CanvasRenderingContext2D;
  private tilesetImage: HTMLImageElement | null = null;
  private highlightEl!: HTMLDivElement;
  private tileInfoEl!: HTMLDivElement;
  private saveStatusEl!: HTMLDivElement;
  private tilesetPickerEl!: HTMLElement;
  private objectPickerEl!: HTMLElement;
  private objectListEl!: HTMLElement;
  private portalPickerEl!: HTMLElement;
  private portalListEl!: HTMLElement;
  private labelPickerEl!: HTMLElement;
  private labelListEl!: HTMLElement;
  private gridBtn!: HTMLButtonElement;
  private tileSizeLabel!: HTMLDivElement;
  private mapDimsEl!: HTMLDivElement;

  // Canvas painting state
  private isPainting = false;
  private canvasClickHandler: ((e: MouseEvent) => void) | null = null;
  private canvasMoveHandler: ((e: MouseEvent) => void) | null = null;
  private canvasUpHandler: (() => void) | null = null;
  private canvasHoverHandler: ((e: MouseEvent) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "map-editor";
    this.el.style.display = "none";

    // ---- Toolbar ----
    const toolbar = document.createElement("div");
    toolbar.className = "editor-toolbar";

    for (const t of TOOLS) {
      const btn = document.createElement("button");
      btn.className = `editor-tool-btn ${this.tool === t.key ? "active" : ""}`;
      btn.textContent = t.label;
      btn.addEventListener("click", () => this.setTool(t.key));
      toolbar.appendChild(btn);
      this.toolButtons.push(btn);
    }

    // Delete dropdown button
    const deleteWrap = document.createElement("div");
    deleteWrap.style.cssText = "position:relative;display:inline-block;";
    this.deleteBtn = document.createElement("button");
    this.deleteBtn.className = "editor-tool-btn";
    this.deleteBtn.textContent = "🗑 Delete ▾";
    const deleteMenu = document.createElement("div");
    deleteMenu.className = "editor-delete-menu";
    deleteMenu.style.display = "none";
    for (const opt of DELETE_OPTIONS) {
      const item = document.createElement("button");
      item.className = "editor-delete-menu-item";
      item.textContent = opt.label;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteMenu.style.display = "none";
        this.setTool(opt.key);
        this.deleteBtn.classList.add("active");
        this.deleteBtn.textContent = `🗑 Del: ${opt.label}`;
      });
      deleteMenu.appendChild(item);
    }
    this.deleteBtn.addEventListener("click", () => {
      deleteMenu.style.display = deleteMenu.style.display === "none" ? "" : "none";
    });
    // Close menu when clicking elsewhere
    document.addEventListener("click", (e) => {
      if (!deleteWrap.contains(e.target as Node)) {
        deleteMenu.style.display = "none";
      }
    });
    deleteWrap.appendChild(this.deleteBtn);
    deleteWrap.appendChild(deleteMenu);
    toolbar.appendChild(deleteWrap);

    // Separator
    const sep = document.createElement("div");
    sep.style.cssText = "flex:1;";
    toolbar.appendChild(sep);

    // Grid toggle
    this.gridBtn = document.createElement("button");
    this.gridBtn.className = "editor-tool-btn";
    this.gridBtn.textContent = "▦ Grid";
    this.gridBtn.title = "Toggle tile grid on map";
    this.gridBtn.addEventListener("click", () => {
      if (!this.game) return;
      const on = this.game.mapRenderer.toggleGrid();
      this.gridBtn.classList.toggle("active", on);
      // Also redraw tileset grid
      this.renderTilesetGrid();
    });
    toolbar.appendChild(this.gridBtn);

    // Map dimensions label
    this.mapDimsEl = document.createElement("div");
    this.mapDimsEl.className = "editor-tile-info";
    this.mapDimsEl.title = "Map dimensions (tiles × tile size)";
    toolbar.appendChild(this.mapDimsEl);

    // Tile info
    this.tileInfoEl = document.createElement("div");
    this.tileInfoEl.className = "editor-tile-info";
    this.tileInfoEl.textContent = "Tile: 0";
    toolbar.appendChild(this.tileInfoEl);

    // Save button
    const saveBtn = document.createElement("button");
    saveBtn.className = "editor-tool-btn editor-save-btn";
    saveBtn.textContent = "💾 Save";
    saveBtn.addEventListener("click", () => this.saveAll());
    toolbar.appendChild(saveBtn);

    // Save status
    this.saveStatusEl = document.createElement("div");
    this.saveStatusEl.className = "editor-save-status";
    toolbar.appendChild(this.saveStatusEl);

    this.el.appendChild(toolbar);

    // ---- Panels container ----
    const panels = document.createElement("div");
    panels.className = "editor-panels";

    // Left: Layer panel
    panels.appendChild(this.buildLayerPanel());

    // Center: Tileset picker (shown for paint/erase/collision)
    this.tilesetPickerEl = this.buildTilesetPicker();
    panels.appendChild(this.tilesetPickerEl);

    // Center: Object picker (shown for object/object-erase)
    this.objectPickerEl = this.buildObjectPicker();
    this.objectPickerEl.style.display = "none";
    panels.appendChild(this.objectPickerEl);

    // Center: NPC picker (shown for npc/npc-erase)
    this.npcPickerEl = this.buildNpcPicker();
    this.npcPickerEl.style.display = "none";
    panels.appendChild(this.npcPickerEl);

    // Center: Item picker (shown for item/item-erase)
    this.itemPickerEl = this.buildItemPicker();
    this.itemPickerEl.style.display = "none";
    panels.appendChild(this.itemPickerEl);

    // Center: Portal picker (shown for portal tool)
    this.portalPickerEl = this.buildPortalPicker();
    this.portalPickerEl.style.display = "none";
    panels.appendChild(this.portalPickerEl);

    // Center: Label picker (shown for label tool)
    this.labelPickerEl = this.buildLabelPicker();
    this.labelPickerEl.style.display = "none";
    panels.appendChild(this.labelPickerEl);

    this.el.appendChild(panels);
  }

  // =========================================================================
  // BUILD: Layer panel
  // =========================================================================

  private buildLayerPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "layer-panel";

    const label = document.createElement("div");
    label.className = "layer-panel-label";
    label.textContent = "Layers";
    panel.appendChild(label);

    const layerNames = ["bg0", "bg1", "obj0", "obj1", "overlay0"];
    layerNames.forEach((name, i) => {
      const btn = document.createElement("button");
      btn.className = `layer-btn ${this.activeLayer === i ? "active" : ""}`;
      btn.textContent = name;
      btn.addEventListener("click", () => this.setLayer(i));
      panel.appendChild(btn);
      this.layerButtons.push(btn);
    });

    return panel;
  }

  // =========================================================================
  // BUILD: Tileset picker
  // =========================================================================

  private buildTilesetPicker(): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "tileset-picker";

    const header = document.createElement("div");
    header.className = "tileset-picker-header";

    const label = document.createElement("div");
    label.className = "tileset-picker-label";
    label.textContent = "Tileset";
    header.appendChild(label);

    // Tile size indicator
    this.tileSizeLabel = document.createElement("div");
    this.tileSizeLabel.style.cssText = "font-size:10px;color:var(--text-muted);margin-left:auto;font-family:monospace;";
    this.updateTileSizeLabel();
    header.appendChild(this.tileSizeLabel);

    this.tilesetSelect = document.createElement("select");
    this.tilesetSelect.className = "tileset-select";
    for (const ts of TILESETS) {
      const opt = document.createElement("option");
      opt.value = ts.url;
      opt.textContent = `${ts.name} (${ts.tileWidth}px)`;
      this.tilesetSelect.appendChild(opt);
    }
    this.tilesetSelect.addEventListener("change", () => {
      const ts = TILESETS.find((t) => t.url === this.tilesetSelect.value);
      if (ts) {
        this.activeTileset = ts;
        this.selectedTile = 0;
        this.selectedRegion = { col: 0, row: 0, w: 1, h: 1 };
        // Load image first (auto-detects real dimensions), then sync map tile size
        this.loadTilesetImage(() => this.syncMapTileSizeToTileset(ts));
      }
    });
    header.appendChild(this.tilesetSelect);
    picker.appendChild(header);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "tileset-canvas-wrap";

    this.tileCanvas = document.createElement("canvas");
    this.tileCanvas.className = "tileset-canvas";
    this.tileCtx = this.tileCanvas.getContext("2d")!;
    this.tileCtx.imageSmoothingEnabled = false;

    this.highlightEl = document.createElement("div");
    this.highlightEl.className = "tileset-highlight";

    // Drag-select on tileset canvas: mousedown starts, mousemove updates, mouseup finalises
    this.tileCanvas.addEventListener("mousedown", (e) => this.onTileCanvasDown(e));
    this.tileCanvas.addEventListener("mousemove", (e) => this.onTileCanvasMove(e));
    window.addEventListener("mouseup", () => this.onTileCanvasUp());

    canvasWrap.appendChild(this.tileCanvas);
    canvasWrap.appendChild(this.highlightEl);
    picker.appendChild(canvasWrap);

    this.loadTilesetImage();

    return picker;
  }

  // =========================================================================
  // BUILD: Object picker (sprite definitions)
  // =========================================================================

  private buildObjectPicker(): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "tileset-picker"; // reuse layout

    const header = document.createElement("div");
    header.className = "tileset-picker-header";

    const label = document.createElement("div");
    label.className = "tileset-picker-label";
    label.textContent = "Sprites";
    header.appendChild(label);

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "editor-tool-btn";
    refreshBtn.textContent = "↻ Refresh";
    refreshBtn.style.fontSize = "11px";
    refreshBtn.addEventListener("click", () => this.loadSpriteDefs());
    header.appendChild(refreshBtn);

    picker.appendChild(header);

    this.objectListEl = document.createElement("div");
    this.objectListEl.className = "object-list";
    picker.appendChild(this.objectListEl);

    return picker;
  }

  private async loadSpriteDefs() {
    try {
      const convex = getConvexClient();
      const defs = await convex.query(api.spriteDefinitions.list, {});
      this.spriteDefs = defs as unknown as SpriteDef[];
      this.renderObjectList();
      this.renderNpcList();
    } catch (err) {
      console.warn("Failed to load sprite defs:", err);
    }
  }

  private renderObjectList() {
    this.objectListEl.innerHTML = "";

    // Filter out NPCs — they have their own tab now
    const nonNpcDefs = this.spriteDefs.filter((d) => d.category !== "npc");

    if (nonNpcDefs.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:var(--text-muted);font-size:12px;padding:12px;font-style:italic;";
      empty.textContent = "No object sprites yet. Create some in the Sprite Editor!";
      this.objectListEl.appendChild(empty);
      return;
    }

    for (const def of nonNpcDefs) {
      const row = document.createElement("button");
      row.className = `object-list-item ${this.selectedSpriteDef?._id === def._id ? "active" : ""}`;
      row.innerHTML = `<span class="object-list-name">${def.name}</span><span class="object-list-cat">${def.category}</span>`;
      row.addEventListener("click", () => {
        this.selectedSpriteDef = def;
        this.tileInfoEl.textContent = `Obj: ${def.name}`;
        this.renderObjectList();
        this.updateGhostForCurrentSelection();
      });
      this.objectListEl.appendChild(row);
    }
  }

  // =========================================================================
  // BUILD: NPC picker (NPC sprite definitions for placement)
  // =========================================================================

  private buildNpcPicker(): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "tileset-picker"; // reuse layout

    const header = document.createElement("div");
    header.className = "tileset-picker-header";

    const label = document.createElement("div");
    label.className = "tileset-picker-label";
    label.textContent = "NPCs";
    header.appendChild(label);

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "editor-tool-btn";
    refreshBtn.textContent = "↻ Refresh";
    refreshBtn.style.fontSize = "11px";
    refreshBtn.addEventListener("click", () => this.loadSpriteDefs());
    header.appendChild(refreshBtn);

    picker.appendChild(header);

    this.npcListEl = document.createElement("div");
    this.npcListEl.className = "object-list";
    picker.appendChild(this.npcListEl);

    return picker;
  }

  private renderNpcList() {
    if (!this.npcListEl) return;
    this.npcListEl.innerHTML = "";

    const npcDefs = this.spriteDefs.filter((d) => d.category === "npc");

    if (npcDefs.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:var(--text-muted);font-size:12px;padding:12px;font-style:italic;";
      empty.textContent = "No NPC sprites yet. Create some in the Sprite Editor with category 'NPC'!";
      this.npcListEl.appendChild(empty);
      return;
    }

    for (const def of npcDefs) {
      const row = document.createElement("button");
      row.className = `object-list-item ${this.selectedSpriteDef?._id === def._id ? "active" : ""}`;
      row.innerHTML = `<span class="object-list-name">${def.name}</span><span class="object-list-cat">npc</span>`;
      row.addEventListener("click", () => {
        this.selectedSpriteDef = def;
        this.tileInfoEl.textContent = `NPC: ${def.name}`;
        this.renderNpcList();
        this.updateGhostForCurrentSelection();
      });
      this.npcListEl.appendChild(row);
    }
  }

  // =========================================================================
  // BUILD: Item picker (item definitions for world placement)
  // =========================================================================

  private buildItemPicker(): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "tileset-picker"; // reuse layout

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
    refreshBtn.addEventListener("click", () => this.loadItemDefs());
    header.appendChild(refreshBtn);

    picker.appendChild(header);

    this.itemListEl = document.createElement("div");
    this.itemListEl.className = "object-list";
    picker.appendChild(this.itemListEl);

    return picker;
  }

  private async loadItemDefs() {
    try {
      const convex = getConvexClient();
      const defs = await convex.query(api.items.list, {});
      this.itemDefs = defs as any[];
      this.renderItemList();
    } catch (err) {
      console.warn("Failed to load item defs:", err);
    }
  }

  private renderItemList() {
    this.itemListEl.innerHTML = "";

    if (this.itemDefs.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:var(--text-muted);font-size:12px;padding:12px;font-style:italic;";
      empty.textContent = "No items yet. Create some in the Item Editor!";
      this.itemListEl.appendChild(empty);
      return;
    }

    for (const def of this.itemDefs) {
      const row = document.createElement("button");
      row.className = `object-list-item ${this.selectedItemDef?.name === def.name ? "active" : ""}`;

      // Icon preview
      const iconSpan = document.createElement("span");
      iconSpan.style.cssText = "margin-right:6px;font-size:14px;";
      if (def.iconTilesetUrl && def.iconTileW) {
        const c = document.createElement("canvas");
        c.width = 20; c.height = 20;
        c.style.cssText = "width:20px;height:20px;image-rendering:pixelated;vertical-align:middle;margin-right:4px;";
        const img = new Image();
        img.src = def.iconTilesetUrl;
        img.onload = () => {
          const cx = c.getContext("2d")!;
          cx.imageSmoothingEnabled = false;
          const sw = def.iconTileW!; const sh = def.iconTileH!;
          const scale = Math.min(20 / sw, 20 / sh);
          const dw = sw * scale; const dh = sh * scale;
          cx.drawImage(img, def.iconTileX!, def.iconTileY!, sw, sh,
            (20 - dw) / 2, (20 - dh) / 2, dw, dh);
        };
        iconSpan.appendChild(c);
      } else {
        iconSpan.textContent = this.itemTypeIcon(def.type);
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "object-list-name";
      nameSpan.textContent = def.displayName;

      const catSpan = document.createElement("span");
      catSpan.className = "object-list-cat";
      catSpan.textContent = def.rarity;

      row.appendChild(iconSpan);
      row.appendChild(nameSpan);
      row.appendChild(catSpan);

      row.addEventListener("click", () => {
        this.selectedItemDef = def;
        this.tileInfoEl.textContent = `Item: ${def.displayName}`;
        this.renderItemList();
      });
      this.itemListEl.appendChild(row);
    }
  }

  private itemTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      weapon: "⚔️", armor: "🛡", accessory: "💍",
      consumable: "🧪", material: "🪵", key: "🔑",
      currency: "🪙", quest: "📜", misc: "📦",
    };
    return icons[type] || "📦";
  }

  private placeItem(worldX: number, worldY: number) {
    if (!this.selectedItemDef) {
      this.showSaveStatus("Select an item first", true);
      return;
    }
    const item = {
      id: crypto.randomUUID(),
      itemDefName: this.selectedItemDef.name,
      x: Math.round(worldX),
      y: Math.round(worldY),
      quantity: 1,
    };
    this.placedItems.push(item);
    this.tileInfoEl.textContent = `Placed: ${this.selectedItemDef.displayName} (${this.placedItems.length} items total)`;

    // Render on the world item layer immediately
    if (this.game && (this.game as any).worldItemLayer) {
      (this.game as any).worldItemLayer.addItem({
        id: item.id,
        itemDefName: item.itemDefName,
        x: item.x,
        y: item.y,
        quantity: item.quantity,
      }, this.selectedItemDef);
    }
  }

  private removeItemAt(worldX: number, worldY: number) {
    // Items bob above their anchor — use a generous radius
    const radius = 64;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.placedItems.length; i++) {
      const item = this.placedItems[i];
      const dx = item.x - worldX;
      const dy = item.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const removed = this.placedItems.splice(bestIdx, 1)[0];
      if (this.game && (this.game as any).worldItemLayer) {
        (this.game as any).worldItemLayer.removeItem(removed.id);
      }
      this.tileInfoEl.textContent = `Removed item (${this.placedItems.length} remaining)`;
    }
  }

  // =========================================================================
  // Tileset image loading & rendering
  // =========================================================================

  private loadTilesetImage(onReady?: () => void) {
    const ts = this.activeTileset;
    const img = new Image();
    img.src = ts.url;
    img.onload = () => {
      this.tilesetImage = img;
      // Auto-detect actual image dimensions — round down to full tile multiples
      const realW = Math.floor(img.naturalWidth / ts.tileWidth) * ts.tileWidth;
      const realH = Math.floor(img.naturalHeight / ts.tileHeight) * ts.tileHeight;
      if (realW !== ts.imageWidth || realH !== ts.imageHeight) {
        console.log(
          `Tileset "${ts.name}": correcting dimensions ${ts.imageWidth}×${ts.imageHeight}` +
          ` → ${realW}×${realH} (from ${img.naturalWidth}×${img.naturalHeight})`,
        );
        ts.imageWidth = realW;
        ts.imageHeight = realH;
      }
      this.renderTilesetGrid();
      this.updateHighlight();
      onReady?.();
    };
    img.onerror = () => {
      console.warn("Failed to load tileset:", ts.url);
    };
  }

  private renderTilesetGrid() {
    if (!this.tilesetImage) return;
    const ts = this.activeTileset;
    const cols = Math.floor(ts.imageWidth / ts.tileWidth);
    const rows = Math.floor(ts.imageHeight / ts.tileHeight);

    const canvasW = cols * DISPLAY_TILE_SIZE;
    const canvasH = rows * DISPLAY_TILE_SIZE;

    this.tileCanvas.width = canvasW;
    this.tileCanvas.height = canvasH;
    this.tileCanvas.style.width = canvasW + "px";
    this.tileCanvas.style.height = canvasH + "px";

    const ctx = this.tileCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvasW, canvasH);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        ctx.drawImage(
          this.tilesetImage,
          col * ts.tileWidth,
          row * ts.tileHeight,
          ts.tileWidth,
          ts.tileHeight,
          col * DISPLAY_TILE_SIZE,
          row * DISPLAY_TILE_SIZE,
          DISPLAY_TILE_SIZE,
          DISPLAY_TILE_SIZE,
        );
      }
    }

    // Draw grid lines on tileset when grid toggle is active
    const showGrid = this.game?.mapRenderer.isGridVisible() ?? false;
    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        ctx.moveTo(c * DISPLAY_TILE_SIZE + 0.5, 0);
        ctx.lineTo(c * DISPLAY_TILE_SIZE + 0.5, canvasH);
      }
      for (let r = 0; r <= rows; r++) {
        ctx.moveTo(0, r * DISPLAY_TILE_SIZE + 0.5);
        ctx.lineTo(canvasW, r * DISPLAY_TILE_SIZE + 0.5);
      }
      ctx.stroke();
    }
  }

  /** Convert a mouse event on the tileset canvas to a tileset grid col/row */
  private tileCanvasToGrid(e: MouseEvent): { col: number; row: number } {
    const ts = this.activeTileset;
    const cols = Math.floor(ts.imageWidth / ts.tileWidth);
    const rows = Math.floor(ts.imageHeight / ts.tileHeight);
    const rect = this.tileCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
      col: Math.max(0, Math.min(cols - 1, Math.floor(x / DISPLAY_TILE_SIZE))),
      row: Math.max(0, Math.min(rows - 1, Math.floor(y / DISPLAY_TILE_SIZE))),
    };
  }

  private onTileCanvasDown(e: MouseEvent) {
    const { col, row } = this.tileCanvasToGrid(e);
    this.tsDragStart = { col, row };
    this.applyTileSelection(col, row, col, row);
  }

  private onTileCanvasMove(e: MouseEvent) {
    if (!this.tsDragStart) return;
    const { col, row } = this.tileCanvasToGrid(e);
    this.applyTileSelection(this.tsDragStart.col, this.tsDragStart.row, col, row);
  }

  private onTileCanvasUp() {
    this.tsDragStart = null;
  }

  /** Set the selected region from two corner positions and update the highlight */
  private applyTileSelection(c1: number, r1: number, c2: number, r2: number) {
    const ts = this.activeTileset;
    const cols = Math.floor(ts.imageWidth / ts.tileWidth);

    const minC = Math.min(c1, c2);
    const minR = Math.min(r1, r2);
    const maxC = Math.max(c1, c2);
    const maxR = Math.max(r1, r2);

    this.selectedRegion = { col: minC, row: minR, w: maxC - minC + 1, h: maxR - minR + 1 };
    // selectedTile = top-left tile of the region (backward compat)
    this.selectedTile = minR * cols + minC;

    const regionSize = this.selectedRegion.w * this.selectedRegion.h;
    this.tileInfoEl.textContent =
      regionSize > 1
        ? `Tile: ${this.selectedTile} (${this.selectedRegion.w}×${this.selectedRegion.h})`
        : `Tile: ${this.selectedTile}`;

    this.updateHighlight();
  }

  private updateHighlight() {
    const r = this.selectedRegion;
    this.highlightEl.style.left = r.col * DISPLAY_TILE_SIZE + "px";
    this.highlightEl.style.top = r.row * DISPLAY_TILE_SIZE + "px";
    this.highlightEl.style.width = r.w * DISPLAY_TILE_SIZE + "px";
    this.highlightEl.style.height = r.h * DISPLAY_TILE_SIZE + "px";
  }

  /** Sync map tile size to the tileset's native tile size, re-render if changed */
  private syncMapTileSizeToTileset(ts: TilesetInfo) {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData) return;

    if (mapData.tileWidth !== ts.tileWidth || mapData.tileHeight !== ts.tileHeight) {
      console.log(
        `Tileset tile size ${ts.tileWidth}×${ts.tileHeight} differs from map ${mapData.tileWidth}×${mapData.tileHeight} — updating map`,
      );
      mapData.tileWidth = ts.tileWidth;
      mapData.tileHeight = ts.tileHeight;
      mapData.tilesetPxW = ts.imageWidth;
      mapData.tilesetPxH = ts.imageHeight;
      mapData.tilesetUrl = ts.url;
      // Reload to re-render at the correct tile size
      this.game!.mapRenderer.loadMap(mapData);
    } else {
      // Same tile size — just update the URL and image dimensions
      mapData.tilesetUrl = ts.url;
      mapData.tilesetPxW = ts.imageWidth;
      mapData.tilesetPxH = ts.imageHeight;
      this.game!.mapRenderer.loadMap(mapData);
    }
    this.updateTileSizeLabel();
    this.updateMapDimsLabel();
  }

  private updateTileSizeLabel() {
    if (!this.tileSizeLabel) return;
    const ts = this.activeTileset;
    this.tileSizeLabel.textContent = `${ts.tileWidth}×${ts.tileHeight}px`;
  }

  private updateMapDimsLabel() {
    if (!this.mapDimsEl) return;
    const m = this.game?.mapRenderer.getMapData();
    if (m) {
      this.mapDimsEl.textContent = `${m.width}×${m.height} (${m.tileWidth}px)`;
    } else {
      this.mapDimsEl.textContent = "";
    }
  }

  // =========================================================================
  // Tool & layer selection
  // =========================================================================

  private setTool(t: EditorTool) {
    this.tool = t;

    // Highlight the matching TOOLS button (deactivate all first)
    const isDeleteTool = DELETE_OPTIONS.some(d => d.key === t);
    TOOLS.forEach((tool, i) => {
      this.toolButtons[i].classList.toggle("active", tool.key === t);
    });
    // Update delete button state
    if (isDeleteTool) {
      this.deleteBtn.classList.add("active");
      const opt = DELETE_OPTIONS.find(d => d.key === t);
      this.deleteBtn.textContent = `🗑 Del: ${opt?.label ?? ""}`;
    } else {
      this.deleteBtn.classList.remove("active");
      this.deleteBtn.textContent = "🗑 Delete ▾";
    }

    // Swap visible picker
    const isObjTool = t === "object" || t === "object-erase";
    const isNpcTool = t === "npc" || t === "npc-erase";
    const isItemTool = t === "item" || t === "item-erase";
    const isPortal = t === "portal";
    const isLabel = t === "label";
    const hideDefault = isObjTool || isNpcTool || isItemTool || isPortal || isLabel;
    this.tilesetPickerEl.style.display = hideDefault ? "none" : "";
    this.objectPickerEl.style.display = isObjTool ? "" : "none";
    this.npcPickerEl.style.display = isNpcTool ? "" : "none";
    this.itemPickerEl.style.display = isItemTool ? "" : "none";
    this.portalPickerEl.style.display = isPortal ? "" : "none";
    this.labelPickerEl.style.display = isLabel ? "" : "none";

    if ((isObjTool || isNpcTool) && this.spriteDefs.length === 0) {
      this.loadSpriteDefs();
    } else if (isObjTool) {
      this.renderObjectList(); // re-render to filter out NPCs
    } else if (isNpcTool) {
      this.renderNpcList();
    }

    if (isItemTool && this.itemDefs.length === 0) {
      this.loadItemDefs();
    }

    if (isPortal) {
      this.refreshPortalList();
      this.loadAvailableMaps();
    }

    if (isLabel) {
      this.refreshLabelList();
    }

    // Show/hide collision overlay (show for both collision and collision-erase)
    this.game?.mapRenderer.setCollisionOverlayVisible(t === "collision" || t === "collision-erase");

    // Highlight active layer when painting/erasing tiles, reset otherwise
    const isTileTool = t === "paint" || t === "erase";
    this.game?.mapRenderer.highlightLayer(isTileTool ? this.activeLayer : -1);

    // Reset portal placement and hide ghost
    this.portalPlacing = false;
    this.portalStart = null;
    this.game?.mapRenderer.hidePortalGhost();

    // Reset label placement and hide ghost
    this.labelStart = null;
    this.game?.mapRenderer.hideLabelGhost();

    // Hide tile ghost when switching tools
    this.game?.mapRenderer.hideTileGhost();

    // Show/hide ghost preview
    this.updateGhostForCurrentSelection();
  }

  private setLayer(index: number) {
    this.activeLayer = index;
    this.layerButtons.forEach((btn, i) => {
      btn.classList.toggle("active", i === index);
    });

    // Update layer highlight if a tile tool is active
    const isTileTool = this.tool === "paint" || this.tool === "erase";
    if (isTileTool) {
      this.game?.mapRenderer.highlightLayer(index);
    }
  }

  /** Show or hide the ghost preview sprite based on current tool + selection */
  private updateGhostForCurrentSelection() {
    if (!this.game?.objectLayer) return;

    if ((this.tool === "object" || this.tool === "npc") && this.selectedSpriteDef) {
      this.game.objectLayer.showGhost({
        name: this.selectedSpriteDef.name,
        spriteSheetUrl: this.selectedSpriteDef.spriteSheetUrl,
        defaultAnimation: this.selectedSpriteDef.defaultAnimation,
        scale: this.selectedSpriteDef.scale,
        frameWidth: this.selectedSpriteDef.frameWidth,
        frameHeight: this.selectedSpriteDef.frameHeight,
      });
    } else {
      this.game.objectLayer.hideGhost();
    }
  }

  // =========================================================================
  // Wire to Game engine
  // =========================================================================

  setGame(game: Game) {
    this.game = game;
    this.bindCanvasEvents(game);
    // Auto-select the tileset matching the current map
    this.syncTilesetToMap();
    this.updateMapDimsLabel();
  }

  /** Match the editor's tileset dropdown to the map's current tilesetUrl */
  private syncTilesetToMap() {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData) return;
    const match = TILESETS.find((t) => t.url === mapData.tilesetUrl);
    if (match) {
      this.activeTileset = match;
      this.tilesetSelect.value = match.url;
      this.selectedTile = 0;
      this.selectedRegion = { col: 0, row: 0, w: 1, h: 1 };
      this.loadTilesetImage();
      this.updateTileSizeLabel();
    }
  }

  private bindCanvasEvents(game: Game) {
    const canvas = game.app.canvas as HTMLCanvasElement;

    this.canvasClickHandler = (e: MouseEvent) => {
      if (game.mode !== "build") return;
      this.isPainting = true;
      this.handleCanvasAction(e, game, canvas);
    };

    this.canvasMoveHandler = (e: MouseEvent) => {
      if (!this.isPainting || game.mode !== "build") return;
      // Only allow drag-paint for tile tools, not object/npc/item/portal/label
      const noDrag: EditorTool[] = ["object", "object-erase", "npc", "npc-erase",
        "item", "item-erase", "portal", "label"];
      if (!noDrag.includes(this.tool)) {
        this.handleCanvasAction(e, game, canvas);
      }
    };

    this.canvasUpHandler = () => {
      this.isPainting = false;
    };

    // Ghost preview: always track cursor in build mode
    this.canvasHoverHandler = (e: MouseEvent) => {
      if (game.mode !== "build") return;

      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const { x: worldX, y: worldY } = game.camera.screenToWorld(screenX, screenY);

      if (this.tool === "paint" || this.tool === "erase" || this.tool === "collision" || this.tool === "collision-erase") {
        const mapData = game.mapRenderer.getMapData();
        if (mapData) {
          const tx = Math.floor(worldX / mapData.tileWidth);
          const ty = Math.floor(worldY / mapData.tileHeight);
          if (tx >= 0 && ty >= 0 && tx < mapData.width && ty < mapData.height) {
            if (this.tool === "paint") {
              const ts = this.activeTileset;
              const tsCols = Math.floor(ts.imageWidth / ts.tileWidth);
              game.mapRenderer.showTileGhost(tx, ty, this.selectedRegion, tsCols);
            } else {
              game.mapRenderer.showTileGhost(tx, ty, null, 0);
            }
          } else {
            game.mapRenderer.hideTileGhost();
          }
        }
      } else if (this.tool === "object" || this.tool === "npc") {
        game.mapRenderer.hideTileGhost();
        game.objectLayer?.updateGhost(worldX, worldY);
      } else if (this.tool === "item" || this.tool === "item-erase") {
        game.mapRenderer.hideTileGhost();
        game.objectLayer?.hideGhost();
      } else if (this.tool === "portal") {
        game.mapRenderer.hideTileGhost();
        const mapData = game.mapRenderer.getMapData();
        if (mapData) {
          const tx = Math.floor(worldX / mapData.tileWidth);
          const ty = Math.floor(worldY / mapData.tileHeight);
          if (this.portalStart) {
            game.mapRenderer.showPortalGhost(this.portalStart, { tx, ty });
          } else {
            game.mapRenderer.showPortalCursor(tx, ty);
          }
        }
      } else if (this.tool === "label") {
        game.mapRenderer.hideTileGhost();
        const mapData = game.mapRenderer.getMapData();
        if (mapData) {
          const tx = Math.floor(worldX / mapData.tileWidth);
          const ty = Math.floor(worldY / mapData.tileHeight);
          if (this.labelStart) {
            game.mapRenderer.showLabelGhost(this.labelStart, { tx, ty }, this.labelDraftName);
          } else {
            game.mapRenderer.showLabelCursor(tx, ty);
          }
        }
      }
    };

    canvas.addEventListener("mousedown", this.canvasClickHandler);
    canvas.addEventListener("mousemove", this.canvasMoveHandler);
    canvas.addEventListener("mousemove", this.canvasHoverHandler);
    window.addEventListener("mouseup", this.canvasUpHandler);

    // Keyboard shortcut: 'g' toggles grid in build mode
    this.keyHandler = (e: KeyboardEvent) => {
      if (game.mode !== "build") return;
      // Ignore if focus is in an input/select/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "g" || e.key === "G") {
        const on = game.mapRenderer.toggleGrid();
        this.gridBtn.classList.toggle("active", on);
        this.renderTilesetGrid();
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  private handleCanvasAction(e: MouseEvent, game: Game, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x: worldX, y: worldY } = game.camera.screenToWorld(screenX, screenY);

    if (this.tool === "portal") {
      const mapData = game.mapRenderer.getMapData();
      if (mapData) {
        const tileX = Math.floor(worldX / mapData.tileWidth);
        const tileY = Math.floor(worldY / mapData.tileHeight);
        this.handlePortalClick(tileX, tileY);
      }
    } else if (this.tool === "label") {
      const mapData = game.mapRenderer.getMapData();
      if (mapData) {
        const tileX = Math.floor(worldX / mapData.tileWidth);
        const tileY = Math.floor(worldY / mapData.tileHeight);
        this.handleLabelClick(tileX, tileY);
      }
    } else if (this.tool === "object" || this.tool === "npc") {
      this.placeObject(worldX, worldY);
    } else if (this.tool === "object-erase" || this.tool === "npc-erase") {
      this.removeObjectAt(worldX, worldY);
    } else if (this.tool === "item") {
      this.placeItem(worldX, worldY);
    } else if (this.tool === "item-erase") {
      this.removeItemAt(worldX, worldY);
    } else {
      this.paintTileAt(worldX, worldY, game);
    }
  }

  private paintTileAt(worldX: number, worldY: number, game: Game) {
    const mapData = game.mapRenderer.getMapData();
    if (!mapData) return;

    const tileX = Math.floor(worldX / mapData.tileWidth);
    const tileY = Math.floor(worldY / mapData.tileHeight);

    if (tileX < 0 || tileY < 0 || tileX >= mapData.width || tileY >= mapData.height) return;

    if (this.tool === "paint") {
      // Stamp the full selected region
      const ts = this.activeTileset;
      const tsCols = Math.floor(ts.imageWidth / ts.tileWidth);
      const r = this.selectedRegion;
      for (let dy = 0; dy < r.h; dy++) {
        for (let dx = 0; dx < r.w; dx++) {
          const mx = tileX + dx;
          const my = tileY + dy;
          if (mx >= 0 && my >= 0 && mx < mapData.width && my < mapData.height) {
            const tileIdx = (r.row + dy) * tsCols + (r.col + dx);
            game.mapRenderer.setTile(this.activeLayer, mx, my, tileIdx);
          }
        }
      }
    } else if (this.tool === "erase") {
      game.mapRenderer.setTile(this.activeLayer, tileX, tileY, -1);
    } else if (this.tool === "collision") {
      const idx = tileY * mapData.width + tileX;
      mapData.collisionMask[idx] = true;
      game.mapRenderer.renderCollisionOverlay();
    } else if (this.tool === "collision-erase") {
      const idx = tileY * mapData.width + tileX;
      mapData.collisionMask[idx] = false;
      game.mapRenderer.renderCollisionOverlay();
    }
  }

  // =========================================================================
  // Object placement
  // =========================================================================

  private placeObject(worldX: number, worldY: number) {
    if (!this.selectedSpriteDef) {
      this.showSaveStatus("Select a sprite first", true);
      return;
    }

    const obj: PlacedObject = {
      id: crypto.randomUUID(),
      spriteDefName: this.selectedSpriteDef.name,
      x: Math.round(worldX),
      y: Math.round(worldY),
      layer: this.activeLayer,
    };

    this.placedObjects.push(obj);
    this.tileInfoEl.textContent = `Placed: ${this.selectedSpriteDef.name} (${this.placedObjects.length} total)`;

    // All objects (including NPCs) render as static previews in the editor.
    // Real server-driven NPCs are created via the npcState subscription after saving.
    this.game?.objectLayer?.addPlacedObject(obj, this.selectedSpriteDef as any);
  }

  private removeObjectAt(worldX: number, worldY: number) {
    // Objects are anchored at bottom-center (0.5, 1.0), so the stored Y is
    // the sprite's feet.  When the user clicks on the sprite's body they'll
    // click above the anchor.  We use an asymmetric hit-test: generous upward
    // (spriteHeight), tighter horizontal (half-width) and a small margin below.
    const hitAbove = 96;   // how far above anchor counts as a hit
    const hitBelow = 16;   // small margin below anchor
    const hitSide  = 48;   // horizontal half-width

    const hitTest = (objX: number, objY: number): boolean => {
      const dx = Math.abs(objX - worldX);
      const dy = objY - worldY; // positive = click is above anchor
      return dx <= hitSide && dy >= -hitBelow && dy <= hitAbove;
    };

    // Manhattan-ish score for picking the best candidate
    const hitScore = (objX: number, objY: number): number => {
      return Math.abs(objX - worldX) + Math.abs(objY - worldY);
    };

    // First check server-driven NPCs (they may have wandered from spawn)
    if (this.game?.entityLayer) {
      const npcHit = this.game.entityLayer.findNearestNPCAt(worldX, worldY, hitAbove);
      if (npcHit) {
        let bestPlacedIdx = -1;
        let bestPlacedScore = Infinity;
        for (let i = 0; i < this.placedObjects.length; i++) {
          const obj = this.placedObjects[i];
          if (hitTest(obj.x, obj.y)) {
            const s = hitScore(obj.x, obj.y);
            if (s < bestPlacedScore) {
              bestPlacedScore = s;
              bestPlacedIdx = i;
            }
          }
        }
        if (bestPlacedIdx >= 0) {
          this.placedObjects.splice(bestPlacedIdx, 1);
        }
        this.game.entityLayer.removeNPC(npcHit.id);
        this.tileInfoEl.textContent = `Removed NPC (${this.placedObjects.length} total)`;
        return;
      }
    }

    // Then check static placed objects by stored position
    let bestIdx = -1;
    let bestScore = Infinity;

    for (let i = 0; i < this.placedObjects.length; i++) {
      const obj = this.placedObjects[i];
      if (hitTest(obj.x, obj.y)) {
        const s = hitScore(obj.x, obj.y);
        if (s < bestScore) {
          bestScore = s;
          bestIdx = i;
        }
      }
    }

    if (bestIdx >= 0) {
      const removed = this.placedObjects.splice(bestIdx, 1)[0];
      this.game?.objectLayer?.removePlacedObject(removed.id);
      this.tileInfoEl.textContent = `Removed object (${this.placedObjects.length} total)`;
    }
  }

  // =========================================================================
  // Save all (map + objects)
  // =========================================================================

  // ===========================================================================
  // Portal editor
  // ===========================================================================

  private buildPortalPicker(): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "tileset-picker"; // reuse layout

    const header = document.createElement("div");
    header.className = "tileset-picker-header";
    const label = document.createElement("div");
    label.className = "tileset-picker-label";
    label.textContent = "Portals & Map Settings";
    header.appendChild(label);
    picker.appendChild(header);

    // --- Map settings section ---
    const settings = document.createElement("div");
    settings.style.cssText = "padding:8px;display:flex;flex-direction:column;gap:6px;font-size:12px;border-bottom:1px solid #333;";

    // Music select
    const musicRow = document.createElement("div");
    musicRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const musicLabel = document.createElement("span");
    musicLabel.textContent = "Music:";
    musicLabel.style.minWidth = "80px";
    const musicSelect = document.createElement("select");
    musicSelect.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    const MUSIC_OPTIONS = [
      { label: "(None)", url: "" },
      { label: "Cozy Cottage", url: "/assets/audio/cozy.m4a" },
      { label: "PS1 Town", url: "/assets/audio/ps1-town.mp3" },
      { label: "PS1 Shop", url: "/assets/audio/ps1-shop.mp3" },
      { label: "PS1 Palma", url: "/assets/audio/ps1-palma.mp3" },
      { label: "Battle", url: "/assets/audio/battle.mp3" },
      { label: "Vinyl", url: "/assets/audio/vinyl.mp3" },
      { label: "Rain", url: "/assets/audio/rain.mp3" },
      { label: "Title", url: "/assets/audio/title.mp3" },
      { label: "Mage City", url: "/assets/audio/magecity.mp3" },
    ];
    for (const m of MUSIC_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = m.url;
      opt.textContent = m.label;
      musicSelect.appendChild(opt);
    }
    musicSelect.addEventListener("change", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) mapData.musicUrl = musicSelect.value || undefined;
    });
    musicRow.append(musicLabel, musicSelect);
    settings.appendChild(musicRow);

    // Combat toggle
    const combatRow = document.createElement("div");
    combatRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const combatLabel = document.createElement("span");
    combatLabel.textContent = "Combat:";
    combatLabel.style.minWidth = "80px";
    const combatCheck = document.createElement("input");
    combatCheck.type = "checkbox";
    combatCheck.addEventListener("change", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) mapData.combatEnabled = combatCheck.checked;
    });
    combatRow.append(combatLabel, combatCheck);
    settings.appendChild(combatRow);

    // Status select
    const statusRow = document.createElement("div");
    statusRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const statusLabel = document.createElement("span");
    statusLabel.textContent = "Status:";
    statusLabel.style.minWidth = "80px";
    const statusSelect = document.createElement("select");
    statusSelect.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    for (const s of ["published", "draft"]) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      statusSelect.appendChild(opt);
    }
    statusSelect.addEventListener("change", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) mapData.status = statusSelect.value;
    });
    statusRow.append(statusLabel, statusSelect);
    settings.appendChild(statusRow);

    // When portal tool becomes visible, sync settings from current map
    const syncSettings = () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) {
        musicSelect.value = mapData.musicUrl ?? "";
        combatCheck.checked = mapData.combatEnabled ?? false;
        statusSelect.value = mapData.status ?? "published";
      }
    };
    // Use MutationObserver to detect when portal picker becomes visible
    const observer = new MutationObserver(() => {
      if (this.portalPickerEl.style.display !== "none") {
        syncSettings();
      }
    });
    observer.observe(picker, { attributes: true, attributeFilter: ["style"] });
    // Also sync on first show
    setTimeout(syncSettings, 100);

    picker.appendChild(settings);

    // --- New portal form ---
    const form = document.createElement("div");
    form.style.cssText = "padding:8px;display:flex;flex-direction:column;gap:6px;font-size:12px;";

    // Name
    const nameRow = this.portalFormRow("Name:", "text", "door-1", (v) => { this.portalDraft.name = v; });

    // Target map (select)
    const mapRow = document.createElement("div");
    mapRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const mapLabel = document.createElement("span");
    mapLabel.textContent = "Target Map:";
    mapLabel.style.minWidth = "80px";
    const mapSelect = document.createElement("select");
    mapSelect.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    mapSelect.id = "portal-target-map-select";
    mapSelect.addEventListener("change", () => { this.portalDraft.targetMap = mapSelect.value; });
    mapRow.append(mapLabel, mapSelect);

    // Spawn label
    const spawnRow = this.portalFormRow("Spawn Label:", "text", "start1", (v) => { this.portalDraft.targetSpawn = v; });

    // Direction
    const dirRow = document.createElement("div");
    dirRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const dirLabel = document.createElement("span");
    dirLabel.textContent = "Direction:";
    dirLabel.style.minWidth = "80px";
    const dirSelect = document.createElement("select");
    dirSelect.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    for (const d of ["", "up", "down", "left", "right"]) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d || "(auto)";
      dirSelect.appendChild(opt);
    }
    dirSelect.addEventListener("change", () => { this.portalDraft.direction = dirSelect.value; });
    dirRow.append(dirLabel, dirSelect);

    // Help text — clicking the map directly now starts placement
    const helpText = document.createElement("div");
    helpText.style.cssText = "margin-top:6px;padding:6px 8px;background:#1a1a2e;border:1px solid #333;border-radius:4px;font-size:11px;color:#aaa;line-height:1.4;";
    helpText.innerHTML = "Fill in the fields above, then <b style='color:#00ff88'>click on the map</b> to set the start corner, and click again for the end corner. A green ghost will preview the area.";

    form.append(nameRow, mapRow, spawnRow, dirRow, helpText);
    picker.appendChild(form);

    // --- Existing portals list ---
    const listHeader = document.createElement("div");
    listHeader.style.cssText = "padding:8px;font-size:13px;font-weight:600;border-top:1px solid #333;";
    listHeader.textContent = "Existing Portals";
    picker.appendChild(listHeader);

    this.portalListEl = document.createElement("div");
    this.portalListEl.style.cssText = "padding:0 8px 8px;max-height:200px;overflow-y:auto;";
    picker.appendChild(this.portalListEl);

    return picker;
  }

  private portalFormRow(
    labelText: string,
    inputType: string,
    placeholder: string,
    onChange: (v: string) => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:4px;align-items:center;";
    const lbl = document.createElement("span");
    lbl.textContent = labelText;
    lbl.style.minWidth = "80px";
    const inp = document.createElement("input");
    inp.type = inputType;
    inp.placeholder = placeholder;
    inp.value = placeholder;
    onChange(placeholder); // set default
    inp.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    inp.addEventListener("input", () => onChange(inp.value));
    row.append(lbl, inp);
    return row;
  }

  private async loadAvailableMaps() {
    try {
      const convex = getConvexClient();
      const maps = await convex.query(api.maps.listSummaries, {});
      this.availableMaps = maps.map((m: any) => ({ name: m.name }));
      const select = this.portalPickerEl.querySelector("#portal-target-map-select") as HTMLSelectElement;
      if (select) {
        select.innerHTML = "";
        for (const m of this.availableMaps) {
          const opt = document.createElement("option");
          opt.value = m.name;
          opt.textContent = m.name;
          select.appendChild(opt);
        }
        if (this.availableMaps.length > 0) {
          this.portalDraft.targetMap = this.availableMaps[0].name;
        }
      }
    } catch (err) {
      console.warn("Failed to load available maps:", err);
    }
  }

  private refreshPortalList() {
    if (!this.portalListEl) return;
    const mapData = this.game?.mapRenderer.getMapData();
    const portals = mapData?.portals ?? [];

    if (portals.length === 0) {
      this.portalListEl.innerHTML = '<div style="color:#888;font-size:12px;">No portals yet</div>';
      return;
    }

    this.portalListEl.innerHTML = "";
    for (let i = 0; i < portals.length; i++) {
      const p = portals[i];
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #222;font-size:11px;";

      const info = document.createElement("span");
      info.style.flex = "1";
      info.textContent = `🚪 ${p.name} → ${p.targetMap}:${p.targetSpawn} (${p.x},${p.y} ${p.width}x${p.height})`;

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.style.cssText = "background:none;border:none;color:#e74c3c;cursor:pointer;font-size:13px;";
      delBtn.addEventListener("click", () => {
        if (mapData && mapData.portals) {
          mapData.portals.splice(i, 1);
          if (this.game) this.game.currentPortals = mapData.portals;
          this.refreshPortalList();
          this.game?.mapRenderer.renderPortalOverlay();
        }
      });

      row.append(info, delBtn);
      this.portalListEl.appendChild(row);
    }
  }

  /** Called from the canvas click handler when portal tool is active */
  private handlePortalClick(tileX: number, tileY: number) {
    // Validate required fields
    if (!this.portalDraft.name || !this.portalDraft.targetMap) {
      this.tileInfoEl.textContent = "⚠ Fill in Name and Target Map first";
      return;
    }

    if (!this.portalStart) {
      // First click = start corner
      this.portalStart = { tx: tileX, ty: tileY };
      this.portalPlacing = true;
      this.tileInfoEl.textContent = `Portal start: (${tileX},${tileY}) — click to set end corner`;
    } else {
      // Second click = end corner
      const x = Math.min(this.portalStart.tx, tileX);
      const y = Math.min(this.portalStart.ty, tileY);
      const w = Math.abs(tileX - this.portalStart.tx) + 1;
      const h = Math.abs(tileY - this.portalStart.ty) + 1;

      const portal = {
        name: this.portalDraft.name,
        x,
        y,
        width: w,
        height: h,
        targetMap: this.portalDraft.targetMap,
        targetSpawn: this.portalDraft.targetSpawn,
        direction: this.portalDraft.direction || undefined,
        transition: this.portalDraft.transition || "fade",
      };

      // Add to map data
      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) {
        if (!mapData.portals) mapData.portals = [];
        mapData.portals.push(portal);
        // Also update Game's runtime portals
        if (this.game) {
          this.game.currentPortals = mapData.portals;
        }
      }

      this.portalPlacing = false;
      this.portalStart = null;
      this.tileInfoEl.textContent = `Portal "${portal.name}" placed at (${x},${y}) ${w}x${h}`;
      this.refreshPortalList();
      // Update the visual overlay + hide ghost
      this.game?.mapRenderer.renderPortalOverlay();
      this.game?.mapRenderer.hidePortalGhost();
    }
  }

  // =========================================================================
  // Label tool
  // =========================================================================

  private buildLabelPicker(): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "tileset-picker";

    const header = document.createElement("div");
    header.className = "tileset-picker-header";
    const title = document.createElement("div");
    title.className = "tileset-picker-label";
    title.textContent = "Labels & Spawn Points";
    header.appendChild(title);
    picker.appendChild(header);

    // --- New label form ---
    const form = document.createElement("div");
    form.style.cssText = "padding:8px;display:flex;flex-direction:column;gap:6px;";

    // Name input
    const nameRow = document.createElement("div");
    nameRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const nameLbl = document.createElement("span");
    nameLbl.textContent = "Name:";
    nameLbl.style.minWidth = "50px";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "start1, shop-door, npc-guard...";
    nameInput.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    nameInput.addEventListener("input", () => { this.labelDraftName = nameInput.value.trim(); });
    nameRow.append(nameLbl, nameInput);

    // Help text
    const helpText = document.createElement("div");
    helpText.style.cssText = "padding:6px 8px;background:#1a1a2e;border:1px solid #333;border-radius:4px;font-size:11px;color:#aaa;line-height:1.4;";
    helpText.innerHTML = `Enter a name, then <b style="color:#ffcc00">click on the map</b> for a single-tile label, or click twice to define a rectangular zone. Labels are used as portal spawn targets (e.g. <code>start1</code>).`;

    form.append(nameRow, helpText);
    picker.appendChild(form);

    // --- Existing labels list ---
    const listHeader = document.createElement("div");
    listHeader.style.cssText = "padding:8px;font-size:13px;font-weight:600;border-top:1px solid #333;";
    listHeader.textContent = "Existing Labels";
    picker.appendChild(listHeader);

    this.labelListEl = document.createElement("div");
    this.labelListEl.style.cssText = "padding:0 8px 8px;max-height:300px;overflow-y:auto;";
    picker.appendChild(this.labelListEl);

    return picker;
  }

  private refreshLabelList() {
    if (!this.labelListEl) return;
    const mapData = this.game?.mapRenderer.getMapData();
    const labels = mapData?.labels ?? [];

    if (labels.length === 0) {
      this.labelListEl.innerHTML = '<div style="color:#888;font-size:12px;">No labels yet</div>';
      return;
    }

    this.labelListEl.innerHTML = "";
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #222;font-size:11px;";

      const info = document.createElement("span");
      info.style.flex = "1";
      const sizeStr = (l.width > 1 || l.height > 1) ? ` ${l.width}x${l.height}` : "";
      info.textContent = `🏷 ${l.name} (${l.x},${l.y}${sizeStr})`;

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.style.cssText = "background:none;border:none;color:#e74c3c;cursor:pointer;font-size:13px;";
      delBtn.addEventListener("click", () => {
        if (mapData && mapData.labels) {
          mapData.labels.splice(i, 1);
          this.refreshLabelList();
          this.game?.mapRenderer.renderLabelOverlay();
        }
      });

      row.append(info, delBtn);
      this.labelListEl.appendChild(row);
    }
  }

  /** Called from the canvas click handler when label tool is active */
  private handleLabelClick(tileX: number, tileY: number) {
    if (!this.labelDraftName) {
      this.tileInfoEl.textContent = "⚠ Enter a label name first";
      return;
    }

    if (!this.labelStart) {
      // First click = start corner (could be single-tile or start of zone)
      this.labelStart = { tx: tileX, ty: tileY };
      this.tileInfoEl.textContent = `Label start: (${tileX},${tileY}) — click again for end corner, or same tile for 1x1`;
    } else {
      // Second click = end corner (or same tile for a 1x1 label)
      const x = Math.min(this.labelStart.tx, tileX);
      const y = Math.min(this.labelStart.ty, tileY);
      const w = Math.abs(tileX - this.labelStart.tx) + 1;
      const h = Math.abs(tileY - this.labelStart.ty) + 1;

      const newLabel = { name: this.labelDraftName, x, y, width: w, height: h };

      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) {
        if (!mapData.labels) mapData.labels = [];
        // Replace if a label with this name already exists
        const existingIdx = mapData.labels.findIndex((l) => l.name === this.labelDraftName);
        if (existingIdx >= 0) {
          mapData.labels[existingIdx] = newLabel;
        } else {
          mapData.labels.push(newLabel);
        }
      }

      this.labelStart = null;
      this.tileInfoEl.textContent = `Label "${newLabel.name}" placed at (${x},${y}) ${w}x${h}`;
      this.refreshLabelList();
      this.game?.mapRenderer.renderLabelOverlay();
      this.game?.mapRenderer.hideLabelGhost();
    }
  }

  private async saveAll() {
    if (!this.game) return;
    const mapData = this.game.mapRenderer.getMapData();
    if (!mapData) {
      this.showSaveStatus("No map loaded", true);
      return;
    }

    this.showSaveStatus("Saving…");

    try {
      const convex = getConvexClient();
      const mapName = mapData.name || "cozy-cabin";

      // 1) Save map tiles
      const layers = mapData.layers.map((l) => ({
        name: l.name,
        type: l.type as "bg" | "obj" | "overlay",
        tiles: JSON.stringify(l.tiles),
        visible: l.visible,
      }));

      const collisionMask = JSON.stringify(mapData.collisionMask);
      const labels = mapData.labels.map((l) => ({
        name: l.name,
        x: l.x,
        y: l.y,
        width: l.width ?? 1,
        height: l.height ?? 1,
      }));

      const profileId = this.game?.profile._id as any;

      // Build portals array — strip undefined fields (Convex rejects explicit undefined)
      const portals = (mapData.portals ?? []).map((p) => {
        const obj: Record<string, unknown> = {
          name: p.name,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          targetMap: p.targetMap,
          targetSpawn: p.targetSpawn,
        };
        if (p.direction) obj.direction = p.direction;
        if (p.transition) obj.transition = p.transition;
        return obj;
      });

      // Build args, omitting undefined optional fields (Convex rejects explicit undefined)
      const saveArgs: Record<string, unknown> = {
        profileId,
        name: mapName,
        width: mapData.width,
        height: mapData.height,
        tileWidth: mapData.tileWidth,
        tileHeight: mapData.tileHeight,
        tilesetUrl: mapData.tilesetUrl,
        tilesetPxW: mapData.tilesetPxW,
        tilesetPxH: mapData.tilesetPxH,
        layers,
        collisionMask,
        labels,
        portals,
      };
      if (mapData.animationUrl != null) saveArgs.animationUrl = mapData.animationUrl;
      if (mapData.musicUrl != null) saveArgs.musicUrl = mapData.musicUrl;
      if (mapData.combatEnabled != null) saveArgs.combatEnabled = mapData.combatEnabled;
      if (mapData.status != null) saveArgs.status = mapData.status;

      await convex.mutation(api.maps.saveFullMap, saveArgs as any);

      // 2) Save placed objects
      await convex.mutation(api.mapObjects.bulkSave, {
        profileId,
        mapName,
        objects: this.placedObjects.map((o) => {
          const obj: Record<string, unknown> = {
            spriteDefName: o.spriteDefName,
            x: o.x,
            y: o.y,
            layer: o.layer,
          };
          if (o.instanceName) obj.instanceName = o.instanceName;
          if (o.isOn !== undefined) obj.isOn = o.isOn;
          return obj;
        }),
      } as any);

      // 3) Save placed world items
      await convex.mutation(api.worldItems.bulkSave, {
        profileId,
        mapName,
        items: this.placedItems.map((i) => ({
          itemDefName: i.itemDefName,
          x: i.x,
          y: i.y,
          quantity: i.quantity ?? 1,
          respawn: i.respawn,
        })),
      });

      this.showSaveStatus("Saved ✓");
    } catch (err) {
      console.error("Failed to save:", err);
      this.showSaveStatus("Save failed!", true);
    }
  }

  /** Load placed objects from Convex (called by GameShell after game init) */
  async loadPlacedObjects(mapName: string) {
    try {
      const convex = getConvexClient();
      const objs = await convex.query(api.mapObjects.listByMap, { mapName });
      this.placedObjects = objs.map((o: any) => ({
        id: o._id,
        spriteDefName: o.spriteDefName,
        instanceName: o.instanceName,
        x: o.x,
        y: o.y,
        layer: o.layer ?? 0,
        isOn: o.isOn,
      }));
    } catch (err) {
      console.warn("Failed to load placed objects:", err);
    }
  }

  /** Load placed world items from Convex (called by GameShell after game init) */
  async loadPlacedItems(mapName: string) {
    try {
      const convex = getConvexClient();
      const result = await convex.query(api.worldItems.listByMap, { mapName });
      this.placedItems = result.items.map((i: any) => ({
        id: i._id,
        itemDefName: i.itemDefName,
        x: i.x,
        y: i.y,
        quantity: i.quantity ?? 1,
        respawn: i.respawn,
      }));
    } catch (err) {
      console.warn("Failed to load placed items:", err);
    }
  }

  private showSaveStatus(text: string, isError = false) {
    this.saveStatusEl.textContent = text;
    this.saveStatusEl.style.color = isError ? "#ff4444" : "#88ff88";
    clearTimeout(this._saveTimer);
    this._saveTimer = window.setTimeout(() => {
      this.saveStatusEl.textContent = "";
    }, 3000);
  }
  private _saveTimer = 0;

  // =========================================================================
  // Visibility
  // =========================================================================

  toggle(visible: boolean) {
    this.el.style.display = visible ? "" : "none";
    if (visible) {
      if (this.tool === "object" || this.tool === "object-erase" ||
          this.tool === "npc" || this.tool === "npc-erase") {
        this.loadSpriteDefs();
      }
      this.updateGhostForCurrentSelection();
    } else {
      // Hide ghost when leaving build mode
      this.game?.objectLayer?.hideGhost();
    }
  }

  show() { this.el.style.display = ""; }
  hide() { this.el.style.display = "none"; }

  destroy() {
    if (this.canvasUpHandler) {
      window.removeEventListener("mouseup", this.canvasUpHandler);
    }
    this.game?.objectLayer?.hideGhost();
    this.el.remove();
  }
}
