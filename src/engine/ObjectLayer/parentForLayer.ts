/**
 * Returns the correct parent container for the given editor layer index.
 * Layers 0-1 (bg) → bgContainer, 2-3 (obj) → container, 4 (overlay) → overlayContainer.
 */
import type { Container } from "pixi.js";
import { LAYER_BG_THRESHOLD, LAYER_OVERLAY_THRESHOLD } from "./constants.ts";
import type { IObjectLayerContainers } from "./types.ts";

export function parentForLayer(
  layer: IObjectLayerContainers,
  layerIndex: number,
): Container {
  if (layerIndex <= LAYER_BG_THRESHOLD) return layer.bgContainer;
  if (layerIndex >= LAYER_OVERLAY_THRESHOLD) return layer.overlayContainer;
  return layer.container;
}
