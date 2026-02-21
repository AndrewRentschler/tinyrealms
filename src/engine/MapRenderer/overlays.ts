import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { MapData, Portal, MapLabel } from "../types.ts";
import {
  COLLISION_OVERLAY_COLOR,
  COLLISION_OVERLAY_ALPHA,
  PORTAL_OVERLAY_COLOR,
  PORTAL_OVERLAY_FILL_ALPHA,
  PORTAL_OVERLAY_STROKE_ALPHA,
  PORTAL_OVERLAY_STROKE_WIDTH,
  LABEL_OVERLAY_COLOR,
  LABEL_OVERLAY_FILL_ALPHA,
  LABEL_OVERLAY_STROKE_ALPHA,
  LABEL_OVERLAY_STROKE_WIDTH,
  OVERLAY_LABEL_FONT_FAMILY,
  OVERLAY_LABEL_FILL_COLOR,
  OVERLAY_LABEL_STROKE_COLOR,
  OVERLAY_LABEL_STROKE_WIDTH,
  OVERLAY_LABEL_FONT_SIZE_MIN,
  OVERLAY_LABEL_FONT_SIZE_MAX,
  OVERLAY_LABEL_FONT_SIZE_SCALE,
} from "./constants.ts";

/**
 * Creates a shared TextStyle for overlay labels (portals, map labels).
 * Font size scales with tile width, clamped between min and max.
 */
export function createOverlayLabelStyle(tileWidth: number): TextStyle {
  return new TextStyle({
    fontFamily: OVERLAY_LABEL_FONT_FAMILY,
    fontSize: Math.max(
      OVERLAY_LABEL_FONT_SIZE_MIN,
      Math.min(tileWidth * OVERLAY_LABEL_FONT_SIZE_SCALE, OVERLAY_LABEL_FONT_SIZE_MAX)
    ),
    fill: OVERLAY_LABEL_FILL_COLOR,
    stroke: { color: OVERLAY_LABEL_STROKE_COLOR, width: OVERLAY_LABEL_STROKE_WIDTH },
    align: "center",
  });
}

/**
 * Creates or updates a Graphics object with collision tiles.
 * Uses collisionMask; tiles in collisionOverrides override the mask.
 * Key format: "tileX,tileY", value: true = blocked.
 */
export function renderCollisionOverlay(
  graphics: Graphics | null,
  mapData: MapData,
  collisionOverrides: Map<string, boolean>
): Graphics {
  const { width, height, tileWidth, tileHeight, collisionMask } = mapData;

  const g = graphics ?? new Graphics();
  g.clear();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      const blocked = collisionOverrides.has(key)
        ? collisionOverrides.get(key)!
        : collisionMask[y * width + x];

      if (blocked) {
        g.rect(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
      }
    }
  }
  g.fill({ color: COLLISION_OVERLAY_COLOR, alpha: COLLISION_OVERLAY_ALPHA });
  g.visible = true;

  return g;
}

/**
 * Draws portal zones with labels into the container.
 * Clears existing children first.
 */
export function renderPortalOverlay(
  container: Container,
  mapData: MapData,
  tileWidth: number,
  tileHeight: number
): void {
  container.removeChildren();
  const portals: Portal[] = mapData.portals ?? [];
  if (portals.length === 0) return;

  const labelStyle = createOverlayLabelStyle(tileWidth);

  for (const p of portals) {
    const px = p.x * tileWidth;
    const py = p.y * tileHeight;
    const pw = p.width * tileWidth;
    const ph = p.height * tileHeight;

    const rect = new Graphics();
    rect.rect(px, py, pw, ph);
    rect.fill({ color: PORTAL_OVERLAY_COLOR, alpha: PORTAL_OVERLAY_FILL_ALPHA });
    rect.stroke({
      color: PORTAL_OVERLAY_COLOR,
      alpha: PORTAL_OVERLAY_STROKE_ALPHA,
      width: PORTAL_OVERLAY_STROKE_WIDTH,
    });
    container.addChild(rect);

    const label = new Text({
      text: `🚪 ${p.name}\n→ ${p.targetMap}`,
      style: labelStyle,
    });
    label.anchor.set(0.5, 0.5);
    label.x = px + pw / 2;
    label.y = py + ph / 2;
    container.addChild(label);
  }
}

/**
 * Draws label zones into the container.
 * Clears existing children first.
 */
export function renderLabelOverlay(
  container: Container,
  mapData: MapData,
  tileWidth: number,
  tileHeight: number
): void {
  container.removeChildren();
  const labels: MapLabel[] = mapData.labels ?? [];
  if (labels.length === 0) return;

  const labelStyle = createOverlayLabelStyle(tileWidth);

  for (const l of labels) {
    const px = l.x * tileWidth;
    const py = l.y * tileHeight;
    const pw = (l.width ?? 1) * tileWidth;
    const ph = (l.height ?? 1) * tileHeight;

    const rect = new Graphics();
    rect.rect(px, py, pw, ph);
    rect.fill({ color: LABEL_OVERLAY_COLOR, alpha: LABEL_OVERLAY_FILL_ALPHA });
    rect.stroke({
      color: LABEL_OVERLAY_COLOR,
      alpha: LABEL_OVERLAY_STROKE_ALPHA,
      width: LABEL_OVERLAY_STROKE_WIDTH,
    });
    container.addChild(rect);

    const text = new Text({
      text: `🏷 ${l.name}`,
      style: labelStyle,
    });
    text.anchor.set(0.5, 0.5);
    text.x = px + pw / 2;
    text.y = py + ph / 2;
    container.addChild(text);
  }
}
