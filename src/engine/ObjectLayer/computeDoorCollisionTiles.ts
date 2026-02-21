/**
 * Pure function: compute which tile positions a door blocks based on its sprite bounds.
 * Bounds are shrunk by DOOR_COLLISION_INSET (fraction) on each side so the blocked
 * area is slightly smaller than the visual sprite.
 */
import { DOOR_COLLISION_INSET, DOOR_COLLISION_TILE_BOUNDARY_OFFSET } from "./constants.ts";

/**
 * Compute tile positions a door blocks.
 *
 * @param worldX - Door world X (anchor at center)
 * @param worldY - Door world Y (anchor at bottom)
 * @param frameWidth - Sprite frame width
 * @param frameHeight - Sprite frame height
 * @param scale - Sprite scale
 * @param tileWidth - Map tile width
 * @param tileHeight - Map tile height
 * @returns Array of {x, y} tile coordinates
 */
export function computeDoorCollisionTiles(
  worldX: number,
  worldY: number,
  frameWidth: number,
  frameHeight: number,
  scale: number,
  tileWidth: number,
  tileHeight: number,
): { x: number; y: number }[] {
  if (tileWidth <= 0 || tileHeight <= 0) return [];

  const inset = DOOR_COLLISION_INSET;
  const spriteW = frameWidth * scale;
  const spriteH = frameHeight * scale;

  // Sprite anchor is (0.5, 1.0) — bottom-center, then shrink inward
  const left = worldX - spriteW / 2 + spriteW * inset;
  const right = worldX + spriteW / 2 - spriteW * inset;
  const top = worldY - spriteH + spriteH * inset;
  const bottom = worldY - spriteH * inset;

  const tiles: { x: number; y: number }[] = [];
  const offset = DOOR_COLLISION_TILE_BOUNDARY_OFFSET;
  const tx1 = Math.floor(left / tileWidth);
  const tx2 = Math.floor((right - offset) / tileWidth);
  const ty1 = Math.floor(top / tileHeight);
  const ty2 = Math.floor((bottom - offset) / tileHeight);
  for (let ty = ty1; ty <= ty2; ty++) {
    for (let tx = tx1; tx <= tx2; tx++) {
      tiles.push({ x: tx, y: ty });
    }
  }
  return tiles;
}
