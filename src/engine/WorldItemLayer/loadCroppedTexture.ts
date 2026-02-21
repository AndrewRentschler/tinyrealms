import { Assets, Rectangle, Texture } from "pixi.js";
import type { WorldItemDefInfo } from "./types.ts";

/**
 * Load a cropped texture from an item def's tileset icon.
 * Uses textureCache to avoid re-loading the same crop.
 */
export async function loadCroppedTexture(
  def: WorldItemDefInfo,
  textureCache: Map<string, Texture>,
): Promise<Texture | null> {
  const key = `${def.iconTilesetUrl}:${def.iconTileX}:${def.iconTileY}:${def.iconTileW}:${def.iconTileH}`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  try {
    const baseTexture = await Assets.load(def.iconTilesetUrl!);
    const frame = new Rectangle(
      def.iconTileX!,
      def.iconTileY!,
      def.iconTileW!,
      def.iconTileH!,
    );
    const texture = new Texture({ source: baseTexture.source, frame });
    textureCache.set(key, texture);
    return texture;
  } catch (err) {
    console.warn("Failed to load item texture:", err);
    return null;
  }
}
