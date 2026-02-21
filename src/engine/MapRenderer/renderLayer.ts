import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { MapData, MapLayer } from "../types.ts";

/**
 * Get the pixel width from a texture source, or fallback if unavailable.
 */
function getSourceWidth(source: unknown, fallback: number): number {
  if (source && typeof source === "object" && "width" in source) {
    const w = (source as { width: unknown }).width;
    if (typeof w === "number") return w;
  }
  return fallback;
}

/**
 * Renders a map layer's tiles into a container.
 * Pure function: mutates only the container (adds sprites).
 *
 * @param container - Pixi Container to add tile sprites to
 * @param layer - Map layer with tile indices
 * @param mapData - Map dimensions and tile size
 * @param tilesetTexture - Texture for the tileset (undefined = no-op)
 */
export function renderLayer(
  container: Container,
  layer: MapLayer,
  mapData: MapData,
  tilesetTexture: Texture | undefined
): void {
  if (!tilesetTexture) return;

  const sourceWidth = getSourceWidth(tilesetTexture.source, mapData.tilesetPxW);
  const tilesPerRow = Math.floor(sourceWidth / mapData.tileWidth);

  for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
      const tileIndex = layer.tiles[y * mapData.width + x];
      if (tileIndex < 0) continue;

      const srcX = (tileIndex % tilesPerRow) * mapData.tileWidth;
      const srcY = Math.floor(tileIndex / tilesPerRow) * mapData.tileHeight;

      const frame = new Rectangle(
        srcX,
        srcY,
        mapData.tileWidth,
        mapData.tileHeight
      );
      const texture = new Texture({
        source: tilesetTexture.source,
        frame,
      });

      const sprite = new Sprite(texture);
      sprite.x = x * mapData.tileWidth;
      sprite.y = y * mapData.tileHeight;
      container.addChild(sprite);
    }
  }
}
