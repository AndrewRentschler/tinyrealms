/**
 * Map editor panel – toolbar (paint/erase/collision/object),
 * layer panel, tileset picker, object picker, and canvas painting.
 */
import type { Game } from "../engine/Game.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import { TILESHEET_CONFIGS } from "../config/tilesheet-config.ts";
import { MUSIC_OPTIONS } from "../config/music-config.ts";
import {
  COMBAT_ATTACK_RANGE_MAX_PX,
  COMBAT_ATTACK_RANGE_MIN_PX,
  COMBAT_ATTACK_RANGE_PX,
  COMBAT_DAMAGE_VARIANCE_MAX_PCT,
  COMBAT_DAMAGE_VARIANCE_MIN_PCT,
  COMBAT_DAMAGE_VARIANCE_PCT,
  COMBAT_NPC_HIT_COOLDOWN_MAX_MS,
  COMBAT_NPC_HIT_COOLDOWN_MIN_MS,
  COMBAT_NPC_HIT_COOLDOWN_MS,
  COMBAT_PLAYER_ATTACK_COOLDOWN_MAX_MS,
  COMBAT_PLAYER_ATTACK_COOLDOWN_MIN_MS,
  COMBAT_PLAYER_ATTACK_COOLDOWN_MS,
} from "../config/combat-config.ts";
import "./MapEditor.css";
import "./TilesetPicker.css";
import "./LayerPanel.css";

export type EditorTool = "paint" | "erase" | "collision" | "collision-erase" | "object" | "object-erase" | "object-move" | "npc" | "npc-erase" | "npc-move" | "map" | "portal" | "portal-erase" | "label" | "label-erase" | "item" | "item-erase";
const TOOLS: { key: EditorTool; label: string }[] = [
  { key: "paint",        label: "🖌 Paint" },
  { key: "collision",    label: "🚧 Collision" },
  { key: "object",       label: "📦 Object" },
  { key: "npc",          label: "🧑 NPC" },
  { key: "item",         label: "⚔️ Item" },
  { key: "map",          label: "🗺 Map" },
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
  { key: "portal-erase",     label: "🚪 Portal" },
  { key: "label-erase",      label: "🏷 Label" },
];

/** Move sub-tools shown in the Move dropdown */
const MOVE_OPTIONS: { key: EditorTool; label: string }[] = [
  { key: "object-move",      label: "📦 Object" },
  { key: "npc-move",         label: "🧑 NPC" },
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

const TILESETS: TilesetInfo[] = TILESHEET_CONFIGS;
const MAP_DEFAULT_TILESET_VALUE = "__map_default__";

const DISPLAY_TILE_SIZE = 32;

// ---------------------------------------------------------------------------
// Placed object (in-memory, saved to Convex)
// ---------------------------------------------------------------------------
export interface PlacedObject {
  id: string;             // local UUID or Convex _id
  sourceId?: string;      // Convex _id when this object exists in DB
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
  visibilityType?: "public" | "private" | "system";
  spriteSheetUrl: string;
  defaultAnimation: string;
  animationSpeed: number;
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

function visibilityLabel(v?: "public" | "private" | "system"): "public" | "private" | "system" {
  return (v ?? "system") as "public" | "private" | "system";
}

// ---------------------------------------------------------------------------
// MapEditorPanel
// ---------------------------------------------------------------------------
export class MapEditorPanel {
  private static readonly ITEM_PLACE_DEBUG = true;
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
  /** Irregular (shift-click) tile selection. Each entry is "col,row". */
  private irregularTiles: Set<string> = new Set();
  /** Whether the current selection is irregular (shift-selected) vs rectangular */
  private isIrregularSelection = false;
  /** Extra highlight elements for irregular tile selections */
  private irregularHighlights: HTMLDivElement[] = [];

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
    iconTileW?: number; iconTileH?: number; iconSpriteDefName?: string;
    iconSpriteSheetUrl?: string; iconSpriteAnimation?: string; iconSpriteAnimationSpeed?: number;
    iconSpriteScale?: number; iconSpriteFrameWidth?: number; iconSpriteFrameHeight?: number }[] = [];
  private selectedItemDef: typeof this.itemDefs[0] | null = null;
  placedItems: { id: string; sourceId?: string; itemDefName: string; x: number; y: number;
    quantity: number; respawn?: boolean; respawnMs?: number; pickedUpAt?: number }[] = [];
  private itemPickerEl!: HTMLElement;
  private itemListEl!: HTMLElement;
  private itemRespawnCheck!: HTMLInputElement;
  private itemRespawnTimeInput!: HTMLInputElement;

  // Portal editor state
  private portalDraft: {
    name: string;
    targetMap: string;
    targetSpawn: string;
    direction: string;
    transition: string;
  } = { name: "", targetMap: "", targetSpawn: "start1", direction: "", transition: "fade" };
  private selectedPortalIndex: number | null = null;
  private portalPlacing = false; // true when in "click-to-place" mode
  private portalStart: { tx: number; ty: number } | null = null;
  private availableMaps: { name: string; labelNames?: string[] }[] = [];

  // Label editor state
  private labelDraftName = "";
  private labelStart: { tx: number; ty: number } | null = null;

  // DOM refs
  private toolButtons: HTMLButtonElement[] = [];
  private deleteBtn!: HTMLButtonElement;
  private moveBtn!: HTMLButtonElement;
  private layerButtons: HTMLButtonElement[] = [];
  private layerListEl!: HTMLElement;
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
  private mapPickerEl!: HTMLElement;
  private mapNameInput!: HTMLInputElement;
  private mapMusicSelect!: HTMLSelectElement;
  private mapWeatherSelect!: HTMLSelectElement;
  private mapWeatherIntensitySelect!: HTMLSelectElement;
  private mapWeatherSfxCheck!: HTMLInputElement;
  private mapWeatherLightningCheck!: HTMLInputElement;
  private mapWeatherLightningChanceInput!: HTMLInputElement;
  private mapCombatCheck!: HTMLInputElement;
  private mapCombatRangeInput!: HTMLInputElement;
  private mapCombatCooldownInput!: HTMLInputElement;
  private mapCombatNpcHitCooldownInput!: HTMLInputElement;
  private mapCombatVarianceInput!: HTMLInputElement;
  private mapStatusSelect!: HTMLSelectElement;
  private portalPickerEl!: HTMLElement;
  private portalListEl!: HTMLElement;
  private portalTargetMapSelect!: HTMLSelectElement;
  private portalTargetSpawnSelect!: HTMLSelectElement;
  private portalNameInput!: HTMLInputElement;
  private portalDirectionSelect!: HTMLSelectElement;
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
  private movingObjectId: string | null = null;

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

    // Move dropdown button
    const moveWrap = document.createElement("div");
    moveWrap.style.cssText = "position:relative;display:inline-block;";
    this.moveBtn = document.createElement("button");
    this.moveBtn.className = "editor-tool-btn";
    this.moveBtn.textContent = "↔ Move ▾";
    const moveMenu = document.createElement("div");
    moveMenu.className = "editor-delete-menu";
    moveMenu.style.display = "none";
    for (const opt of MOVE_OPTIONS) {
      const item = document.createElement("button");
      item.className = "editor-delete-menu-item";
      item.textContent = opt.label;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        moveMenu.style.display = "none";
        this.setTool(opt.key);
        this.moveBtn.classList.add("active");
        this.moveBtn.textContent = `↔ Move: ${opt.label}`;
      });
      moveMenu.appendChild(item);
    }
    this.moveBtn.addEventListener("click", () => {
      moveMenu.style.display = moveMenu.style.display === "none" ? "" : "none";
    });
    // Close menu when clicking elsewhere
    document.addEventListener("click", (e) => {
      if (!moveWrap.contains(e.target as Node)) {
        moveMenu.style.display = "none";
      }
    });
    moveWrap.appendChild(this.moveBtn);
    moveWrap.appendChild(moveMenu);
    toolbar.appendChild(moveWrap);

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

    // ---- Resize handle ----
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "editor-resize-handle";
    this.el.appendChild(resizeHandle);

    // ---- Panels container ----
    const panels = document.createElement("div");
    panels.className = "editor-panels";

    // Drag-to-resize logic
    let resizing = false;
    let startY = 0;
    let startH = 0;
    resizeHandle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      resizing = true;
      startY = e.clientY;
      startH = panels.offsetHeight;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    });
    const onMouseMove = (e: MouseEvent) => {
      if (!resizing) return;
      const delta = startY - e.clientY; // dragging up = positive = taller
      const newH = Math.max(120, Math.min(600, startH + delta));
      panels.style.height = `${newH}px`;
    };
    const onMouseUp = () => {
      if (!resizing) return;
      resizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

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

    // Center: Map settings (shown for map tool)
    this.mapPickerEl = this.buildMapPicker();
    this.mapPickerEl.style.display = "none";
    panels.appendChild(this.mapPickerEl);

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

    this.layerListEl = document.createElement("div");
    this.layerListEl.className = "layer-list";
    panel.appendChild(this.layerListEl);

    const controls = document.createElement("div");
    controls.className = "layer-controls";

    const addBgBtn = document.createElement("button");
    addBgBtn.className = "layer-ctrl-btn";
    addBgBtn.textContent = "+BG";
    addBgBtn.title = "Add background layer";
    addBgBtn.addEventListener("click", () => this.addLayer("bg"));

    const addObjBtn = document.createElement("button");
    addObjBtn.className = "layer-ctrl-btn";
    addObjBtn.textContent = "+OBJ";
    addObjBtn.title = "Add object layer";
    addObjBtn.addEventListener("click", () => this.addLayer("obj"));

    const addOverlayBtn = document.createElement("button");
    addOverlayBtn.className = "layer-ctrl-btn";
    addOverlayBtn.textContent = "+OVR";
    addOverlayBtn.title = "Add overlay layer";
    addOverlayBtn.addEventListener("click", () => this.addLayer("overlay"));

    controls.append(addBgBtn, addObjBtn, addOverlayBtn);
    panel.appendChild(controls);

    const orderControls = document.createElement("div");
    orderControls.className = "layer-controls";

    const upBtn = document.createElement("button");
    upBtn.className = "layer-ctrl-btn";
    upBtn.textContent = "↑";
    upBtn.title = "Move active layer up";
    upBtn.addEventListener("click", () => this.moveActiveLayer(-1));

    const downBtn = document.createElement("button");
    downBtn.className = "layer-ctrl-btn";
    downBtn.textContent = "↓";
    downBtn.title = "Move active layer down";
    downBtn.addEventListener("click", () => this.moveActiveLayer(1));

    const delBtn = document.createElement("button");
    delBtn.className = "layer-ctrl-btn";
    delBtn.textContent = "Del";
    delBtn.title = "Delete active layer";
    delBtn.addEventListener("click", () => this.removeActiveLayer());

    orderControls.append(upBtn, downBtn, delBtn);
    panel.appendChild(orderControls);

    this.renderLayerButtons();

    return panel;
  }

  private getLayerButtonText(layerIndex: number, fallbackName?: string): string {
    const mapData = this.game?.mapRenderer.getMapData();
    const layer = mapData?.layers[layerIndex];
    const layerName = layer?.name ?? fallbackName ?? `layer${layerIndex}`;
    const layerTilesetUrl = layer?.tilesetUrl ?? mapData?.tilesetUrl;
    if (!layerTilesetUrl) return layerName;
    const ts = TILESETS.find((t) => t.url === layerTilesetUrl);
    const tsName = ts?.name ?? layerTilesetUrl.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "tileset";
    return `${layerName} · ${tsName}`;
  }

  private refreshLayerButtonLabels() {
    this.renderLayerButtons();
  }

  private renderLayerButtons() {
    if (!this.layerListEl) return;
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData) return;

    this.layerListEl.innerHTML = "";
    this.layerButtons = [];
    mapData.layers.forEach((layer, i) => {
      const btn = document.createElement("button");
      btn.className = `layer-btn ${this.activeLayer === i ? "active" : ""}`;
      btn.textContent = this.getLayerButtonText(i, layer.name);
      btn.title = btn.textContent;
      btn.addEventListener("click", () => this.setLayer(i));
      this.layerListEl.appendChild(btn);
      this.layerButtons.push(btn);
    });
  }

  private makeLayerName(type: "bg" | "obj" | "overlay", layers: { name: string; type: "bg" | "obj" | "overlay" }[]): string {
    const count = layers.filter((l) => l.type === type).length;
    return `${type}${count}`;
  }

  private addLayer(type: "bg" | "obj" | "overlay") {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData || !this.game) return;
    const layerName = this.makeLayerName(type, mapData.layers);
    mapData.layers.push({
      name: layerName,
      type,
      tiles: new Array(mapData.width * mapData.height).fill(-1),
      visible: true,
    });
    this.activeLayer = mapData.layers.length - 1;
    this.game.mapRenderer.loadMap(mapData);
    this.syncTilesetToMapLayer();
    this.showSaveStatus(`Added layer "${layerName}"`, false);
  }

  private removeActiveLayer() {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData || !this.game) return;
    if (mapData.layers.length <= 1) {
      this.showSaveStatus("Map must have at least one layer", true);
      return;
    }
    const target = mapData.layers[this.activeLayer];
    if (!target) return;
    const confirmed = window.confirm(
      `Delete layer "${target.name}"? This removes all tiles on that layer.`,
    );
    if (!confirmed) {
      this.showSaveStatus("Layer delete cancelled", false);
      return;
    }
    const removed = mapData.layers.splice(this.activeLayer, 1)[0];
    this.activeLayer = Math.max(0, Math.min(this.activeLayer, mapData.layers.length - 1));
    this.game.mapRenderer.loadMap(mapData);
    this.syncTilesetToMapLayer();
    this.showSaveStatus(`Removed layer "${removed.name}"`, false);
  }

  private moveActiveLayer(delta: -1 | 1) {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData || !this.game) return;
    const from = this.activeLayer;
    const to = from + delta;
    if (to < 0 || to >= mapData.layers.length) {
      this.showSaveStatus(
        delta < 0 ? "Layer is already at the top" : "Layer is already at the bottom",
        true,
      );
      return;
    }
    const [moved] = mapData.layers.splice(from, 1);
    mapData.layers.splice(to, 0, moved);
    this.activeLayer = to;
    this.game.mapRenderer.loadMap(mapData);
    this.syncTilesetToMapLayer();
    this.showSaveStatus(`Moved layer "${moved.name}"`, false);
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
    const mapDefaultOpt = document.createElement("option");
    mapDefaultOpt.value = MAP_DEFAULT_TILESET_VALUE;
    mapDefaultOpt.textContent = "(Map default)";
    this.tilesetSelect.appendChild(mapDefaultOpt);
    for (const ts of TILESETS) {
      const opt = document.createElement("option");
      opt.value = ts.url;
      opt.textContent = `${ts.name} (${ts.tileWidth}px)`;
      this.tilesetSelect.appendChild(opt);
    }
    this.tilesetSelect.addEventListener("change", () => {
      const selectedValue = this.tilesetSelect.value;
      if (selectedValue === MAP_DEFAULT_TILESET_VALUE) {
        this.applyTilesetToActiveLayer(null);
        const layerTs = this.getTilesetForActiveLayer();
        this.activeTileset = layerTs;
        this.selectedTile = 0;
        this.selectedRegion = { col: 0, row: 0, w: 1, h: 1 };
        this.loadTilesetImage();
        return;
      }
      const ts = TILESETS.find((t) => t.url === selectedValue);
      if (ts) {
        this.applyTilesetToActiveLayer(ts);
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
      const vis = visibilityLabel(def.visibilityType);
      row.innerHTML = `<span class="object-list-name">${def.name}</span><span class="object-list-cat">${def.category}</span><span class="object-list-vis ${vis}">${vis}</span>`;
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
      empty.textContent = "No NPC sprites yet. Create some in the NPC Editor → NPC Sprites tab!";
      this.npcListEl.appendChild(empty);
      return;
    }

    for (const def of npcDefs) {
      const row = document.createElement("button");
      row.className = `object-list-item ${this.selectedSpriteDef?._id === def._id ? "active" : ""}`;
      const vis = visibilityLabel(def.visibilityType);
      row.innerHTML = `<span class="object-list-name">${def.name}</span><span class="object-list-cat">npc</span><span class="object-list-vis ${vis}">${vis}</span>`;
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

    // Respawn controls
    const respawnRow = document.createElement("div");
    respawnRow.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;border-top:1px solid var(--border);";

    this.itemRespawnCheck = document.createElement("input");
    this.itemRespawnCheck.type = "checkbox";
    this.itemRespawnCheck.id = "item-respawn-check";

    const respawnLabel = document.createElement("label");
    respawnLabel.htmlFor = "item-respawn-check";
    respawnLabel.textContent = "Respawn after";
    respawnLabel.style.cssText = "font-size:11px;color:var(--text);cursor:pointer;";

    this.itemRespawnTimeInput = document.createElement("input");
    this.itemRespawnTimeInput.type = "number";
    this.itemRespawnTimeInput.min = "1";
    this.itemRespawnTimeInput.value = "5";
    this.itemRespawnTimeInput.style.cssText = "width:42px;font-size:11px;padding:2px 4px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:3px;";

    const minLabel = document.createElement("span");
    minLabel.textContent = "min";
    minLabel.style.cssText = "font-size:11px;color:var(--text-muted);";

    respawnRow.appendChild(this.itemRespawnCheck);
    respawnRow.appendChild(respawnLabel);
    respawnRow.appendChild(this.itemRespawnTimeInput);
    respawnRow.appendChild(minLabel);
    picker.appendChild(respawnRow);

    return picker;
  }

  private async loadItemDefs() {
    try {
      const convex = getConvexClient();
      const [defs, spriteDefs] = await Promise.all([
        convex.query(api.items.list, {}),
        convex.query(api.spriteDefinitions.list, {}),
      ]);

      const spriteDefsByName = new Map((spriteDefs as any[]).map((d) => [d.name, d]));
      this.itemDefs = (defs as any[]).map((def) => {
        const out: any = { ...def };
        const spriteDefName = def.iconSpriteDefName as string | undefined;
        if (spriteDefName) {
          const spriteDef = spriteDefsByName.get(spriteDefName);
          if (spriteDef && spriteDef.category === "object" && !spriteDef.toggleable && !spriteDef.isDoor) {
            out.iconSpriteSheetUrl = spriteDef.spriteSheetUrl;
            out.iconSpriteAnimation = spriteDef.defaultAnimation;
            out.iconSpriteAnimationSpeed = spriteDef.animationSpeed;
            out.iconSpriteScale = spriteDef.scale;
            out.iconSpriteFrameWidth = spriteDef.frameWidth;
            out.iconSpriteFrameHeight = spriteDef.frameHeight;
          }
        }
        return out;
      });
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
      } else if (def.iconSpriteDefName) {
        iconSpan.textContent = "🎞️";
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
        this.updateGhostForCurrentSelection();
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

  private logItemPlacement(message: string, details?: Record<string, unknown>) {
    if (!MapEditorPanel.ITEM_PLACE_DEBUG) return;
    const prefix = `[MapEditor:item-place] ${message}`;
    if (message.startsWith("Skipped") || message.includes("missing") || message.includes("blocked")) {
      if (details) console.warn(prefix, details);
      else console.warn(prefix);
      return;
    }
    if (details) console.log(prefix, details);
    else console.log(prefix);
  }

  private placeItem(worldX: number, worldY: number) {
    if (!this.selectedItemDef) {
      this.logItemPlacement("Skipped placement: no selected item definition.", {
        worldX,
        worldY,
        tool: this.tool,
      });
      this.showSaveStatus("Select an item first", true);
      return;
    }
    const respawn = this.itemRespawnCheck.checked;
    const respawnMin = parseFloat(this.itemRespawnTimeInput.value) || 5;
    const item: typeof this.placedItems[0] = {
      id: crypto.randomUUID(),
      itemDefName: this.selectedItemDef.name,
      x: Math.round(worldX),
      y: Math.round(worldY),
      quantity: 1,
      respawn: respawn || undefined,
      respawnMs: respawn ? Math.round(respawnMin * 60 * 1000) : undefined,
    };
    this.placedItems.push(item);
    this.logItemPlacement("Placed item.", {
      itemDefName: item.itemDefName,
      displayName: this.selectedItemDef.displayName,
      worldX,
      worldY,
      placedX: item.x,
      placedY: item.y,
      respawn: item.respawn ?? false,
      respawnMs: item.respawnMs ?? null,
      totalPlacedItems: this.placedItems.length,
    });
    const respawnNote = respawn ? ` (respawns in ${respawnMin}m)` : "";
    this.tileInfoEl.textContent = `Placed: ${this.selectedItemDef.displayName}${respawnNote} (${this.placedItems.length} items total)`;

    // Render on the world item layer immediately
    if (this.game && this.game.worldItemLayer) {
      this.game.worldItemLayer.addItem({
        id: item.id,
        itemDefName: item.itemDefName,
        x: item.x,
        y: item.y,
        quantity: item.quantity,
      }, this.selectedItemDef);
    } else {
      this.logItemPlacement("World item layer missing during placement render.", {
        hasGame: !!this.game,
        hasWorldItemLayer: !!this.game?.worldItemLayer,
      });
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
      if (this.game && this.game.worldItemLayer) {
        this.game.worldItemLayer.removeItem(removed.id);
      }
      this.tileInfoEl.textContent = `Removed item (${this.placedItems.length} remaining)`;
    }
  }

  /** Show info about an existing world item at the click location */
  private inspectItemAt(worldX: number, worldY: number): boolean {
    const radius = 40;
    let bestItem: any = null;
    let bestDist = Infinity;
    for (const item of this.placedItems) {
      const dx = item.x - worldX;
      const dy = item.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius && dist < bestDist) {
        bestDist = dist;
        bestItem = item;
      }
    }
    if (!bestItem) return false;
    this.logItemPlacement("Placement click intercepted by existing nearby item (inspect mode).", {
      clickedWorldX: worldX,
      clickedWorldY: worldY,
      nearestItemId: bestItem.id,
      nearestItemDefName: bestItem.itemDefName,
      nearestItemX: bestItem.x,
      nearestItemY: bestItem.y,
      nearestDistancePx: Math.round(bestDist),
      inspectRadiusPx: radius,
    });

    const parts: string[] = [`Item: ${bestItem.itemDefName}`];
    parts.push(`qty: ${bestItem.quantity}`);
    if (bestItem.respawn) {
      const mins = Math.round((bestItem.respawnMs ?? 300_000) / 60_000);
      parts.push(`respawn: ${mins}m`);
    }
    if (bestItem.pickedUpAt) {
      const ago = Math.round((Date.now() - bestItem.pickedUpAt) / 1000);
      parts.push(`picked up ${ago}s ago`);
    }
    parts.push(`pos: (${Math.round(bestItem.x)}, ${Math.round(bestItem.y)})`);
    parts.push("hold Shift to force place");
    this.tileInfoEl.textContent = parts.join("  |  ");
    return true;
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
    if (e.shiftKey) {
      // Shift+click: toggle individual tile in irregular selection
      this.isIrregularSelection = true;
      const key = `${col},${row}`;
      if (this.irregularTiles.has(key)) {
        this.irregularTiles.delete(key);
      } else {
        this.irregularTiles.add(key);
      }
      this.tsDragStart = { col, row };
      this.updateIrregularHighlights();
      this.updateIrregularInfo();
    } else {
      // Normal click: clear irregular set, start rectangle drag
      this.isIrregularSelection = false;
      this.irregularTiles.clear();
      this.clearIrregularHighlights();
      this.tsDragStart = { col, row };
      this.applyTileSelection(col, row, col, row);
    }
  }

  private onTileCanvasMove(e: MouseEvent) {
    if (!this.tsDragStart) return;
    const { col, row } = this.tileCanvasToGrid(e);
    if (e.shiftKey && this.isIrregularSelection) {
      // Shift+drag: add all tiles in the dragged rectangle to the irregular set
      const minC = Math.min(this.tsDragStart.col, col);
      const maxC = Math.max(this.tsDragStart.col, col);
      const minR = Math.min(this.tsDragStart.row, row);
      const maxR = Math.max(this.tsDragStart.row, row);
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          this.irregularTiles.add(`${c},${r}`);
        }
      }
      this.updateIrregularHighlights();
      this.updateIrregularInfo();
    } else if (!this.isIrregularSelection) {
      this.applyTileSelection(this.tsDragStart.col, this.tsDragStart.row, col, row);
    }
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

  /** Rebuild the per-tile highlight elements for irregular selection */
  private updateIrregularHighlights() {
    // Hide the rectangular highlight when in irregular mode
    this.highlightEl.style.display = this.isIrregularSelection ? "none" : "";

    // Remove old highlights
    this.clearIrregularHighlights();

    if (!this.isIrregularSelection) return;

    const parent = this.highlightEl.parentElement;
    if (!parent) return;

    for (const key of this.irregularTiles) {
      const [c, r] = key.split(",").map(Number);
      const el = document.createElement("div");
      el.className = "tileset-highlight";
      el.style.left = c * DISPLAY_TILE_SIZE + "px";
      el.style.top = r * DISPLAY_TILE_SIZE + "px";
      el.style.width = DISPLAY_TILE_SIZE + "px";
      el.style.height = DISPLAY_TILE_SIZE + "px";
      parent.appendChild(el);
      this.irregularHighlights.push(el);
    }
  }

  private clearIrregularHighlights() {
    for (const el of this.irregularHighlights) el.remove();
    this.irregularHighlights = [];
  }

  /** Update status text for irregular selection */
  private updateIrregularInfo() {
    if (this.irregularTiles.size === 0) {
      this.tileInfoEl.textContent = "No tiles selected";
    } else {
      this.tileInfoEl.textContent = `Selected: ${this.irregularTiles.size} tiles (Shift+click)`;
    }
  }

  /** Get the irregular selection as an array of {col, row, tileIdx} relative to its bounding box origin */
  private getIrregularSelectionTiles(): { dx: number; dy: number; tileIdx: number }[] {
    if (this.irregularTiles.size === 0) return [];
    const ts = this.activeTileset;
    const tsCols = Math.floor(ts.imageWidth / ts.tileWidth);

    // Parse all positions
    const positions = [...this.irregularTiles].map((k) => {
      const [c, r] = k.split(",").map(Number);
      return { col: c, row: r };
    });

    // Find bounding box origin
    const minCol = Math.min(...positions.map((p) => p.col));
    const minRow = Math.min(...positions.map((p) => p.row));

    return positions.map((p) => ({
      dx: p.col - minCol,
      dy: p.row - minRow,
      tileIdx: p.row * tsCols + p.col,
    }));
  }

  private getMapDefaultTileset(): TilesetInfo {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData) return TILESETS[0];
    return TILESETS.find((t) => t.url === mapData.tilesetUrl) ?? TILESETS[0];
  }

  private getTilesetForActiveLayer(): TilesetInfo {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData) return TILESETS[0];
    const layer = mapData.layers[this.activeLayer];
    const resolvedUrl = layer?.tilesetUrl ?? mapData.tilesetUrl;
    return TILESETS.find((t) => t.url === resolvedUrl) ?? this.getMapDefaultTileset();
  }

  /** Assign a tileset to the active layer (null => map default) and re-render. */
  private applyTilesetToActiveLayer(ts: TilesetInfo | null) {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData) return;
    const layer = mapData.layers[this.activeLayer];
    if (!layer) return;

    if (ts) {
      if (mapData.tileWidth !== ts.tileWidth || mapData.tileHeight !== ts.tileHeight) {
        this.showSaveStatus(
          `Tileset tile size must be ${mapData.tileWidth}×${mapData.tileHeight} for this map`,
          true,
        );
        this.syncTilesetToMapLayer();
        return;
      }
      layer.tilesetUrl = ts.url;
      this.activeTileset = ts;
    } else {
      delete layer.tilesetUrl;
      this.activeTileset = this.getMapDefaultTileset();
    }

    this.selectedTile = 0;
    this.selectedRegion = { col: 0, row: 0, w: 1, h: 1 };
    this.game!.mapRenderer.loadMap(mapData);
    this.loadTilesetImage();
    this.updateTileSizeLabel();
    this.updateMapDimsLabel();
    this.refreshLayerButtonLabels();
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
    if (this.movingObjectId && t !== this.tool) {
      this.cancelMoveSelection();
    }
    this.tool = t;

    // Highlight the matching TOOLS button (deactivate all first)
    const isDeleteTool = DELETE_OPTIONS.some(d => d.key === t);
    const isMoveTool = MOVE_OPTIONS.some(m => m.key === t);
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
    // Update move button state
    if (isMoveTool) {
      this.moveBtn.classList.add("active");
      const opt = MOVE_OPTIONS.find(m => m.key === t);
      this.moveBtn.textContent = `↔ Move: ${opt?.label ?? ""}`;
    } else {
      this.moveBtn.classList.remove("active");
      this.moveBtn.textContent = "↔ Move ▾";
    }

    // Swap visible picker
    const isObjTool = t === "object" || t === "object-erase" || t === "object-move";
    const isNpcTool = t === "npc" || t === "npc-erase" || t === "npc-move";
    const isItemTool = t === "item" || t === "item-erase";
    const isMap = t === "map";
    const isPortal = t === "portal";
    const isLabel = t === "label";
    const hideDefault = isObjTool || isNpcTool || isItemTool || isMap || isPortal || isLabel;
    this.tilesetPickerEl.style.display = hideDefault ? "none" : "";
    this.objectPickerEl.style.display = isObjTool ? "" : "none";
    this.npcPickerEl.style.display = isNpcTool ? "" : "none";
    this.itemPickerEl.style.display = isItemTool ? "" : "none";
    this.mapPickerEl.style.display = isMap ? "" : "none";
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

    if (isMap) {
      this.syncMapSettingsUI();
    }

    if (isPortal) {
      void this.refreshPortalList();
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

    if (t === "object-move") {
      this.tileInfoEl.textContent = "Move Object: click an object to pick it up";
    } else if (t === "npc-move") {
      this.tileInfoEl.textContent = "Move NPC: click an NPC to pick it up";
    }
  }

  private setLayer(index: number) {
    this.activeLayer = index;
    this.layerButtons.forEach((btn, i) => {
      btn.classList.toggle("active", i === index);
    });
    this.syncTilesetToMapLayer();

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
        animationSpeed: this.selectedSpriteDef.animationSpeed,
        scale: this.selectedSpriteDef.scale,
        frameWidth: this.selectedSpriteDef.frameWidth,
        frameHeight: this.selectedSpriteDef.frameHeight,
      });
      this.game.worldItemLayer?.hideGhost();
    } else if (this.tool === "item" && this.selectedItemDef) {
      this.game.worldItemLayer?.showGhost(this.selectedItemDef);
      this.game.objectLayer.hideGhost();
    } else {
      this.game.objectLayer.hideGhost();
      this.game.worldItemLayer?.hideGhost();
    }
  }

  // =========================================================================
  // Wire to Game engine
  // =========================================================================

  setGame(game: Game) {
    this.game = game;
    this.bindCanvasEvents(game);
    // Auto-select the tileset matching the current map
    this.syncTilesetToMapLayer();
    this.updateMapDimsLabel();
    this.refreshLayerButtonLabels();
  }

  /** Match the editor's tileset dropdown to the active layer's tileset. */
  private syncTilesetToMapLayer() {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData) return;
    if (mapData.layers.length === 0) return;
    if (this.activeLayer < 0 || this.activeLayer >= mapData.layers.length) {
      this.activeLayer = Math.max(0, Math.min(this.activeLayer, mapData.layers.length - 1));
    }
    const layer = mapData.layers[this.activeLayer];
    const selectedValue = layer?.tilesetUrl ?? MAP_DEFAULT_TILESET_VALUE;
    this.tilesetSelect.value = selectedValue;
    this.activeTileset = this.getTilesetForActiveLayer();
    this.selectedTile = 0;
    this.selectedRegion = { col: 0, row: 0, w: 1, h: 1 };
    this.loadTilesetImage();
    this.updateTileSizeLabel();
    this.refreshLayerButtonLabels();
  }

  /** Called by GameShell when the active map changes. */
  onMapChanged() {
    this.activeLayer = 0;
    this.syncTilesetToMapLayer();
    this.updateMapDimsLabel();
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
        "object-move", "npc-move", "item", "item-erase", "map", "portal", "portal-erase", "label"];
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
              if (this.isIrregularSelection && this.irregularTiles.size > 0) {
                const tiles = this.getIrregularSelectionTiles();
                game.mapRenderer.showIrregularTileGhost(tx, ty, tiles, tsCols, ts.url);
              } else {
                game.mapRenderer.showTileGhost(tx, ty, this.selectedRegion, tsCols, ts.url);
              }
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
      } else if (this.tool === "object-move" || this.tool === "npc-move") {
        game.mapRenderer.hideTileGhost();
        game.objectLayer?.hideGhost();
      } else if (this.tool === "item" || this.tool === "item-erase") {
        game.mapRenderer.hideTileGhost();
        game.objectLayer?.hideGhost();
        game.worldItemLayer?.updateGhost(worldX, worldY);
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
      if (e.key === "Escape" && this.movingObjectId) {
        this.cancelMoveSelection();
        this.showSaveStatus("Move cancelled", false);
        this.tileInfoEl.textContent =
          this.tool === "npc-move"
            ? "Move NPC: click an NPC to pick it up"
            : "Move Object: click an object to pick it up";
        return;
      }
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
    } else if (this.tool === "object-move" || this.tool === "npc-move") {
      this.moveObjectAt(worldX, worldY);
    } else if (this.tool === "object-erase" || this.tool === "npc-erase") {
      this.removeObjectAt(worldX, worldY);
    } else if (this.tool === "item") {
      this.logItemPlacement("Canvas action for item tool.", {
        worldX,
        worldY,
        shiftKey: e.shiftKey,
        selectedItemDefName: this.selectedItemDef?.name ?? null,
      });
      // If Shift is held, force placement even if near an existing item.
      const forcePlace = e.shiftKey;
      if (forcePlace) {
        this.logItemPlacement("Force placement enabled (Shift held).", { worldX, worldY });
      }
      // If clicking near an existing item, inspect it; otherwise place.
      const inspectedExisting = forcePlace ? false : this.inspectItemAt(worldX, worldY);
      if (!inspectedExisting) {
        this.placeItem(worldX, worldY);
      } else {
        this.logItemPlacement("Placement blocked by nearby item (inspect mode).", {
          worldX,
          worldY,
        });
        this.showSaveStatus("Blocked by nearby item. Hold Shift + click to force place.", true);
      }
    } else if (this.tool === "item-erase") {
      this.removeItemAt(worldX, worldY);
    } else if (this.tool === "map") {
      // Map settings are edited in the side panel only.
      return;
    } else if (this.tool === "portal-erase") {
      this.removePortalAt(worldX, worldY);
    } else if (this.tool === "label-erase") {
      this.removeLabelAt(worldX, worldY);
    } else {
      this.paintTileAt(worldX, worldY, game);
    }
  }

  private paintTileAt(worldX: number, worldY: number, game: Game) {
    const mapData = game.mapRenderer.getMapData();
    if (!mapData) return;
    if (this.activeLayer < 0 || this.activeLayer >= mapData.layers.length) return;

    const tileX = Math.floor(worldX / mapData.tileWidth);
    const tileY = Math.floor(worldY / mapData.tileHeight);

    if (tileX < 0 || tileY < 0 || tileX >= mapData.width || tileY >= mapData.height) return;

    if (this.tool === "paint") {
      if (this.isIrregularSelection && this.irregularTiles.size > 0) {
        // Stamp the irregular tile selection
        const tiles = this.getIrregularSelectionTiles();
        for (const t of tiles) {
          const mx = tileX + t.dx;
          const my = tileY + t.dy;
          if (mx >= 0 && my >= 0 && mx < mapData.width && my < mapData.height) {
            game.mapRenderer.setTile(this.activeLayer, mx, my, t.tileIdx);
          }
        }
      } else {
        // Stamp the full selected rectangular region
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

  private isNpcObject(spriteDefName: string): boolean {
    const def = this.spriteDefs.find((d) => d.name === spriteDefName);
    return def?.category === "npc";
  }

  private restoreMovingObjectRender() {
    if (!this.movingObjectId) return;
    const obj = this.placedObjects.find((o) => o.id === this.movingObjectId);
    if (!obj) return;
    const def = this.spriteDefs.find((d) => d.name === obj.spriteDefName) as any;
    this.game?.objectLayer?.removePlacedObject(obj.id);
    void this.game?.objectLayer?.addPlacedObject(obj, def);
  }

  private cancelMoveSelection() {
    if (!this.movingObjectId) return;
    this.restoreMovingObjectRender();
    this.movingObjectId = null;
  }

  private findPlacedObjectIndexAt(worldX: number, worldY: number, mode: "object" | "npc"): number {
    // Objects are anchored at bottom-center (0.5, 1.0), so the stored Y is
    // the sprite's feet. Use an asymmetric hit-test to capture body clicks.
    const defByName = new Map(this.spriteDefs.map(d => [d.name, d]));
    const hitTest = (objX: number, objY: number, spriteDefName: string): boolean => {
      const def = defByName.get(spriteDefName);
      const hitAbove = def ? def.frameHeight * def.scale : 384;
      const hitSide = def ? (def.frameWidth * def.scale) / 2 : 192;
      const hitBelow = 16;
      const dx = Math.abs(objX - worldX);
      const dy = objY - worldY; // positive = click is above anchor
      return dx <= hitSide && dy >= -hitBelow && dy <= hitAbove;
    };
    const hitScore = (objX: number, objY: number): number => {
      return Math.abs(objX - worldX) + Math.abs(objY - worldY);
    };

    let bestIdx = -1;
    let bestScore = Infinity;
    for (let i = 0; i < this.placedObjects.length; i++) {
      const obj = this.placedObjects[i];
      const isNpc = this.isNpcObject(obj.spriteDefName);
      if (mode === "object" && isNpc) continue;
      if (mode === "npc" && !isNpc) continue;
      if (!hitTest(obj.x, obj.y, obj.spriteDefName)) continue;
      const s = hitScore(obj.x, obj.y);
      if (s < bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private getPersistedMapObjectId(obj: PlacedObject): string | null {
    if (obj.sourceId) return obj.sourceId;
    // Backward compatibility for already-loaded editor state without sourceId.
    if (obj.id && !obj.id.includes("-")) return obj.id;
    return null;
  }

  private async persistMovedObject(obj: PlacedObject) {
    if (!this.game) return;
    const existingId = this.getPersistedMapObjectId(obj);
    if (!existingId) {
      this.showSaveStatus("Moved locally. Click Save to persist.");
      return;
    }
    try {
      const convex = getConvexClient();
      const mapData = this.game.mapRenderer.getMapData();
      const mapName = mapData?.name || this.game.currentMapName || "cozy-cabin";
      const profileId = this.game.profile._id as any;
      await convex.mutation(api.mapObjects.move, {
        profileId,
        mapName,
        id: existingId as any,
        x: obj.x,
        y: obj.y,
      });
      this.showSaveStatus("Move saved");
    } catch (err) {
      console.error("Failed to persist moved object:", err);
      this.showSaveStatus("Move not persisted. Click Save.", true);
    }
  }

  private moveObjectAt(worldX: number, worldY: number) {
    const mode: "object" | "npc" = this.tool === "npc-move" ? "npc" : "object";

    if (!this.movingObjectId) {
      const idx = this.findPlacedObjectIndexAt(worldX, worldY, mode);
      if (idx < 0) {
        this.showSaveStatus(mode === "npc" ? "Click an NPC to move" : "Click an object to move", true);
        return;
      }
      const selected = this.placedObjects[idx];
      this.movingObjectId = selected.id;
      this.game?.objectLayer?.removePlacedObject(selected.id);
      if (mode === "npc" && this.game?.entityLayer) {
        const npcHit = this.game.entityLayer.findNearestNPCAt(worldX, worldY, 320);
        if (npcHit) this.game.entityLayer.removeNPC(npcHit.id);
      }
      this.tileInfoEl.textContent = `Picked ${selected.spriteDefName}. Click destination to place.`;
      return;
    }

    const idx = this.placedObjects.findIndex((o) => o.id === this.movingObjectId);
    if (idx < 0) {
      this.movingObjectId = null;
      this.showSaveStatus("Move selection expired. Pick again.", true);
      return;
    }

    const obj = this.placedObjects[idx];
    obj.x = Math.round(worldX);
    obj.y = Math.round(worldY);
    this.movingObjectId = null;
    this.tileInfoEl.textContent = `Moved ${obj.spriteDefName} (${this.placedObjects.length} total)`;

    const def = this.spriteDefs.find((d) => d.name === obj.spriteDefName) as any;
    this.game?.objectLayer?.removePlacedObject(obj.id);
    void this.game?.objectLayer?.addPlacedObject(obj, def);
    void this.persistMovedObject(obj);
  }

  private removeObjectAt(worldX: number, worldY: number) {
    const mode: "object" | "npc" = this.tool === "npc-erase" ? "npc" : "object";
    const bestIdx = this.findPlacedObjectIndexAt(worldX, worldY, mode);

    if (bestIdx < 0) return;

    const removed = this.placedObjects.splice(bestIdx, 1)[0];
    this.game?.objectLayer?.removePlacedObject(removed.id);

    if (mode === "npc" && this.game?.entityLayer) {
      // Also remove the nearest runtime NPC around the clicked area.
      const npcHit = this.game.entityLayer.findNearestNPCAt(worldX, worldY, 320);
      if (npcHit) this.game.entityLayer.removeNPC(npcHit.id);
      this.tileInfoEl.textContent = `Removed NPC (${this.placedObjects.length} total)`;
      return;
    }

    this.tileInfoEl.textContent = `Removed object (${this.placedObjects.length} total)`;
  }

  // =========================================================================
  // Save all (map + objects)
  // =========================================================================

  // ===========================================================================
  // Portal editor
  // ===========================================================================

  private buildMapPicker(): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "tileset-picker";

    const header = document.createElement("div");
    header.className = "tileset-picker-header";
    const label = document.createElement("div");
    label.className = "tileset-picker-label";
    label.textContent = "Map Settings";
    header.appendChild(label);
    picker.appendChild(header);

    const form = document.createElement("div");
    form.style.cssText = "padding:8px;display:flex;flex-direction:column;gap:6px;font-size:12px;";

    const nameRow = document.createElement("div");
    nameRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const nameLabel = document.createElement("span");
    nameLabel.textContent = "Map Name:";
    nameLabel.style.minWidth = "80px";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Map name";
    nameInput.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    nameInput.addEventListener("input", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) mapData.name = nameInput.value.trim() || mapData.name;
    });
    this.mapNameInput = nameInput;
    nameRow.append(nameLabel, nameInput);
    form.appendChild(nameRow);

    const musicRow = document.createElement("div");
    musicRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const musicLabel = document.createElement("span");
    musicLabel.textContent = "Music:";
    musicLabel.style.minWidth = "80px";
    const musicSelect = document.createElement("select");
    musicSelect.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
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
    this.mapMusicSelect = musicSelect;
    musicRow.append(musicLabel, musicSelect);
    form.appendChild(musicRow);

    const weatherRow = document.createElement("div");
    weatherRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const weatherLabel = document.createElement("span");
    weatherLabel.textContent = "Weather:";
    weatherLabel.style.minWidth = "80px";
    const weatherSelect = document.createElement("select");
    weatherSelect.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    for (const optDef of [
      { value: "clear", label: "Clear" },
      { value: "rainy", label: "Rainy" },
      { value: "scattered_rain", label: "Scattered rain" },
    ]) {
      const opt = document.createElement("option");
      opt.value = optDef.value;
      opt.textContent = optDef.label;
      weatherSelect.appendChild(opt);
    }
    weatherSelect.addEventListener("change", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) mapData.weatherMode = weatherSelect.value as any;
    });
    this.mapWeatherSelect = weatherSelect;
    weatherRow.append(weatherLabel, weatherSelect);
    form.appendChild(weatherRow);

    const weatherIntensityRow = document.createElement("div");
    weatherIntensityRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const weatherIntensityLabel = document.createElement("span");
    weatherIntensityLabel.textContent = "Rain Intensity:";
    weatherIntensityLabel.style.minWidth = "80px";
    const weatherIntensitySelect = document.createElement("select");
    weatherIntensitySelect.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    for (const optDef of [
      { value: "light", label: "Light" },
      { value: "medium", label: "Medium" },
      { value: "heavy", label: "Heavy" },
    ]) {
      const opt = document.createElement("option");
      opt.value = optDef.value;
      opt.textContent = optDef.label;
      weatherIntensitySelect.appendChild(opt);
    }
    weatherIntensitySelect.addEventListener("change", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) mapData.weatherIntensity = weatherIntensitySelect.value as any;
    });
    this.mapWeatherIntensitySelect = weatherIntensitySelect;
    weatherIntensityRow.append(weatherIntensityLabel, weatherIntensitySelect);
    form.appendChild(weatherIntensityRow);

    const weatherSfxRow = document.createElement("div");
    weatherSfxRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const weatherSfxLabel = document.createElement("span");
    weatherSfxLabel.textContent = "Rain SFX:";
    weatherSfxLabel.style.minWidth = "80px";
    const weatherSfxCheck = document.createElement("input");
    weatherSfxCheck.type = "checkbox";
    weatherSfxCheck.addEventListener("change", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) mapData.weatherRainSfx = weatherSfxCheck.checked;
    });
    this.mapWeatherSfxCheck = weatherSfxCheck;
    weatherSfxRow.append(weatherSfxLabel, weatherSfxCheck);
    form.appendChild(weatherSfxRow);

    const weatherLightningRow = document.createElement("div");
    weatherLightningRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const weatherLightningLabel = document.createElement("span");
    weatherLightningLabel.textContent = "Lightning:";
    weatherLightningLabel.style.minWidth = "80px";
    const weatherLightningCheck = document.createElement("input");
    weatherLightningCheck.type = "checkbox";
    weatherLightningCheck.addEventListener("change", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (mapData) mapData.weatherLightningEnabled = weatherLightningCheck.checked;
    });
    this.mapWeatherLightningCheck = weatherLightningCheck;
    weatherLightningRow.append(weatherLightningLabel, weatherLightningCheck);
    form.appendChild(weatherLightningRow);

    const weatherLightningChanceRow = document.createElement("div");
    weatherLightningChanceRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const weatherLightningChanceLabel = document.createElement("span");
    weatherLightningChanceLabel.textContent = "Lightning/sec:";
    weatherLightningChanceLabel.style.minWidth = "80px";
    const weatherLightningChanceInput = document.createElement("input");
    weatherLightningChanceInput.type = "number";
    weatherLightningChanceInput.min = "0";
    weatherLightningChanceInput.max = "1";
    weatherLightningChanceInput.step = "0.01";
    weatherLightningChanceInput.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    weatherLightningChanceInput.addEventListener("input", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (!mapData) return;
      const n = Number(weatherLightningChanceInput.value);
      if (!Number.isFinite(n)) return;
      mapData.weatherLightningChancePerSec = Math.max(0, Math.min(1, n));
    });
    this.mapWeatherLightningChanceInput = weatherLightningChanceInput;
    weatherLightningChanceRow.append(weatherLightningChanceLabel, weatherLightningChanceInput);
    form.appendChild(weatherLightningChanceRow);

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
    this.mapCombatCheck = combatCheck;
    combatRow.append(combatLabel, combatCheck);
    form.appendChild(combatRow);

    const combatRangeRow = document.createElement("div");
    combatRangeRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const combatRangeLabel = document.createElement("span");
    combatRangeLabel.textContent = "Attack Range:";
    combatRangeLabel.style.minWidth = "80px";
    const combatRangeInput = document.createElement("input");
    combatRangeInput.type = "number";
    combatRangeInput.min = String(COMBAT_ATTACK_RANGE_MIN_PX);
    combatRangeInput.max = String(COMBAT_ATTACK_RANGE_MAX_PX);
    combatRangeInput.step = "1";
    combatRangeInput.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    combatRangeInput.addEventListener("input", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (!mapData) return;
      const n = Number(combatRangeInput.value);
      if (!Number.isFinite(n)) return;
      mapData.combatSettings = mapData.combatSettings ?? {};
      mapData.combatSettings.attackRangePx = Math.max(
        COMBAT_ATTACK_RANGE_MIN_PX,
        Math.min(COMBAT_ATTACK_RANGE_MAX_PX, Math.round(n)),
      );
    });
    this.mapCombatRangeInput = combatRangeInput;
    combatRangeRow.append(combatRangeLabel, combatRangeInput);
    form.appendChild(combatRangeRow);

    const combatCooldownRow = document.createElement("div");
    combatCooldownRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const combatCooldownLabel = document.createElement("span");
    combatCooldownLabel.textContent = "Atk Cooldown:";
    combatCooldownLabel.style.minWidth = "80px";
    const combatCooldownInput = document.createElement("input");
    combatCooldownInput.type = "number";
    combatCooldownInput.min = String(COMBAT_PLAYER_ATTACK_COOLDOWN_MIN_MS);
    combatCooldownInput.max = String(COMBAT_PLAYER_ATTACK_COOLDOWN_MAX_MS);
    combatCooldownInput.step = "10";
    combatCooldownInput.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    combatCooldownInput.addEventListener("input", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (!mapData) return;
      const n = Number(combatCooldownInput.value);
      if (!Number.isFinite(n)) return;
      mapData.combatSettings = mapData.combatSettings ?? {};
      mapData.combatSettings.playerAttackCooldownMs = Math.max(
        COMBAT_PLAYER_ATTACK_COOLDOWN_MIN_MS,
        Math.min(COMBAT_PLAYER_ATTACK_COOLDOWN_MAX_MS, Math.round(n)),
      );
    });
    this.mapCombatCooldownInput = combatCooldownInput;
    combatCooldownRow.append(combatCooldownLabel, combatCooldownInput);
    form.appendChild(combatCooldownRow);

    const combatNpcHitCdRow = document.createElement("div");
    combatNpcHitCdRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const combatNpcHitCdLabel = document.createElement("span");
    combatNpcHitCdLabel.textContent = "Hit Recovery:";
    combatNpcHitCdLabel.style.minWidth = "80px";
    const combatNpcHitCdInput = document.createElement("input");
    combatNpcHitCdInput.type = "number";
    combatNpcHitCdInput.min = String(COMBAT_NPC_HIT_COOLDOWN_MIN_MS);
    combatNpcHitCdInput.max = String(COMBAT_NPC_HIT_COOLDOWN_MAX_MS);
    combatNpcHitCdInput.step = "10";
    combatNpcHitCdInput.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    combatNpcHitCdInput.addEventListener("input", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (!mapData) return;
      const n = Number(combatNpcHitCdInput.value);
      if (!Number.isFinite(n)) return;
      mapData.combatSettings = mapData.combatSettings ?? {};
      mapData.combatSettings.npcHitCooldownMs = Math.max(
        COMBAT_NPC_HIT_COOLDOWN_MIN_MS,
        Math.min(COMBAT_NPC_HIT_COOLDOWN_MAX_MS, Math.round(n)),
      );
    });
    this.mapCombatNpcHitCooldownInput = combatNpcHitCdInput;
    combatNpcHitCdRow.append(combatNpcHitCdLabel, combatNpcHitCdInput);
    form.appendChild(combatNpcHitCdRow);

    const combatVarianceRow = document.createElement("div");
    combatVarianceRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const combatVarianceLabel = document.createElement("span");
    combatVarianceLabel.textContent = "Dmg Variance:";
    combatVarianceLabel.style.minWidth = "80px";
    const combatVarianceInput = document.createElement("input");
    combatVarianceInput.type = "number";
    combatVarianceInput.min = String(COMBAT_DAMAGE_VARIANCE_MIN_PCT);
    combatVarianceInput.max = String(COMBAT_DAMAGE_VARIANCE_MAX_PCT);
    combatVarianceInput.step = "1";
    combatVarianceInput.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    combatVarianceInput.addEventListener("input", () => {
      const mapData = this.game?.mapRenderer.getMapData();
      if (!mapData) return;
      const n = Number(combatVarianceInput.value);
      if (!Number.isFinite(n)) return;
      mapData.combatSettings = mapData.combatSettings ?? {};
      mapData.combatSettings.damageVariancePct = Math.max(
        COMBAT_DAMAGE_VARIANCE_MIN_PCT,
        Math.min(COMBAT_DAMAGE_VARIANCE_MAX_PCT, Math.round(n)),
      );
    });
    this.mapCombatVarianceInput = combatVarianceInput;
    combatVarianceRow.append(combatVarianceLabel, combatVarianceInput);
    form.appendChild(combatVarianceRow);

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
    this.mapStatusSelect = statusSelect;
    statusRow.append(statusLabel, statusSelect);
    form.appendChild(statusRow);

    const info = document.createElement("div");
    info.style.cssText = "margin-top:6px;padding:6px 8px;background:#1a1a2e;border:1px solid #333;border-radius:4px;font-size:11px;color:#aaa;line-height:1.4;";
    info.textContent = "Map settings are saved when you click Save.";
    form.appendChild(info);

    picker.appendChild(form);

    return picker;
  }

  private buildPortalPicker(): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "tileset-picker"; // reuse layout

    const header = document.createElement("div");
    header.className = "tileset-picker-header";
    const label = document.createElement("div");
    label.className = "tileset-picker-label";
    label.textContent = "Portals";
    header.appendChild(label);
    picker.appendChild(header);

    // --- New portal form ---
    const form = document.createElement("div");
    form.style.cssText = "padding:8px;display:flex;flex-direction:column;gap:6px;font-size:12px;";

    // Name
    const nameRow = this.portalFormRow("Name:", "text", "door-1", (v) => {
      this.portalDraft.name = v;
      this.applyPortalDraftToSelected();
    });

    // Target map (select)
    const mapRow = document.createElement("div");
    mapRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const mapLabel = document.createElement("span");
    mapLabel.textContent = "Target Map:";
    mapLabel.style.minWidth = "80px";
    const mapSelect = document.createElement("select");
    mapSelect.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    mapSelect.addEventListener("change", () => {
      this.portalDraft.targetMap = mapSelect.value;
      void this.refreshPortalTargetSpawnOptions(mapSelect.value);
      this.applyPortalDraftToSelected();
    });
    this.portalTargetMapSelect = mapSelect;
    mapRow.append(mapLabel, mapSelect);

    // Spawn label (from target map labels)
    const spawnRow = document.createElement("div");
    spawnRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const spawnLabel = document.createElement("span");
    spawnLabel.textContent = "Target Label:";
    spawnLabel.style.minWidth = "80px";
    const spawnSelect = document.createElement("select");
    spawnSelect.style.cssText = "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";
    spawnSelect.addEventListener("change", () => {
      this.portalDraft.targetSpawn = spawnSelect.value || "start1";
      this.applyPortalDraftToSelected();
    });
    this.portalTargetSpawnSelect = spawnSelect;
    spawnRow.append(spawnLabel, spawnSelect);

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
    dirSelect.addEventListener("change", () => {
      this.portalDraft.direction = dirSelect.value;
      this.applyPortalDraftToSelected();
    });
    this.portalDirectionSelect = dirSelect;
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
    if (labelText === "Name:") this.portalNameInput = inp;
    row.append(lbl, inp);
    return row;
  }

  private syncMapSettingsUI() {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData) return;
    if (this.mapNameInput) this.mapNameInput.value = mapData.name ?? "";
    if (this.mapMusicSelect) this.mapMusicSelect.value = mapData.musicUrl ?? "";
    if (this.mapWeatherSelect) this.mapWeatherSelect.value = mapData.weatherMode ?? "clear";
    if (this.mapWeatherIntensitySelect) {
      this.mapWeatherIntensitySelect.value = mapData.weatherIntensity ?? "medium";
    }
    if (this.mapWeatherSfxCheck) {
      this.mapWeatherSfxCheck.checked = !!mapData.weatherRainSfx;
    }
    if (this.mapWeatherLightningCheck) {
      this.mapWeatherLightningCheck.checked = !!mapData.weatherLightningEnabled;
    }
    if (this.mapWeatherLightningChanceInput) {
      this.mapWeatherLightningChanceInput.value = String(
        mapData.weatherLightningChancePerSec ?? 0.03,
      );
    }
    if (this.mapCombatCheck) this.mapCombatCheck.checked = mapData.combatEnabled ?? false;
    if (this.mapCombatRangeInput) {
      this.mapCombatRangeInput.value = String(
        mapData.combatSettings?.attackRangePx ?? COMBAT_ATTACK_RANGE_PX,
      );
    }
    if (this.mapCombatCooldownInput) {
      this.mapCombatCooldownInput.value = String(
        mapData.combatSettings?.playerAttackCooldownMs ??
          COMBAT_PLAYER_ATTACK_COOLDOWN_MS,
      );
    }
    if (this.mapCombatNpcHitCooldownInput) {
      this.mapCombatNpcHitCooldownInput.value = String(
        mapData.combatSettings?.npcHitCooldownMs ?? COMBAT_NPC_HIT_COOLDOWN_MS,
      );
    }
    if (this.mapCombatVarianceInput) {
      this.mapCombatVarianceInput.value = String(
        mapData.combatSettings?.damageVariancePct ?? COMBAT_DAMAGE_VARIANCE_PCT,
      );
    }
    if (this.mapStatusSelect) this.mapStatusSelect.value = mapData.status ?? "published";
  }

  private async refreshPortalTargetSpawnOptions(targetMapName: string) {
    if (!this.portalTargetSpawnSelect) return;
    let labels: string[] = [];
    const targetMap = this.availableMaps.find((m) => m.name === targetMapName);
    if (targetMap?.labelNames && targetMap.labelNames.length > 0) {
      labels = targetMap.labelNames.filter(Boolean);
    } else if (targetMapName) {
      // Fallback: fetch latest labels from the map doc directly.
      // Some older maps may not have summaries populated as expected.
      try {
        const convex = getConvexClient();
        const map = await convex.query(api.maps.getByName, { name: targetMapName });
        labels = Array.isArray((map as any)?.labels)
          ? (map as any).labels
              .map((l: any) => l?.name)
              .filter((n: unknown): n is string => typeof n === "string" && n.length > 0)
          : [];
      } catch (err) {
        console.warn(`Failed to load labels for map "${targetMapName}":`, err);
      }
    }

    this.portalTargetSpawnSelect.innerHTML = "";
    const options = labels.length > 0 ? labels : ["start1"];
    for (const label of options) {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      this.portalTargetSpawnSelect.appendChild(opt);
    }
    const preferred = options.includes(this.portalDraft.targetSpawn) ? this.portalDraft.targetSpawn : options[0];
    this.portalTargetSpawnSelect.value = preferred;
    this.portalDraft.targetSpawn = preferred;
  }

  private async loadAvailableMaps() {
    try {
      const convex = getConvexClient();
      const maps = await convex.query(api.maps.listSummaries, {});
      this.availableMaps = maps.map((m: any) => ({
        name: m.name,
        labelNames: Array.isArray(m.labelNames) ? m.labelNames : [],
      }));
      if (this.portalTargetMapSelect) {
        this.portalTargetMapSelect.innerHTML = "";
        for (const m of this.availableMaps) {
          const opt = document.createElement("option");
          opt.value = m.name;
          opt.textContent = m.name;
          this.portalTargetMapSelect.appendChild(opt);
        }
        if (this.availableMaps.length > 0) {
          const preferred = this.availableMaps.some((m) => m.name === this.portalDraft.targetMap)
            ? this.portalDraft.targetMap
            : this.availableMaps[0].name;
          this.portalTargetMapSelect.value = preferred;
          this.portalDraft.targetMap = preferred;
          void this.refreshPortalTargetSpawnOptions(preferred);
        } else {
          void this.refreshPortalTargetSpawnOptions("");
        }
      }
    } catch (err) {
      console.warn("Failed to load available maps:", err);
    }
  }

  private async refreshPortalList() {
    if (!this.portalListEl) return;
    const mapData = this.game?.mapRenderer.getMapData();
    let portals = mapData?.portals ?? [];

    console.log(
      `[PortalList] local mapData portals: ${portals.length}, ` +
      `mapData.name="${mapData?.name}", game.currentMapName="${this.game?.currentMapName}", ` +
      `game exists=${!!this.game}, mapData exists=${!!mapData}`,
    );

    // Fallback: if local map cache has no portals, query Convex directly for current map.
    // This handles cases where the client loaded a stale/static map snapshot.
    if (portals.length === 0 && this.game) {
      const candidateNames = Array.from(
        new Set([mapData?.name, this.game.currentMapName].filter((n): n is string => !!n && n.length > 0)),
      );
      console.log(`[PortalList] fallback — querying Convex for maps: ${candidateNames.join(", ")}`);
      for (const name of candidateNames) {
        try {
          const convex = getConvexClient();
          const saved = await convex.query(api.maps.getByName, { name });
          const savedPortals = Array.isArray((saved as any)?.portals) ? (saved as any).portals : [];
          console.log(`[PortalList] Convex "${name}": ${savedPortals.length} portals`, savedPortals);
          if (savedPortals.length > 0) {
            portals = savedPortals;
            if (mapData) {
              mapData.portals = savedPortals as any;
            }
            this.game.currentPortals = savedPortals as any;
            this.game.mapRenderer.renderPortalOverlay();
            break;
          }
        } catch (err) {
          console.warn(`Failed to load portals for "${name}":`, err);
        }
      }
    }

    console.log(`[PortalList] final portal count: ${portals.length}`);

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
      row.style.cursor = "pointer";

      const info = document.createElement("span");
      info.style.flex = "1";
      info.textContent = `🚪 ${p.name} → ${p.targetMap}:${p.targetSpawn} (${p.x},${p.y} ${p.width}x${p.height})`;
      if (this.selectedPortalIndex === i) {
        info.style.color = "#7ee7ff";
      }

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.style.cssText = "background:none;border:none;color:#e74c3c;cursor:pointer;font-size:13px;";
      row.addEventListener("click", () => {
        this.selectPortalForEditing(i);
      });
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (mapData && mapData.portals) {
          mapData.portals.splice(i, 1);
          if (this.selectedPortalIndex === i) this.selectedPortalIndex = null;
          else if (this.selectedPortalIndex != null && this.selectedPortalIndex > i) this.selectedPortalIndex--;
          if (this.game) this.game.currentPortals = mapData.portals;
          void this.refreshPortalList();
          this.game?.mapRenderer.renderPortalOverlay();
        }
      });

      row.append(info, delBtn);
      this.portalListEl.appendChild(row);
    }
  }

  /** Called from the canvas click handler when portal tool is active */
  private handlePortalClick(tileX: number, tileY: number) {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData) return;

    // Priority: click existing portal to edit it.
    if (!this.portalStart) {
      const hitIdx = this.findPortalIndexAtTile(tileX, tileY);
      if (hitIdx >= 0) {
        this.selectPortalForEditing(hitIdx);
        this.portalPlacing = false;
        this.portalStart = null;
        this.game?.mapRenderer.hidePortalGhost();
        return;
      }
    }

    // Validate required fields for creating a new portal.
    if (!this.portalDraft.name || !this.portalDraft.targetMap) {
      this.tileInfoEl.textContent = "⚠ Fill in Name and Target Map first";
      return;
    }

    if (!this.portalStart) {
      // First click = start corner
      this.portalStart = { tx: tileX, ty: tileY };
      this.portalPlacing = true;
      this.selectedPortalIndex = null;
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
      if (!mapData.portals) mapData.portals = [];
      mapData.portals.push(portal);
      // Also update Game's runtime portals
      if (this.game) {
        this.game.currentPortals = mapData.portals;
      }

      this.portalPlacing = false;
      this.portalStart = null;
      this.selectedPortalIndex = mapData.portals.length - 1;
      this.tileInfoEl.textContent = `Portal "${portal.name}" placed at (${x},${y}) ${w}x${h}`;
      void this.refreshPortalList();
      // Update the visual overlay + hide ghost
      this.game?.mapRenderer.renderPortalOverlay();
      this.game?.mapRenderer.hidePortalGhost();
    }
  }

  private findPortalIndexAtTile(tileX: number, tileY: number): number {
    const portals = this.game?.mapRenderer.getMapData()?.portals ?? [];
    return portals.findIndex((p) =>
      tileX >= p.x && tileX < p.x + p.width &&
      tileY >= p.y && tileY < p.y + p.height
    );
  }

  private selectPortalForEditing(index: number) {
    const mapData = this.game?.mapRenderer.getMapData();
    const portal = mapData?.portals?.[index];
    if (!mapData || !portal) return;

    this.selectedPortalIndex = index;
    this.portalDraft.name = portal.name ?? "";
    this.portalDraft.targetMap = portal.targetMap ?? "";
    this.portalDraft.targetSpawn = portal.targetSpawn ?? "start1";
    this.portalDraft.direction = portal.direction ?? "";
    this.portalDraft.transition = portal.transition ?? "fade";

    if (this.portalNameInput) this.portalNameInput.value = this.portalDraft.name;
    if (this.portalTargetMapSelect) this.portalTargetMapSelect.value = this.portalDraft.targetMap;
    void this.refreshPortalTargetSpawnOptions(this.portalDraft.targetMap).then(() => {
      if (this.portalTargetSpawnSelect) {
        this.portalTargetSpawnSelect.value = this.portalDraft.targetSpawn;
      }
    });
    if (this.portalDirectionSelect) this.portalDirectionSelect.value = this.portalDraft.direction;

    this.tileInfoEl.textContent =
      `Editing portal "${portal.name}" (${portal.x},${portal.y} ${portal.width}x${portal.height})`;
    void this.refreshPortalList();
  }

  private applyPortalDraftToSelected() {
    if (this.selectedPortalIndex == null) return;
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData?.portals || this.selectedPortalIndex < 0 || this.selectedPortalIndex >= mapData.portals.length) {
      this.selectedPortalIndex = null;
      return;
    }
    const existing = mapData.portals[this.selectedPortalIndex];
    mapData.portals[this.selectedPortalIndex] = {
      ...existing,
      name: this.portalDraft.name,
      targetMap: this.portalDraft.targetMap,
      targetSpawn: this.portalDraft.targetSpawn || "start1",
      direction: this.portalDraft.direction || undefined,
      transition: this.portalDraft.transition || "fade",
    };
    if (this.game) this.game.currentPortals = mapData.portals;
    this.game?.mapRenderer.renderPortalOverlay();
    void this.refreshPortalList();
  }

  /** Remove the portal at the clicked tile position */
  private removePortalAt(worldX: number, worldY: number) {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData || !mapData.portals) return;

    const tw = mapData.tileWidth;
    const th = mapData.tileHeight;
    const tileX = worldX / tw;
    const tileY = worldY / th;

    // Find the portal whose zone contains the click
    const idx = mapData.portals.findIndex((p) =>
      tileX >= p.x && tileX < p.x + p.width &&
      tileY >= p.y && tileY < p.y + p.height
    );

    if (idx >= 0) {
      const removed = mapData.portals.splice(idx, 1)[0];
      if (this.selectedPortalIndex === idx) this.selectedPortalIndex = null;
      else if (this.selectedPortalIndex != null && this.selectedPortalIndex > idx) this.selectedPortalIndex--;
      // Update Game's runtime portals
      if (this.game) {
        this.game.currentPortals = mapData.portals;
      }
      this.tileInfoEl.textContent = `Deleted portal "${removed.name}"`;
      this.refreshPortalList();
      this.game?.mapRenderer.renderPortalOverlay();
    } else {
      this.tileInfoEl.textContent = "No portal at this location";
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

  /** Remove a label at the clicked tile position */
  private removeLabelAt(worldX: number, worldY: number) {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData || !mapData.labels) return;

    const tileX = Math.floor(worldX / mapData.tileWidth);
    const tileY = Math.floor(worldY / mapData.tileHeight);

    // Find a label whose bounding box contains this tile
    const idx = mapData.labels.findIndex((l) => {
      const lw = (l as any).width ?? 1;
      const lh = (l as any).height ?? 1;
      return tileX >= l.x && tileX < l.x + lw && tileY >= l.y && tileY < l.y + lh;
    });

    if (idx < 0) {
      this.tileInfoEl.textContent = `No label at tile (${tileX},${tileY})`;
      return;
    }

    const removed = mapData.labels.splice(idx, 1)[0];
    this.tileInfoEl.textContent = `Removed label "${removed.name}"`;
    this.refreshLabelList();
    this.game?.mapRenderer.renderLabelOverlay();
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
      const mapName = mapData.name || this.game?.currentMapName || "cozy-cabin";

      // 1) Save map tiles
      const layers = mapData.layers.map((l) => ({
        name: l.name,
        type: l.type as "bg" | "obj" | "overlay",
        tiles: JSON.stringify(l.tiles),
        visible: l.visible,
        tilesetUrl: l.tilesetUrl,
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
      if (mapData.weatherMode != null) saveArgs.weatherMode = mapData.weatherMode;
      if (mapData.weatherIntensity != null) saveArgs.weatherIntensity = mapData.weatherIntensity;
      if (mapData.weatherRainSfx != null) saveArgs.weatherRainSfx = mapData.weatherRainSfx;
      if (mapData.weatherLightningEnabled != null) saveArgs.weatherLightningEnabled = mapData.weatherLightningEnabled;
      if (mapData.weatherLightningChancePerSec != null) saveArgs.weatherLightningChancePerSec = mapData.weatherLightningChancePerSec;
      if (mapData.combatEnabled != null) saveArgs.combatEnabled = mapData.combatEnabled;
      if (mapData.combatSettings != null) saveArgs.combatSettings = mapData.combatSettings;
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
          // Send existingId for objects loaded from Convex so bulkSave patches in place.
          const existingId = this.getPersistedMapObjectId(o);
          if (existingId) obj.existingId = existingId;
          return obj;
        }),
      } as any);

      // 3) Save placed world items
      await convex.mutation(api.worldItems.bulkSave, {
        profileId,
        mapName,
        items: this.placedItems.map((i) => ({
          sourceId: i.sourceId as any,
          itemDefName: i.itemDefName,
          x: i.x,
          y: i.y,
          quantity: i.quantity ?? 1,
          respawn: i.respawn,
          respawnMs: i.respawnMs,
        })),
      });

      // Re-fetch objects and world items so newly placed entries get their
      // Convex _ids. This ensures subsequent saves correctly send existingId
      // for objects, and pickup works for freshly placed items.
      await this.loadPlacedObjects(mapName);
      await this.loadPlacedItems(mapName);

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
        sourceId: o._id,
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
        sourceId: i._id,
        itemDefName: i.itemDefName,
        x: i.x,
        y: i.y,
        quantity: i.quantity ?? 1,
        respawn: i.respawn,
        respawnMs: i.respawnMs,
        pickedUpAt: i.pickedUpAt,
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
      } else if (this.tool === "map") {
        this.syncMapSettingsUI();
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
