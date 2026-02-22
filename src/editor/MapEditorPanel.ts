/**
 * Map editor panel – toolbar (paint/erase/collision/object),
 * layer panel, tileset picker, object picker, and canvas painting.
 */
import { api } from "../../convex/_generated/api";
import type { Game } from "../engine/Game/index.ts";
import type { SpriteDefInfo } from "../engine/ObjectLayer/index.ts";
import { getConvexClient } from "../lib/convexClient.ts";
// TODO: Uncomment this when music is implemented
// import { MUSIC_OPTIONS } from "../config/music-config.ts";
import {
  EDITOR_DELETE_BUTTON,
  EDITOR_ERROR_RED,
  EDITOR_INFO_PANEL_BG,
  EDITOR_INFO_PANEL_BORDER,
  EDITOR_LABEL_HELP_YELLOW,
  EDITOR_MUTED_TEXT,
  EDITOR_PORTAL_GHOST_GREEN,
  EDITOR_SELECTED_PORTAL_HIGHLIGHT,
  EDITOR_SUCCESS_GREEN,
} from "../constants/colors.ts";
import {
  EDITOR_HIT_TEST_ABOVE,
  EDITOR_HIT_TEST_BELOW,
  EDITOR_HIT_TEST_SIDE,
  EDITOR_NPC_FIND_RADIUS,
  EDITOR_PANEL_RESIZE_MAX,
  EDITOR_PANEL_RESIZE_MIN,
} from "../constants/editor.ts";
import {
  EDITOR_CANCEL_MOVE_KEY,
  EDITOR_GRID_TOGGLE_KEY,
  EDITOR_GRID_TOGGLE_KEY_ALT,
} from "../constants/keybindings.ts";
import "./LayerPanel.css";
import "./MapEditor.css";
import {
  buildItemPicker as buildItemPickerImpl,
  inspectItemAt as inspectItemAtImpl,
  logItemPlacement as logItemPlacementImpl,
  placeItem as placeItemImpl,
  removeItemAt as removeItemAtImpl,
  renderItemList as renderItemListImpl,
} from "./MapEditorPanel/buildItemPicker.ts";
import {
  addLayer as addLayerImpl,
  buildLayerPanel as buildLayerPanelImpl,
  getLayerButtonText as getLayerButtonTextImpl,
  makeLayerName as makeLayerNameImpl,
  moveActiveLayer as moveActiveLayerImpl,
  removeActiveLayer as removeActiveLayerImpl,
  renderLayerButtons as renderLayerButtonsImpl,
} from "./MapEditorPanel/buildLayerPanel.ts";
import type { MapPickerContext } from "./MapEditorPanel/buildMapPicker.ts";
import {
  buildMapPicker as buildMapPickerImpl,
  syncMapSettingsUI as syncMapSettingsUIImpl,
} from "./MapEditorPanel/buildMapPicker.ts";
import {
  buildNpcPicker as buildNpcPickerImpl,
  renderNpcList as renderNpcListImpl,
} from "./MapEditorPanel/buildNpcPicker.ts";
import {
  buildObjectPicker as buildObjectPickerImpl,
  renderObjectList as renderObjectListImpl,
} from "./MapEditorPanel/buildObjectPicker.ts";
import type { TilesetPickerContext } from "./MapEditorPanel/buildTilesetPicker.ts";
import {
  applyTileSelection as applyTileSelectionImpl,
  buildTilesetPicker as buildTilesetPickerImpl,
  clearIrregularHighlights as clearIrregularHighlightsImpl,
  getIrregularSelectionTiles as getIrregularSelectionTilesImpl,
  loadTilesetImage as loadTilesetImageImpl,
  onTileCanvasDown as onTileCanvasDownImpl,
  onTileCanvasMove as onTileCanvasMoveImpl,
  onTileCanvasUp as onTileCanvasUpImpl,
  renderTilesetGrid as renderTilesetGridImpl,
  tileCanvasToGrid as tileCanvasToGridImpl,
  updateHighlight as updateHighlightImpl,
  updateIrregularHighlights as updateIrregularHighlightsImpl,
  updateIrregularInfo as updateIrregularInfoImpl,
} from "./MapEditorPanel/buildTilesetPicker.ts";
import {
  DELETE_OPTIONS,
  MAP_DEFAULT_TILESET_VALUE,
  MOVE_OPTIONS,
  TILESETS,
  TOOLS,
} from "./MapEditorPanel/constants.ts";
import {
  createEditorFormRow,
  createEmptyStateInline,
  EDITOR_INPUT_STYLE,
  setupDropdownCloseOnClickOutside,
} from "./MapEditorPanel/helpers.ts";
import type {
  EditorTool,
  ItemDef,
  MapLayerType,
  PlacedItem,
  PlacedObject,
  PortalDraft,
  SpriteDef,
  TilesetInfo,
} from "./MapEditorPanel/types.ts";
import "./TilesetPicker.css";

export type { EditorTool, PlacedObject, TilesetInfo };

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
  private itemDefs: ItemDef[] = [];
  private selectedItemDef: ItemDef | null = null;
  placedItems: PlacedItem[] = [];
  private itemPickerEl!: HTMLElement;
  private itemListEl!: HTMLElement;
  private itemRespawnCheck!: HTMLInputElement;
  private itemRespawnTimeInput!: HTMLInputElement;

  // Portal editor state
  private portalDraft: PortalDraft = {
    name: "",
    targetMap: "",
    targetSpawn: "start1",
    direction: "",
    transition: "fade",
  };
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

  /** Cleanup refs for destroy() */
  private _unbindDeleteDropdown: (() => void) | null = null;
  private _unbindMoveDropdown: (() => void) | null = null;
  private _resizeMouseMove: ((e: MouseEvent) => void) | null = null;
  private _resizeMouseUp: (() => void) | null = null;
  private _hoverRaf = 0;
  private _lastHoverEvent: MouseEvent | null = null;
  private _unbindTilesetMouseUp: (() => void) | null = null;

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
      deleteMenu.style.display =
        deleteMenu.style.display === "none" ? "" : "none";
    });
    this._unbindDeleteDropdown = setupDropdownCloseOnClickOutside(
      deleteWrap,
      deleteMenu,
    );
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
    this._unbindMoveDropdown = setupDropdownCloseOnClickOutside(
      moveWrap,
      moveMenu,
    );
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
      const newH = Math.max(
        EDITOR_PANEL_RESIZE_MIN,
        Math.min(EDITOR_PANEL_RESIZE_MAX, startH + delta),
      );
      panels.style.height = `${newH}px`;
    };
    const onMouseUp = () => {
      if (!resizing) return;
      resizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    this._resizeMouseMove = onMouseMove;
    this._resizeMouseUp = onMouseUp;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    // Left: Layer panel
    panels.appendChild(this.buildLayerPanel());

    // Center: Tileset picker (shown for paint/erase/collision)
    const tilesetResult = this.buildTilesetPicker();
    this.tilesetPickerEl = tilesetResult.el;
    this._unbindTilesetMouseUp = tilesetResult.unbind;
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
  // BUILD: Layer panel (delegates to buildLayerPanel.ts)
  // =========================================================================

  private buildLayerPanel(): HTMLElement {
    return buildLayerPanelImpl(
      this as unknown as Parameters<typeof buildLayerPanelImpl>[0],
    );
  }

  private getLayerButtonText(
    layerIndex: number,
    fallbackName?: string,
  ): string {
    return getLayerButtonTextImpl(
      this as unknown as Parameters<typeof getLayerButtonTextImpl>[0],
      layerIndex,
      fallbackName,
    );
  }

  private refreshLayerButtonLabels() {
    this.renderLayerButtons();
  }

  private renderLayerButtons() {
    renderLayerButtonsImpl(
      this as unknown as Parameters<typeof renderLayerButtonsImpl>[0],
    );
  }

  private makeLayerName(
    type: MapLayerType,
    layers: { name: string; type: MapLayerType }[],
  ): string {
    return makeLayerNameImpl(type, layers);
  }

  private addLayer(type: MapLayerType) {
    addLayerImpl(this as unknown as Parameters<typeof addLayerImpl>[0], type);
  }

  private removeActiveLayer() {
    removeActiveLayerImpl(
      this as unknown as Parameters<typeof removeActiveLayerImpl>[0],
    );
  }

  private moveActiveLayer(delta: -1 | 1) {
    moveActiveLayerImpl(
      this as unknown as Parameters<typeof moveActiveLayerImpl>[0],
      delta,
    );
  }

  // =========================================================================
  // BUILD: Tileset picker (delegates to buildTilesetPicker.ts)
  // =========================================================================

  private buildTilesetPicker() {
    return buildTilesetPickerImpl(this as unknown as TilesetPickerContext);
  }

  // =========================================================================
  // BUILD: Object picker (delegates to buildObjectPicker.ts)
  // =========================================================================

  private buildObjectPicker(): HTMLElement {
    return buildObjectPickerImpl(
      this as unknown as Parameters<typeof buildObjectPickerImpl>[0],
    );
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
    renderObjectListImpl(
      this as unknown as Parameters<typeof renderObjectListImpl>[0],
    );
  }

  // =========================================================================
  // BUILD: NPC picker (delegates to buildNpcPicker.ts)
  // =========================================================================

  private buildNpcPicker(): HTMLElement {
    return buildNpcPickerImpl(
      this as unknown as Parameters<typeof buildNpcPickerImpl>[0],
    );
  }

  private renderNpcList() {
    renderNpcListImpl(
      this as unknown as Parameters<typeof renderNpcListImpl>[0],
    );
  }

  // =========================================================================
  // BUILD: Item picker (delegates to buildItemPicker.ts)
  // =========================================================================

  private buildItemPicker(): HTMLElement {
    return buildItemPickerImpl(
      this as unknown as Parameters<typeof buildItemPickerImpl>[0],
    );
  }

  private async loadItemDefs() {
    try {
      const convex = getConvexClient();
      const [defs, spriteDefs] = await Promise.all([
        convex.query(api.items.list, {}),
        convex.query(api.spriteDefinitions.list, {}),
      ]);

      const spriteDefsByName = new Map(
        (spriteDefs as SpriteDef[]).map((d) => [d.name, d]),
      );
      type ItemDefInput = Pick<
        ItemDef,
        "name" | "displayName" | "type" | "rarity"
      > & { iconSpriteDefName?: string; [key: string]: unknown };
      this.itemDefs = (defs as ItemDefInput[]).map((def): ItemDef => {
        const out: ItemDef = { ...def };
        const spriteDefName = def.iconSpriteDefName;
        if (spriteDefName) {
          const spriteDef = spriteDefsByName.get(spriteDefName);
          if (
            spriteDef &&
            spriteDef.category === "object" &&
            !spriteDef.toggleable &&
            !spriteDef.isDoor
          ) {
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
    renderItemListImpl(
      this as unknown as Parameters<typeof renderItemListImpl>[0],
    );
  }

  private logItemPlacement(message: string, details?: Record<string, unknown>) {
    logItemPlacementImpl(message, details);
  }

  private placeItem(worldX: number, worldY: number) {
    placeItemImpl(
      this as unknown as Parameters<typeof placeItemImpl>[0],
      worldX,
      worldY,
    );
  }

  private removeItemAt(worldX: number, worldY: number) {
    removeItemAtImpl(
      this as unknown as Parameters<typeof removeItemAtImpl>[0],
      worldX,
      worldY,
    );
  }

  /** Show info about an existing world item at the click location */
  private inspectItemAt(worldX: number, worldY: number): boolean {
    return inspectItemAtImpl(
      this as unknown as Parameters<typeof inspectItemAtImpl>[0],
      worldX,
      worldY,
    );
  }

  // =========================================================================
  // Tileset (delegates to buildTilesetPicker.ts)
  // =========================================================================

  private loadTilesetImage(onReady?: () => void) {
    loadTilesetImageImpl(this as unknown as TilesetPickerContext, onReady);
  }

  private renderTilesetGrid() {
    renderTilesetGridImpl(this as unknown as TilesetPickerContext);
  }

  private tileCanvasToGrid(e: MouseEvent) {
    return tileCanvasToGridImpl(this as unknown as TilesetPickerContext, e);
  }

  private onTileCanvasDown(e: MouseEvent) {
    onTileCanvasDownImpl(this as unknown as TilesetPickerContext, e);
  }

  private onTileCanvasMove(e: MouseEvent) {
    onTileCanvasMoveImpl(this as unknown as TilesetPickerContext, e);
  }

  private onTileCanvasUp() {
    onTileCanvasUpImpl(this as unknown as TilesetPickerContext);
  }

  private applyTileSelection(c1: number, r1: number, c2: number, r2: number) {
    applyTileSelectionImpl(
      this as unknown as TilesetPickerContext,
      c1,
      r1,
      c2,
      r2,
    );
  }

  private updateHighlight() {
    updateHighlightImpl(this as unknown as TilesetPickerContext);
  }

  private updateIrregularHighlights() {
    updateIrregularHighlightsImpl(this as unknown as TilesetPickerContext);
  }

  private clearIrregularHighlights() {
    clearIrregularHighlightsImpl(this as unknown as TilesetPickerContext);
  }

  private updateIrregularInfo() {
    updateIrregularInfoImpl(this as unknown as TilesetPickerContext);
  }

  private getIrregularSelectionTiles() {
    return getIrregularSelectionTilesImpl(
      this as unknown as TilesetPickerContext,
    );
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
    return (
      TILESETS.find((t) => t.url === resolvedUrl) ?? this.getMapDefaultTileset()
    );
  }

  /** Assign a tileset to the active layer (null => map default) and re-render. */
  private applyTilesetToActiveLayer(ts: TilesetInfo | null) {
    const mapData = this.game?.mapRenderer.getMapData();
    if (!mapData) return;
    const layer = mapData.layers[this.activeLayer];
    if (!layer) return;

    if (ts) {
      if (
        mapData.tileWidth !== ts.tileWidth ||
        mapData.tileHeight !== ts.tileHeight
      ) {
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
    const isDeleteTool = DELETE_OPTIONS.some((d) => d.key === t);
    const isMoveTool = MOVE_OPTIONS.some((m) => m.key === t);
    TOOLS.forEach((tool, i) => {
      this.toolButtons[i].classList.toggle("active", tool.key === t);
    });
    // Update delete button state
    if (isDeleteTool) {
      this.deleteBtn.classList.add("active");
      const opt = DELETE_OPTIONS.find((d) => d.key === t);
      this.deleteBtn.textContent = `🗑 Del: ${opt?.label ?? ""}`;
    } else {
      this.deleteBtn.classList.remove("active");
      this.deleteBtn.textContent = "🗑 Delete ▾";
    }
    // Update move button state
    if (isMoveTool) {
      this.moveBtn.classList.add("active");
      const opt = MOVE_OPTIONS.find((m) => m.key === t);
      this.moveBtn.textContent = `↔ Move: ${opt?.label ?? ""}`;
    } else {
      this.moveBtn.classList.remove("active");
      this.moveBtn.textContent = "↔ Move ▾";
    }

    // Swap visible picker
    const isObjTool =
      t === "object" || t === "object-erase" || t === "object-move";
    const isNpcTool = t === "npc" || t === "npc-erase" || t === "npc-move";
    const isItemTool = t === "item" || t === "item-erase";
    const isMap = t === "map";
    const isPortal = t === "portal";
    const isLabel = t === "label";
    const hideDefault =
      isObjTool || isNpcTool || isItemTool || isMap || isPortal || isLabel;
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
    this.game?.mapRenderer.setCollisionOverlayVisible(
      t === "collision" || t === "collision-erase",
    );

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
      this.tileInfoEl.textContent =
        "Move Object: click an object to pick it up";
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

    if (
      (this.tool === "object" || this.tool === "npc") &&
      this.selectedSpriteDef
    ) {
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
      this.activeLayer = Math.max(
        0,
        Math.min(this.activeLayer, mapData.layers.length - 1),
      );
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
      const noDrag: EditorTool[] = [
        "object",
        "object-erase",
        "npc",
        "npc-erase",
        "object-move",
        "npc-move",
        "item",
        "item-erase",
        "map",
        "portal",
        "portal-erase",
        "label",
      ];
      if (!noDrag.includes(this.tool)) {
        this.handleCanvasAction(e, game, canvas);
      }
    };

    this.canvasUpHandler = () => {
      this.isPainting = false;
    };

    // Ghost preview: always track cursor in build mode (throttled via RAF)
    this.canvasHoverHandler = (e: MouseEvent) => {
      if (game.mode !== "build") return;
      this._lastHoverEvent = e;
      if (this._hoverRaf) return;
      this._hoverRaf = requestAnimationFrame(() => {
        this._hoverRaf = 0;
        const ev = this._lastHoverEvent;
        if (!ev || !this.game) return;
        const rect = canvas.getBoundingClientRect();
        const screenX = ev.clientX - rect.left;
        const screenY = ev.clientY - rect.top;
        const { x: worldX, y: worldY } = game.camera.screenToWorld(
          screenX,
          screenY,
        );

        if (
          this.tool === "paint" ||
          this.tool === "erase" ||
          this.tool === "collision" ||
          this.tool === "collision-erase"
        ) {
          const mapData = game.mapRenderer.getMapData();
          if (mapData) {
            const tx = Math.floor(worldX / mapData.tileWidth);
            const ty = Math.floor(worldY / mapData.tileHeight);
            if (
              tx >= 0 &&
              ty >= 0 &&
              tx < mapData.width &&
              ty < mapData.height
            ) {
              if (this.tool === "paint") {
                const ts = this.activeTileset;
                const tsCols = Math.floor(ts.imageWidth / ts.tileWidth);
                if (this.isIrregularSelection && this.irregularTiles.size > 0) {
                  const tiles = this.getIrregularSelectionTiles();
                  game.mapRenderer.showIrregularTileGhost(
                    tx,
                    ty,
                    tiles,
                    tsCols,
                    ts.url,
                  );
                } else {
                  game.mapRenderer.showTileGhost(
                    tx,
                    ty,
                    this.selectedRegion,
                    tsCols,
                    ts.url,
                  );
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
              game.mapRenderer.showLabelGhost(
                this.labelStart,
                { tx, ty },
                this.labelDraftName,
              );
            } else {
              game.mapRenderer.showLabelCursor(tx, ty);
            }
          }
        }
      });
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
      if (e.key === EDITOR_CANCEL_MOVE_KEY && this.movingObjectId) {
        this.cancelMoveSelection();
        this.showSaveStatus("Move cancelled", false);
        this.tileInfoEl.textContent =
          this.tool === "npc-move"
            ? "Move NPC: click an NPC to pick it up"
            : "Move Object: click an object to pick it up";
        return;
      }
      if (
        e.key === EDITOR_GRID_TOGGLE_KEY ||
        e.key === EDITOR_GRID_TOGGLE_KEY_ALT
      ) {
        const on = game.mapRenderer.toggleGrid();
        this.gridBtn.classList.toggle("active", on);
        this.renderTilesetGrid();
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  private handleCanvasAction(
    e: MouseEvent,
    game: Game,
    canvas: HTMLCanvasElement,
  ) {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x: worldX, y: worldY } = game.camera.screenToWorld(
      screenX,
      screenY,
    );

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
        this.logItemPlacement("Force placement enabled (Shift held).", {
          worldX,
          worldY,
        });
      }
      // If clicking near an existing item, inspect it; otherwise place.
      const inspectedExisting = forcePlace
        ? false
        : this.inspectItemAt(worldX, worldY);
      if (!inspectedExisting) {
        this.placeItem(worldX, worldY);
      } else {
        this.logItemPlacement(
          "Placement blocked by nearby item (inspect mode).",
          {
            worldX,
            worldY,
          },
        );
        this.showSaveStatus(
          "Blocked by nearby item. Hold Shift + click to force place.",
          true,
        );
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
    if (this.activeLayer < 0 || this.activeLayer >= mapData.layers.length)
      return;

    const tileX = Math.floor(worldX / mapData.tileWidth);
    const tileY = Math.floor(worldY / mapData.tileHeight);

    if (
      tileX < 0 ||
      tileY < 0 ||
      tileX >= mapData.width ||
      tileY >= mapData.height
    )
      return;

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
            if (
              mx >= 0 &&
              my >= 0 &&
              mx < mapData.width &&
              my < mapData.height
            ) {
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
      // Default storage from sprite definition if present, or override from picker
      hasStorage:
        (this as any).placementStorageConfig?.hasStorage ??
        this.selectedSpriteDef.hasStorage,
      storageCapacity:
        (this as any).placementStorageConfig?.storageCapacity ??
        this.selectedSpriteDef.storageCapacity,
      storageOwnerType:
        (this as any).placementStorageConfig?.storageOwnerType ??
        this.selectedSpriteDef.storageOwnerType,
    };

    this.placedObjects.push(obj);
    this.tileInfoEl.textContent = `Placed: ${this.selectedSpriteDef.name} (${this.placedObjects.length} total)`;

    // All objects (including NPCs) render as static previews in the editor.
    // Real server-driven NPCs are created via the npcState subscription after saving.
    this.game?.objectLayer?.addPlacedObject(
      {
        ...obj,
        storageId: obj.storageId,
      },
      this.selectedSpriteDef as SpriteDefInfo,
    );
  }

  private isNpcObject(spriteDefName: string): boolean {
    const def = this.spriteDefs.find((d) => d.name === spriteDefName);
    return def?.category === "npc";
  }

  private restoreMovingObjectRender() {
    if (!this.movingObjectId) return;
    const obj = this.placedObjects.find((o) => o.id === this.movingObjectId);
    if (!obj) return;
    const def = this.spriteDefs.find(
      (d) => d.name === obj.spriteDefName,
    ) as any;
    this.game?.objectLayer?.removePlacedObject(obj.id);
    void this.game?.objectLayer?.addPlacedObject(obj, def);
  }

  private cancelMoveSelection() {
    if (!this.movingObjectId) return;
    this.restoreMovingObjectRender();
    this.movingObjectId = null;
  }

  private findPlacedObjectIndexAt(
    worldX: number,
    worldY: number,
    mode: "object" | "npc",
  ): number {
    // Objects are anchored at bottom-center (0.5, 1.0), so the stored Y is
    // the sprite's feet. Use an asymmetric hit-test to capture body clicks.
    const defByName = new Map(this.spriteDefs.map((d) => [d.name, d]));
    const hitTest = (
      objX: number,
      objY: number,
      spriteDefName: string,
    ): boolean => {
      const def = defByName.get(spriteDefName);
      const hitAbove = def
        ? def.frameHeight * def.scale
        : EDITOR_HIT_TEST_ABOVE;
      const hitSide = def
        ? (def.frameWidth * def.scale) / 2
        : EDITOR_HIT_TEST_SIDE;
      const hitBelow = EDITOR_HIT_TEST_BELOW;
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
        this.showSaveStatus(
          mode === "npc" ? "Click an NPC to move" : "Click an object to move",
          true,
        );
        return;
      }
      const selected = this.placedObjects[idx];
      this.movingObjectId = selected.id;
      this.game?.objectLayer?.removePlacedObject(selected.id);
      if (mode === "npc" && this.game?.entityLayer) {
        const npcHit = this.game.entityLayer.findNearestNPCAt(
          worldX,
          worldY,
          EDITOR_NPC_FIND_RADIUS,
        );
        if (npcHit) this.game.entityLayer.removeNPC(npcHit.id);
      }
      this.tileInfoEl.textContent = `Picked ${selected.spriteDefName}. Click destination to place.`;
      return;
    }

    const idx = this.placedObjects.findIndex(
      (o) => o.id === this.movingObjectId,
    );
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

    const def = this.spriteDefs.find(
      (d) => d.name === obj.spriteDefName,
    ) as any;
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
      const npcHit = this.game.entityLayer.findNearestNPCAt(
        worldX,
        worldY,
        EDITOR_NPC_FIND_RADIUS,
      );
      if (npcHit) this.game.entityLayer.removeNPC(npcHit.id);
      this.tileInfoEl.textContent = `Removed NPC (${this.placedObjects.length} total)`;
      return;
    }

    this.tileInfoEl.textContent = `Removed object (${this.placedObjects.length} total)`;
  }

  // =========================================================================
  // Save all (map + objects)
  // =========================================================================

  // =========================================================================
  // BUILD: Map picker (delegates to buildMapPicker.ts)
  // =========================================================================

  private buildMapPicker(): HTMLElement {
    return buildMapPickerImpl(this as unknown as MapPickerContext);
  }

  private syncMapSettingsUI() {
    syncMapSettingsUIImpl(this as unknown as MapPickerContext);
  }

  // =========================================================================
  // Portal editor
  // =========================================================================

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
    form.style.cssText =
      "padding:8px;display:flex;flex-direction:column;gap:6px;font-size:12px;";

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
    mapSelect.style.cssText = EDITOR_INPUT_STYLE;
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
    spawnSelect.style.cssText = EDITOR_INPUT_STYLE;
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
    dirSelect.style.cssText = EDITOR_INPUT_STYLE;
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
    helpText.style.cssText = `margin-top:6px;padding:6px 8px;background:${EDITOR_INFO_PANEL_BG};border:1px solid ${EDITOR_INFO_PANEL_BORDER};border-radius:4px;font-size:11px;color:${EDITOR_MUTED_TEXT};line-height:1.4;`;
    helpText.innerHTML = `Fill in the fields above, then <b style='color:${EDITOR_PORTAL_GHOST_GREEN}'>click on the map</b> to set the start corner, and click again for the end corner. A green ghost will preview the area.`;

    form.append(nameRow, mapRow, spawnRow, dirRow, helpText);
    picker.appendChild(form);

    // --- Existing portals list ---
    const listHeader = document.createElement("div");
    listHeader.style.cssText = `padding:8px;font-size:13px;font-weight:600;border-top:1px solid ${EDITOR_INFO_PANEL_BORDER};`;
    listHeader.textContent = "Existing Portals";
    picker.appendChild(listHeader);

    this.portalListEl = document.createElement("div");
    this.portalListEl.style.cssText =
      "padding:0 8px 8px;max-height:200px;overflow-y:auto;";
    picker.appendChild(this.portalListEl);

    return picker;
  }

  private portalFormRow(
    labelText: string,
    inputType: string,
    placeholder: string,
    onChange: (v: string) => void,
  ): HTMLElement {
    return createEditorFormRow(labelText, {
      inputType,
      inputPlaceholder: placeholder,
      inputValue: placeholder,
      onChange,
      assignRef:
        labelText === "Name:"
          ? (el) => {
              this.portalNameInput = el as HTMLInputElement;
            }
          : undefined,
    });
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
        const map = await convex.query(api.maps.queries.getByName, {
          name: targetMapName,
        });
        labels = Array.isArray((map as any)?.labels)
          ? (map as any).labels
              .map((l: any) => l?.name)
              .filter(
                (n: unknown): n is string =>
                  typeof n === "string" && n.length > 0,
              )
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
    const preferred = options.includes(this.portalDraft.targetSpawn)
      ? this.portalDraft.targetSpawn
      : options[0];
    this.portalTargetSpawnSelect.value = preferred;
    this.portalDraft.targetSpawn = preferred;
  }

  private async loadAvailableMaps() {
    try {
      const convex = getConvexClient();
      const maps = await convex.query(api.maps.queries.listSummaries, {});
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
          const preferred = this.availableMaps.some(
            (m) => m.name === this.portalDraft.targetMap,
          )
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
        new Set(
          [mapData?.name, this.game.currentMapName].filter(
            (n): n is string => !!n && n.length > 0,
          ),
        ),
      );
      console.log(
        `[PortalList] fallback — querying Convex for maps: ${candidateNames.join(", ")}`,
      );
      for (const name of candidateNames) {
        try {
          const convex = getConvexClient();
          const saved = await convex.query(api.maps.queries.getByName, {
            name,
          });
          const savedPortals = Array.isArray((saved as any)?.portals)
            ? (saved as any).portals
            : [];
          console.log(
            `[PortalList] Convex "${name}": ${savedPortals.length} portals`,
            savedPortals,
          );
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
      this.portalListEl.innerHTML = createEmptyStateInline("No portals yet");
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
        info.style.color = EDITOR_SELECTED_PORTAL_HIGHLIGHT;
      }

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.style.cssText = `background:none;border:none;color:${EDITOR_DELETE_BUTTON};cursor:pointer;font-size:13px;`;
      row.addEventListener("click", () => {
        this.selectPortalForEditing(i);
      });
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (mapData && mapData.portals) {
          mapData.portals.splice(i, 1);
          if (this.selectedPortalIndex === i) this.selectedPortalIndex = null;
          else if (
            this.selectedPortalIndex != null &&
            this.selectedPortalIndex > i
          )
            this.selectedPortalIndex--;
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
    return portals.findIndex(
      (p) =>
        tileX >= p.x &&
        tileX < p.x + p.width &&
        tileY >= p.y &&
        tileY < p.y + p.height,
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

    if (this.portalNameInput)
      this.portalNameInput.value = this.portalDraft.name;
    if (this.portalTargetMapSelect)
      this.portalTargetMapSelect.value = this.portalDraft.targetMap;
    void this.refreshPortalTargetSpawnOptions(this.portalDraft.targetMap).then(
      () => {
        if (this.portalTargetSpawnSelect) {
          this.portalTargetSpawnSelect.value = this.portalDraft.targetSpawn;
        }
      },
    );
    if (this.portalDirectionSelect)
      this.portalDirectionSelect.value = this.portalDraft.direction;

    this.tileInfoEl.textContent = `Editing portal "${portal.name}" (${portal.x},${portal.y} ${portal.width}x${portal.height})`;
    void this.refreshPortalList();
  }

  private applyPortalDraftToSelected() {
    if (this.selectedPortalIndex == null) return;
    const mapData = this.game?.mapRenderer.getMapData();
    if (
      !mapData?.portals ||
      this.selectedPortalIndex < 0 ||
      this.selectedPortalIndex >= mapData.portals.length
    ) {
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
    const idx = mapData.portals.findIndex(
      (p) =>
        tileX >= p.x &&
        tileX < p.x + p.width &&
        tileY >= p.y &&
        tileY < p.y + p.height,
    );

    if (idx >= 0) {
      const removed = mapData.portals.splice(idx, 1)[0];
      if (this.selectedPortalIndex === idx) this.selectedPortalIndex = null;
      else if (
        this.selectedPortalIndex != null &&
        this.selectedPortalIndex > idx
      )
        this.selectedPortalIndex--;
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
    form.style.cssText =
      "padding:8px;display:flex;flex-direction:column;gap:6px;";

    // Name input
    const nameRow = document.createElement("div");
    nameRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    const nameLbl = document.createElement("span");
    nameLbl.textContent = "Name:";
    nameLbl.style.minWidth = "50px";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "start1, shop-door, npc-guard...";
    nameInput.style.cssText = EDITOR_INPUT_STYLE;
    nameInput.addEventListener("input", () => {
      this.labelDraftName = nameInput.value.trim();
    });
    nameRow.append(nameLbl, nameInput);

    // Help text
    const helpText = document.createElement("div");
    helpText.style.cssText = `padding:6px 8px;background:${EDITOR_INFO_PANEL_BG};border:1px solid ${EDITOR_INFO_PANEL_BORDER};border-radius:4px;font-size:11px;color:${EDITOR_MUTED_TEXT};line-height:1.4;`;
    helpText.innerHTML = `Enter a name, then <b style="color:${EDITOR_LABEL_HELP_YELLOW}">click on the map</b> for a single-tile label, or click twice to define a rectangular zone. Labels are used as portal spawn targets (e.g. <code>start1</code>).`;

    form.append(nameRow, helpText);
    picker.appendChild(form);

    // --- Existing labels list ---
    const listHeader = document.createElement("div");
    listHeader.style.cssText = `padding:8px;font-size:13px;font-weight:600;border-top:1px solid ${EDITOR_INFO_PANEL_BORDER};`;
    listHeader.textContent = "Existing Labels";
    picker.appendChild(listHeader);

    this.labelListEl = document.createElement("div");
    this.labelListEl.style.cssText =
      "padding:0 8px 8px;max-height:300px;overflow-y:auto;";
    picker.appendChild(this.labelListEl);

    return picker;
  }

  private refreshLabelList() {
    if (!this.labelListEl) return;
    const mapData = this.game?.mapRenderer.getMapData();
    const labels = mapData?.labels ?? [];

    if (labels.length === 0) {
      this.labelListEl.innerHTML = createEmptyStateInline("No labels yet");
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
      const sizeStr =
        l.width > 1 || l.height > 1 ? ` ${l.width}x${l.height}` : "";
      info.textContent = `🏷 ${l.name} (${l.x},${l.y}${sizeStr})`;

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.style.cssText = `background:none;border:none;color:${EDITOR_DELETE_BUTTON};cursor:pointer;font-size:13px;`;
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
        const existingIdx = mapData.labels.findIndex(
          (l) => l.name === this.labelDraftName,
        );
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
      return (
        tileX >= l.x && tileX < l.x + lw && tileY >= l.y && tileY < l.y + lh
      );
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
        type: l.type as MapLayerType,
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
      if (mapData.animationUrl != null)
        saveArgs.animationUrl = mapData.animationUrl;
      if (mapData.musicUrl != null) saveArgs.musicUrl = mapData.musicUrl;
      if (mapData.weatherMode != null)
        saveArgs.weatherMode = mapData.weatherMode;
      if (mapData.weatherIntensity != null)
        saveArgs.weatherIntensity = mapData.weatherIntensity;
      if (mapData.weatherRainSfx != null)
        saveArgs.weatherRainSfx = mapData.weatherRainSfx;
      if (mapData.weatherLightningEnabled != null)
        saveArgs.weatherLightningEnabled = mapData.weatherLightningEnabled;
      if (mapData.weatherLightningChancePerSec != null)
        saveArgs.weatherLightningChancePerSec =
          mapData.weatherLightningChancePerSec;
      if (mapData.combatEnabled != null)
        saveArgs.combatEnabled = mapData.combatEnabled;
      if (mapData.combatSettings != null)
        saveArgs.combatSettings = mapData.combatSettings;
      if (mapData.status != null) saveArgs.status = mapData.status;

      await convex.mutation(api.maps.mutations.saveFullMap, saveArgs as any);

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
          if (existingId) {
            obj.existingId = existingId;
            // For existing objects, preserve the storageId and send current storage config
            // so bulkSave can handle adding/removing storage if changed in editor.
            if (o.storageId) obj.storageId = o.storageId;
            obj.hasStorage = o.hasStorage;
            obj.storageCapacity = o.storageCapacity;
            obj.storageOwnerType = o.storageOwnerType;
          } else {
            // For new objects, send storage configuration if present
            if (o.hasStorage) {
              obj.hasStorage = true;
              obj.storageCapacity = o.storageCapacity;
              obj.storageOwnerType = o.storageOwnerType;
            }
          }
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
        storageId: o.storageId,
        hasStorage: !!o.storageId,
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
    this.saveStatusEl.style.color = isError
      ? EDITOR_ERROR_RED
      : EDITOR_SUCCESS_GREEN;
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
      if (
        this.tool === "object" ||
        this.tool === "object-erase" ||
        this.tool === "npc" ||
        this.tool === "npc-erase"
      ) {
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

  show() {
    this.el.style.display = "";
  }
  hide() {
    this.el.style.display = "none";
  }

  destroy() {
    if (this._hoverRaf) {
      cancelAnimationFrame(this._hoverRaf);
      this._hoverRaf = 0;
    }
    this._unbindTilesetMouseUp?.();
    this._unbindTilesetMouseUp = null;
    this._unbindDeleteDropdown?.();
    this._unbindDeleteDropdown = null;
    this._unbindMoveDropdown?.();
    this._unbindMoveDropdown = null;
    if (this._resizeMouseMove) {
      document.removeEventListener("mousemove", this._resizeMouseMove);
      this._resizeMouseMove = null;
    }
    if (this._resizeMouseUp) {
      document.removeEventListener("mouseup", this._resizeMouseUp);
      this._resizeMouseUp = null;
    }
    if (this.canvasUpHandler) {
      window.removeEventListener("mouseup", this.canvasUpHandler);
      this.canvasUpHandler = null;
    }
    if (this.keyHandler) {
      window.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
    const canvas = this.game?.app?.canvas as HTMLCanvasElement | undefined;
    if (canvas && this.canvasClickHandler) {
      canvas.removeEventListener("mousedown", this.canvasClickHandler);
      this.canvasClickHandler = null;
    }
    if (canvas && this.canvasMoveHandler) {
      canvas.removeEventListener("mousemove", this.canvasMoveHandler);
      this.canvasMoveHandler = null;
    }
    if (canvas && this.canvasHoverHandler) {
      canvas.removeEventListener("mousemove", this.canvasHoverHandler);
      this.canvasHoverHandler = null;
    }
    this.game?.objectLayer?.hideGhost();
    this.el.remove();
  }
}
