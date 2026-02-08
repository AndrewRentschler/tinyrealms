/**
 * Grid snapping and coordinate conversion utilities.
 */

/** Snap a world position to the nearest tile grid position */
export function snapToGrid(
  worldX: number,
  worldY: number,
  tileWidth: number,
  tileHeight: number
): { x: number; y: number } {
  return {
    x: Math.floor(worldX / tileWidth) * tileWidth,
    y: Math.floor(worldY / tileHeight) * tileHeight,
  };
}

/** Convert world position to tile coordinates */
export function worldToTile(
  worldX: number,
  worldY: number,
  tileWidth: number,
  tileHeight: number
): { tileX: number; tileY: number } {
  return {
    tileX: Math.floor(worldX / tileWidth),
    tileY: Math.floor(worldY / tileHeight),
  };
}

/** Convert tile coordinates to world position (top-left corner) */
export function tileToWorld(
  tileX: number,
  tileY: number,
  tileWidth: number,
  tileHeight: number
): { x: number; y: number } {
  return {
    x: tileX * tileWidth,
    y: tileY * tileHeight,
  };
}

/** Convert tile coordinates to world position (center of tile) */
export function tileCenterToWorld(
  tileX: number,
  tileY: number,
  tileWidth: number,
  tileHeight: number
): { x: number; y: number } {
  return {
    x: tileX * tileWidth + tileWidth / 2,
    y: tileY * tileHeight + tileHeight / 2,
  };
}

/** Convert a flat array index to 2D tile coordinates */
export function indexToTile(
  index: number,
  mapWidth: number
): { tileX: number; tileY: number } {
  return {
    tileX: index % mapWidth,
    tileY: Math.floor(index / mapWidth),
  };
}

/** Convert 2D tile coordinates to a flat array index */
export function tileToIndex(
  tileX: number,
  tileY: number,
  mapWidth: number
): number {
  return tileY * mapWidth + tileX;
}

/** Get the tile index from a tileset position */
export function tilesetPosToIndex(
  tilesetX: number,
  tilesetY: number,
  tilesetTilesPerRow: number
): number {
  return tilesetY * tilesetTilesPerRow + tilesetX;
}

/** Check if tile coordinates are within map bounds */
export function isInBounds(
  tileX: number,
  tileY: number,
  mapWidth: number,
  mapHeight: number
): boolean {
  return tileX >= 0 && tileY >= 0 && tileX < mapWidth && tileY < mapHeight;
}
