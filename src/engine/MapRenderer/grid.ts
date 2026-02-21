import { Container, Graphics } from "pixi.js";
import type { MapData } from "../types.ts";
import { GRID_Z_INDEX, GRID_COLOR, GRID_ALPHA, GRID_STROKE_WIDTH } from "./constants.ts";

/**
 * Renders tile grid lines on the map.
 * Creates a Graphics object if gridOverlay is null, adds it to container, and draws
 * vertical/horizontal lines based on map dimensions.
 *
 * @param mapData - Map dimensions and tile sizes
 * @param container - Pixi container to add the grid overlay to
 * @param gridOverlay - Existing Graphics or null to create a new one
 * @returns The Graphics instance (created or existing)
 */
export function renderGrid(
  mapData: MapData,
  container: Container,
  gridOverlay: Graphics | null
): Graphics {
  const tw = mapData.tileWidth;
  const th = mapData.tileHeight;
  const w = mapData.width * tw;
  const h = mapData.height * th;

  let g = gridOverlay;
  if (!g) {
    g = new Graphics();
    g.label = "grid-overlay";
    g.zIndex = GRID_Z_INDEX;
    container.addChild(g);
  }

  g.clear();

  // Draw vertical lines
  for (let x = 0; x <= mapData.width; x++) {
    g.moveTo(x * tw, 0);
    g.lineTo(x * tw, h);
  }
  // Draw horizontal lines
  for (let y = 0; y <= mapData.height; y++) {
    g.moveTo(0, y * th);
    g.lineTo(w, y * th);
  }

  g.stroke({ color: GRID_COLOR, alpha: GRID_ALPHA, width: GRID_STROKE_WIDTH });
  g.visible = true;

  return g;
}
