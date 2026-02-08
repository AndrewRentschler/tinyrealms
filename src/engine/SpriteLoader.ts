/**
 * Sprite sheet loader that avoids PixiJS global cache collisions.
 *
 * Many retro sprite sheets use generic frame names like "tile0_0".
 * Loading multiple sheets through Assets.load() causes cache key conflicts.
 * This loader creates each Spritesheet manually to avoid that.
 */
import { Spritesheet, Assets, Texture } from "pixi.js";

const sheetCache = new Map<string, Spritesheet>();

/**
 * Load a sprite sheet JSON and its associated image.
 * Returns a fully parsed Spritesheet with unique frame references.
 */
export async function loadSpriteSheet(jsonPath: string): Promise<Spritesheet> {
  // Check our own cache first
  const cached = sheetCache.get(jsonPath);
  if (cached) return cached;

  // Fetch the JSON data
  const response = await fetch(jsonPath);
  if (!response.ok) {
    throw new Error(`Failed to load sprite sheet: ${jsonPath}`);
  }
  const data = await response.json();

  // Resolve the image path relative to the JSON file
  const basePath = jsonPath.substring(0, jsonPath.lastIndexOf("/") + 1);
  const imagePath = basePath + data.meta.image;

  // Load the image as a texture (Assets caches by URL, so images won't collide)
  const texture: Texture = await Assets.load(imagePath);

  // Create spritesheet manually — this uses its own texture dictionary,
  // so frame names like "tile0_0" won't collide between different sheets.
  const sheet = new Spritesheet(texture, data);
  await sheet.parse();

  sheetCache.set(jsonPath, sheet);
  return sheet;
}
