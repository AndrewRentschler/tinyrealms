/**
 * Tileset picker builder and tile selection logic.
 */
import { EDITOR_TILESET_GRID_STROKE } from "../../constants/colors.ts";
import type { TilesetInfo } from "./types.ts";
import {
  TILESETS,
  MAP_DEFAULT_TILESET_VALUE,
  DISPLAY_TILE_SIZE,
} from "./constants.ts";

export interface TilesetPickerContext {
  game: { mapRenderer: { getMapData(): { tileWidth?: number; tileHeight?: number; layers: { tilesetUrl?: string }[]; tilesetUrl?: string } | null; loadMap(d: unknown): void; isGridVisible(): boolean } } | null;
  activeTileset: TilesetInfo;
  selectedTile: number;
  selectedRegion: { col: number; row: number; w: number; h: number };
  tsDragStart: { col: number; row: number } | null;
  irregularTiles: Set<string>;
  isIrregularSelection: boolean;
  irregularHighlights: HTMLDivElement[];
  tileCanvas: HTMLCanvasElement;
  tileCtx: CanvasRenderingContext2D;
  tilesetImage: HTMLImageElement | null;
  highlightEl: HTMLDivElement;
  tileInfoEl: HTMLDivElement;
  tileSizeLabel: HTMLDivElement;
  tilesetSelect: HTMLSelectElement;
  showSaveStatus(text: string, isError?: boolean): void;
  syncTilesetToMapLayer(): void;
  updateTileSizeLabel(): void;
  updateMapDimsLabel(): void;
  refreshLayerButtonLabels(): void;
  loadTilesetImage(onReady?: () => void): void;
  renderTilesetGrid(): void;
  updateHighlight(): void;
  updateIrregularHighlights(): void;
  clearIrregularHighlights(): void;
  updateIrregularInfo(): void;
  getIrregularSelectionTiles(): { dx: number; dy: number; tileIdx: number }[];
  getTilesetForActiveLayer(): TilesetInfo;
  getMapDefaultTileset(): TilesetInfo;
  applyTilesetToActiveLayer(ts: TilesetInfo | null): void;
}

export interface BuildTilesetPickerResult {
  el: HTMLElement;
  unbind: () => void;
}

export function buildTilesetPicker(ctx: TilesetPickerContext): BuildTilesetPickerResult {
  const picker = document.createElement("div");
  picker.className = "tileset-picker";

  const header = document.createElement("div");
  header.className = "tileset-picker-header";

  const label = document.createElement("div");
  label.className = "tileset-picker-label";
  label.textContent = "Tileset";
  header.appendChild(label);

  const tileSizeLabel = document.createElement("div");
  tileSizeLabel.style.cssText =
    "font-size:10px;color:var(--text-muted);margin-left:auto;font-family:monospace;";
  (ctx as { tileSizeLabel: HTMLDivElement }).tileSizeLabel = tileSizeLabel;
  ctx.updateTileSizeLabel();
  header.appendChild(tileSizeLabel);

  const tilesetSelect = document.createElement("select");
  tilesetSelect.className = "tileset-select";
  const mapDefaultOpt = document.createElement("option");
  mapDefaultOpt.value = MAP_DEFAULT_TILESET_VALUE;
  mapDefaultOpt.textContent = "(Map default)";
  tilesetSelect.appendChild(mapDefaultOpt);
  for (const ts of TILESETS) {
    const opt = document.createElement("option");
    opt.value = ts.url;
    opt.textContent = `${ts.name} (${ts.tileWidth}px)`;
    tilesetSelect.appendChild(opt);
  }
  tilesetSelect.addEventListener("change", () => {
    const selectedValue = tilesetSelect.value;
    if (selectedValue === MAP_DEFAULT_TILESET_VALUE) {
      ctx.applyTilesetToActiveLayer(null);
      const layerTs = ctx.getTilesetForActiveLayer();
      (ctx as { activeTileset: TilesetInfo }).activeTileset = layerTs;
      (ctx as { selectedTile: number }).selectedTile = 0;
      (ctx as { selectedRegion: { col: number; row: number; w: number; h: number } }).selectedRegion = { col: 0, row: 0, w: 1, h: 1 };
      ctx.loadTilesetImage();
      return;
    }
    const ts = TILESETS.find((t) => t.url === selectedValue);
    if (ts) {
      ctx.applyTilesetToActiveLayer(ts);
    }
  });
  (ctx as { tilesetSelect: HTMLSelectElement }).tilesetSelect = tilesetSelect;
  header.appendChild(tilesetSelect);
  picker.appendChild(header);

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "tileset-canvas-wrap";

  const tileCanvas = document.createElement("canvas");
  tileCanvas.className = "tileset-canvas";
  const tileCtx = tileCanvas.getContext("2d")!;
  tileCtx.imageSmoothingEnabled = false;
  (ctx as { tileCanvas: HTMLCanvasElement }).tileCanvas = tileCanvas;
  (ctx as { tileCtx: CanvasRenderingContext2D }).tileCtx = tileCtx;

  const highlightEl = document.createElement("div");
  highlightEl.className = "tileset-highlight";
  (ctx as { highlightEl: HTMLDivElement }).highlightEl = highlightEl;

  tileCanvas.addEventListener("mousedown", (e) => onTileCanvasDown(ctx, e));
  tileCanvas.addEventListener("mousemove", (e) => onTileCanvasMove(ctx, e));
  const mouseUpHandler = () => onTileCanvasUp(ctx);
  window.addEventListener("mouseup", mouseUpHandler);

  canvasWrap.appendChild(tileCanvas);
  canvasWrap.appendChild(highlightEl);
  picker.appendChild(canvasWrap);

  ctx.loadTilesetImage();

  return {
    el: picker,
    unbind: () => window.removeEventListener("mouseup", mouseUpHandler),
  };
}

export function loadTilesetImage(
  ctx: TilesetPickerContext,
  onReady?: () => void,
): void {
  const ts = ctx.activeTileset;
  const img = new Image();
  img.src = ts.url;
  img.onload = () => {
    (ctx as { tilesetImage: HTMLImageElement | null }).tilesetImage = img;
    const realW = Math.floor(img.naturalWidth / ts.tileWidth) * ts.tileWidth;
    const realH =
      Math.floor(img.naturalHeight / ts.tileHeight) * ts.tileHeight;
    if (realW !== ts.imageWidth || realH !== ts.imageHeight) {
      console.log(
        `Tileset "${ts.name}": correcting dimensions ${ts.imageWidth}×${ts.imageHeight}` +
          ` → ${realW}×${realH} (from ${img.naturalWidth}×${img.naturalHeight})`,
      );
      (ts as { imageWidth: number }).imageWidth = realW;
      (ts as { imageHeight: number }).imageHeight = realH;
    }
    ctx.renderTilesetGrid();
    ctx.updateHighlight();
    onReady?.();
  };
  img.onerror = () => {
    console.warn("Failed to load tileset:", ts.url);
  };
}

export function renderTilesetGrid(ctx: TilesetPickerContext): void {
  if (!ctx.tilesetImage) return;
  const ts = ctx.activeTileset;
  const cols = Math.floor(ts.imageWidth / ts.tileWidth);
  const rows = Math.floor(ts.imageHeight / ts.tileHeight);

  const canvasW = cols * DISPLAY_TILE_SIZE;
  const canvasH = rows * DISPLAY_TILE_SIZE;

  ctx.tileCanvas.width = canvasW;
  ctx.tileCanvas.height = canvasH;
  ctx.tileCanvas.style.width = canvasW + "px";
  ctx.tileCanvas.style.height = canvasH + "px";

  const context = ctx.tileCtx;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvasW, canvasH);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      context.drawImage(
        ctx.tilesetImage,
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

  const showGrid = ctx.game?.mapRenderer.isGridVisible() ?? false;
  if (showGrid) {
    context.strokeStyle = EDITOR_TILESET_GRID_STROKE;
    context.lineWidth = 1;
    context.beginPath();
    for (let c = 0; c <= cols; c++) {
      context.moveTo(c * DISPLAY_TILE_SIZE + 0.5, 0);
      context.lineTo(c * DISPLAY_TILE_SIZE + 0.5, canvasH);
    }
    for (let r = 0; r <= rows; r++) {
      context.moveTo(0, r * DISPLAY_TILE_SIZE + 0.5);
      context.lineTo(canvasW, r * DISPLAY_TILE_SIZE + 0.5);
    }
    context.stroke();
  }
}

export function tileCanvasToGrid(
  ctx: TilesetPickerContext,
  e: MouseEvent,
): { col: number; row: number } {
  const ts = ctx.activeTileset;
  const cols = Math.floor(ts.imageWidth / ts.tileWidth);
  const rows = Math.floor(ts.imageHeight / ts.tileHeight);
  const rect = ctx.tileCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  return {
    col: Math.max(0, Math.min(cols - 1, Math.floor(x / DISPLAY_TILE_SIZE))),
    row: Math.max(0, Math.min(rows - 1, Math.floor(y / DISPLAY_TILE_SIZE))),
  };
}

export function onTileCanvasDown(ctx: TilesetPickerContext, e: MouseEvent): void {
  const { col, row } = tileCanvasToGrid(ctx, e);
  if (e.shiftKey) {
    (ctx as { isIrregularSelection: boolean }).isIrregularSelection = true;
    const key = `${col},${row}`;
    if (ctx.irregularTiles.has(key)) {
      ctx.irregularTiles.delete(key);
    } else {
      ctx.irregularTiles.add(key);
    }
    (ctx as { tsDragStart: { col: number; row: number } | null }).tsDragStart = {
      col,
      row,
    };
    ctx.updateIrregularHighlights();
    ctx.updateIrregularInfo();
  } else {
    (ctx as { isIrregularSelection: boolean }).isIrregularSelection = false;
    ctx.irregularTiles.clear();
    ctx.clearIrregularHighlights();
    (ctx as { tsDragStart: { col: number; row: number } | null }).tsDragStart = {
      col,
      row,
    };
    applyTileSelection(ctx, col, row, col, row);
  }
}

export function onTileCanvasMove(ctx: TilesetPickerContext, e: MouseEvent): void {
  if (!ctx.tsDragStart) return;
  const { col, row } = tileCanvasToGrid(ctx, e);
  if (e.shiftKey && ctx.isIrregularSelection) {
    const minC = Math.min(ctx.tsDragStart.col, col);
    const maxC = Math.max(ctx.tsDragStart.col, col);
    const minR = Math.min(ctx.tsDragStart.row, row);
    const maxR = Math.max(ctx.tsDragStart.row, row);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        ctx.irregularTiles.add(`${c},${r}`);
      }
    }
    ctx.updateIrregularHighlights();
    ctx.updateIrregularInfo();
  } else if (!ctx.isIrregularSelection) {
    applyTileSelection(
      ctx,
      ctx.tsDragStart.col,
      ctx.tsDragStart.row,
      col,
      row,
    );
  }
}

export function onTileCanvasUp(ctx: TilesetPickerContext): void {
  (ctx as { tsDragStart: { col: number; row: number } | null }).tsDragStart =
    null;
}

export function applyTileSelection(
  ctx: TilesetPickerContext,
  c1: number,
  r1: number,
  c2: number,
  r2: number,
): void {
  const ts = ctx.activeTileset;
  const cols = Math.floor(ts.imageWidth / ts.tileWidth);

  const minC = Math.min(c1, c2);
  const minR = Math.min(r1, r2);
  const maxC = Math.max(c1, c2);
  const maxR = Math.max(r1, r2);

  const selectedRegion = {
    col: minC,
    row: minR,
    w: maxC - minC + 1,
    h: maxR - minR + 1,
  };
  (ctx as { selectedRegion: { col: number; row: number; w: number; h: number } })
    .selectedRegion = selectedRegion;
  (ctx as { selectedTile: number }).selectedTile = minR * cols + minC;

  const regionSize = selectedRegion.w * selectedRegion.h;
  ctx.tileInfoEl.textContent =
    regionSize > 1
      ? `Tile: ${ctx.selectedTile} (${selectedRegion.w}×${selectedRegion.h})`
      : `Tile: ${ctx.selectedTile}`;

  ctx.updateHighlight();
}

export function updateHighlight(ctx: TilesetPickerContext): void {
  const r = ctx.selectedRegion;
  ctx.highlightEl.style.left = r.col * DISPLAY_TILE_SIZE + "px";
  ctx.highlightEl.style.top = r.row * DISPLAY_TILE_SIZE + "px";
  ctx.highlightEl.style.width = r.w * DISPLAY_TILE_SIZE + "px";
  ctx.highlightEl.style.height = r.h * DISPLAY_TILE_SIZE + "px";
}

export function updateIrregularHighlights(ctx: TilesetPickerContext): void {
  ctx.highlightEl.style.display = ctx.isIrregularSelection ? "none" : "";
  ctx.clearIrregularHighlights();
  if (!ctx.isIrregularSelection) return;

  const parent = ctx.highlightEl.parentElement;
  if (!parent) return;

  for (const key of ctx.irregularTiles) {
    const [c, r] = key.split(",").map(Number);
    const el = document.createElement("div");
    el.className = "tileset-highlight";
    el.style.left = c * DISPLAY_TILE_SIZE + "px";
    el.style.top = r * DISPLAY_TILE_SIZE + "px";
    el.style.width = DISPLAY_TILE_SIZE + "px";
    el.style.height = DISPLAY_TILE_SIZE + "px";
    parent.appendChild(el);
    ctx.irregularHighlights.push(el);
  }
}

export function clearIrregularHighlights(ctx: TilesetPickerContext): void {
  for (const el of ctx.irregularHighlights) el.remove();
  ctx.irregularHighlights.length = 0;
}

export function updateIrregularInfo(ctx: TilesetPickerContext): void {
  if (ctx.irregularTiles.size === 0) {
    ctx.tileInfoEl.textContent = "No tiles selected";
  } else {
    ctx.tileInfoEl.textContent = `Selected: ${ctx.irregularTiles.size} tiles (Shift+click)`;
  }
}

export function getIrregularSelectionTiles(
  ctx: TilesetPickerContext,
): { dx: number; dy: number; tileIdx: number }[] {
  if (ctx.irregularTiles.size === 0) return [];
  const ts = ctx.activeTileset;
  const tsCols = Math.floor(ts.imageWidth / ts.tileWidth);

  const positions = [...ctx.irregularTiles].map((k) => {
    const [c, r] = k.split(",").map(Number);
    return { col: c, row: r };
  });

  const minCol = Math.min(...positions.map((p) => p.col));
  const minRow = Math.min(...positions.map((p) => p.row));

  return positions.map((p) => ({
    dx: p.col - minCol,
    dy: p.row - minRow,
    tileIdx: p.row * tsCols + p.col,
  }));
}
