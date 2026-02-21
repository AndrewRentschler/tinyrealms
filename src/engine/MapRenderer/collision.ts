import type { MapData } from "../types.ts";

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

/**
 * Check collision at a tile coordinate.
 * Returns true for out-of-bounds tiles.
 */
export function isCollision(
  mapData: MapData | null,
  collisionOverrides: Map<string, boolean>,
  tileX: number,
  tileY: number
): boolean {
  if (!mapData) return false;
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX >= mapData.width ||
    tileY >= mapData.height
  ) {
    return true;
  }
  const key = `${tileX},${tileY}`;
  if (collisionOverrides.has(key)) {
    return collisionOverrides.get(key)!;
  }
  return mapData.collisionMask[tileY * mapData.width + tileX];
}

/**
 * Set a runtime collision override for a tile (e.g. doors).
 */
export function setCollisionOverride(
  collisionOverrides: Map<string, boolean>,
  tileX: number,
  tileY: number,
  blocked: boolean
): void {
  collisionOverrides.set(`${tileX},${tileY}`, blocked);
}

/**
 * Remove a runtime collision override (reverts to base collision mask).
 */
export function clearCollisionOverride(
  collisionOverrides: Map<string, boolean>,
  tileX: number,
  tileY: number
): void {
  collisionOverrides.delete(`${tileX},${tileY}`);
}

/**
 * Remove all runtime collision overrides.
 */
export function clearAllCollisionOverrides(
  collisionOverrides: Map<string, boolean>
): void {
  collisionOverrides.clear();
}

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

/**
 * Convert world position to tile coordinates.
 * Returns { tileX: 0, tileY: 0 } when mapData is null.
 */
export function worldToTile(
  mapData: MapData | null,
  worldX: number,
  worldY: number
): { tileX: number; tileY: number } {
  if (!mapData) return { tileX: 0, tileY: 0 };
  return {
    tileX: Math.floor(worldX / mapData.tileWidth),
    tileY: Math.floor(worldY / mapData.tileHeight),
  };
}

/**
 * Convert tile coordinates to world position (center of tile).
 * Returns { x: 0, y: 0 } when mapData is null.
 */
export function tileToWorld(
  mapData: MapData | null,
  tileX: number,
  tileY: number
): { x: number; y: number } {
  if (!mapData) return { x: 0, y: 0 };
  return {
    x: tileX * mapData.tileWidth + mapData.tileWidth / 2,
    y: tileY * mapData.tileHeight + mapData.tileHeight / 2,
  };
}
