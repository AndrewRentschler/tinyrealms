/**
 * Layer panel builder and layer management helpers.
 */
import type { MapLayerType } from "../../types/index.ts";
import type { LayerPanelContext } from "./types.ts";
import { TILESETS } from "./constants.ts";

export function buildLayerPanel(ctx: LayerPanelContext & { addLayer(type: MapLayerType): void; removeActiveLayer(): void; moveActiveLayer(delta: -1 | 1): void; renderLayerButtons(): void }): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "layer-panel";

  const label = document.createElement("div");
  label.className = "layer-panel-label";
  label.textContent = "Layers";
  panel.appendChild(label);

  const layerListEl = document.createElement("div");
  layerListEl.className = "layer-list";
  panel.appendChild(layerListEl);
  (ctx as { layerListEl: HTMLElement }).layerListEl = layerListEl;

  const controls = document.createElement("div");
  controls.className = "layer-controls";

  const addBgBtn = document.createElement("button");
  addBgBtn.className = "layer-ctrl-btn";
  addBgBtn.textContent = "+BG";
  addBgBtn.title = "Add background layer";
  addBgBtn.addEventListener("click", () => ctx.addLayer("bg"));

  const addObjBtn = document.createElement("button");
  addObjBtn.className = "layer-ctrl-btn";
  addObjBtn.textContent = "+OBJ";
  addObjBtn.title = "Add object layer";
  addObjBtn.addEventListener("click", () => ctx.addLayer("obj"));

  const addOverlayBtn = document.createElement("button");
  addOverlayBtn.className = "layer-ctrl-btn";
  addOverlayBtn.textContent = "+OVR";
  addOverlayBtn.title = "Add overlay layer";
  addOverlayBtn.addEventListener("click", () => ctx.addLayer("overlay"));

  controls.append(addBgBtn, addObjBtn, addOverlayBtn);
  panel.appendChild(controls);

  const orderControls = document.createElement("div");
  orderControls.className = "layer-controls";

  const upBtn = document.createElement("button");
  upBtn.className = "layer-ctrl-btn";
  upBtn.textContent = "↑";
  upBtn.title = "Move active layer up";
  upBtn.addEventListener("click", () => ctx.moveActiveLayer(-1));

  const downBtn = document.createElement("button");
  downBtn.className = "layer-ctrl-btn";
  downBtn.textContent = "↓";
  downBtn.title = "Move active layer down";
  downBtn.addEventListener("click", () => ctx.moveActiveLayer(1));

  const delBtn = document.createElement("button");
  delBtn.className = "layer-ctrl-btn";
  delBtn.textContent = "Del";
  delBtn.title = "Delete active layer";
  delBtn.addEventListener("click", () => ctx.removeActiveLayer());

  orderControls.append(upBtn, downBtn, delBtn);
  panel.appendChild(orderControls);

  ctx.renderLayerButtons();

  return panel;
}

export function getLayerButtonText(
  ctx: LayerPanelContext,
  layerIndex: number,
  fallbackName?: string,
): string {
  const mapData = ctx.game?.mapRenderer.getMapData();
  const layer = mapData?.layers[layerIndex];
  const layerName = layer?.name ?? fallbackName ?? `layer${layerIndex}`;
  const layerTilesetUrl = layer?.tilesetUrl ?? mapData?.tilesetUrl;
  if (!layerTilesetUrl) return layerName;
  const ts = TILESETS.find((t) => t.url === layerTilesetUrl);
  const tsName =
    ts?.name ??
    layerTilesetUrl
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "") ??
    "tileset";
  return `${layerName} · ${tsName}`;
}

export function renderLayerButtons(ctx: LayerPanelContext & { layerButtons: HTMLButtonElement[] }): void {
  if (!ctx.layerListEl) return;
  const mapData = ctx.game?.mapRenderer.getMapData();
  if (!mapData) return;

  ctx.layerListEl.innerHTML = "";
  ctx.layerButtons.length = 0;
  mapData.layers.forEach((layer, i) => {
    const btn = document.createElement("button");
    btn.className = `layer-btn ${ctx.activeLayer === i ? "active" : ""}`;
    btn.textContent = getLayerButtonText(ctx, i, layer.name);
    btn.title = btn.textContent;
    btn.addEventListener("click", () => ctx.setLayer(i));
    ctx.layerListEl.appendChild(btn);
    ctx.layerButtons.push(btn);
  });
}

export function makeLayerName(
  type: MapLayerType,
  layers: { name: string; type: MapLayerType }[],
): string {
  const count = layers.filter((l) => l.type === type).length;
  return `${type}${count}`;
}

export function addLayer(
  ctx: LayerPanelContext & {
    game: { mapRenderer: { getMapData(): { layers: { name: string; type: MapLayerType }[]; width: number; height: number } | null; loadMap(d: unknown): void } } | null;
    activeLayer: number;
  },
  type: MapLayerType,
): void {
  const mapData = ctx.game?.mapRenderer.getMapData();
  if (!mapData || !ctx.game) return;
  const layers = mapData.layers as { name: string; type: MapLayerType }[];
  const layerName = ctx.makeLayerName(type, layers);
  const w = mapData.width ?? 0;
  const h = mapData.height ?? 0;
  (mapData.layers as unknown[]).push({
    name: layerName,
    type,
    tiles: new Array(w * h).fill(-1),
    visible: true,
  });
  ctx.activeLayer = mapData.layers.length - 1;
  ctx.game.mapRenderer.loadMap(mapData);
  ctx.syncTilesetToMapLayer();
  ctx.showSaveStatus(`Added layer "${layerName}"`, false);
}

export function removeActiveLayer(
  ctx: LayerPanelContext & {
    game: { mapRenderer: { getMapData(): { layers: unknown[] } | null; loadMap(d: unknown): void } } | null;
    activeLayer: number;
  },
): void {
  const mapData = ctx.game?.mapRenderer.getMapData();
  if (!mapData || !ctx.game) return;
  if (mapData.layers.length <= 1) {
    ctx.showSaveStatus("Map must have at least one layer", true);
    return;
  }
  const target = mapData.layers[ctx.activeLayer];
  if (!target) return;
  const confirmed = window.confirm(
    `Delete layer "${(target as { name: string }).name}"? This removes all tiles on that layer.`,
  );
  if (!confirmed) {
    ctx.showSaveStatus("Layer delete cancelled", false);
    return;
  }
  const removed = mapData.layers.splice(ctx.activeLayer, 1)[0] as {
    name: string;
  };
  ctx.activeLayer = Math.max(
    0,
    Math.min(ctx.activeLayer, mapData.layers.length - 1),
  );
  ctx.game.mapRenderer.loadMap(mapData);
  ctx.syncTilesetToMapLayer();
  ctx.showSaveStatus(`Removed layer "${removed.name}"`, false);
}

export function moveActiveLayer(
  ctx: LayerPanelContext & {
    game: { mapRenderer: { getMapData(): { layers: unknown[] } | null; loadMap(d: unknown): void } } | null;
    activeLayer: number;
  },
  delta: -1 | 1,
): void {
  const mapData = ctx.game?.mapRenderer.getMapData();
  if (!mapData || !ctx.game) return;
  const from = ctx.activeLayer;
  const to = from + delta;
  if (to < 0 || to >= mapData.layers.length) {
    ctx.showSaveStatus(
      delta < 0
        ? "Layer is already at the top"
        : "Layer is already at the bottom",
      true,
    );
    return;
  }
  const [moved] = mapData.layers.splice(from, 1);
  mapData.layers.splice(to, 0, moved);
  ctx.activeLayer = to;
  ctx.game.mapRenderer.loadMap(mapData);
  ctx.syncTilesetToMapLayer();
  ctx.showSaveStatus(
    `Moved layer "${(moved as { name: string }).name}"`,
    false,
  );
}
