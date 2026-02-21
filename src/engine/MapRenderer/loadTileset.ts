import { Assets, Texture } from "pixi.js";

/**
 * Load a tileset texture by URL, caching it in the provided map.
 * Mutates tilesetTextures: adds the loaded texture keyed by url.
 *
 * @param tilesetTextures - Map to cache loaded textures (mutated)
 * @param url - URL of the tileset image to load
 * @returns Promise resolving to the texture (cached or newly loaded)
 */
export async function loadTilesetTexture(
  tilesetTextures: Map<string, Texture>,
  url: string
): Promise<Texture> {
  const existing = tilesetTextures.get(url);
  if (existing) return existing;
  const loaded = await Assets.load(url);
  tilesetTextures.set(url, loaded);
  return loaded;
}
