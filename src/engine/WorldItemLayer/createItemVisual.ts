/**
 * Shared logic to create the item visual (tileset sprite, sprite-def animation, or fallback Graphics).
 * Used by addItem() and showGhost() to avoid duplication.
 */
import { Sprite, AnimatedSprite, Graphics, Texture } from "pixi.js";
import type { Spritesheet } from "pixi.js";
import type { WorldItemDefInfo } from "./types.ts";
import { loadCroppedTexture } from "./loadCroppedTexture.ts";
import { loadSpriteDefVisual } from "./loadSpriteDefVisual.ts";
import {
  RARITY_COLORS,
  PROMPT_FILL_COLOR,
  FALLBACK_RECT_X,
  FALLBACK_RECT_Y,
  FALLBACK_RECT_WIDTH,
  FALLBACK_RECT_HEIGHT,
  FALLBACK_RECT_RADIUS,
  FALLBACK_FILL_ALPHA,
  FALLBACK_STROKE_COLOR,
  FALLBACK_STROKE_WIDTH,
} from "./constants.ts";

/** Context passed to createItemVisual: caches for textures and sprite sheets */
export interface CreateItemVisualContext {
  textureCache: Map<string, Texture>;
  spriteSheetCache: Map<string, Spritesheet>;
}

function createFallbackVisual(def: WorldItemDefInfo): Graphics {
  const g = new Graphics();
  const color = RARITY_COLORS[def.rarity] ?? PROMPT_FILL_COLOR;
  g.roundRect(FALLBACK_RECT_X, FALLBACK_RECT_Y, FALLBACK_RECT_WIDTH, FALLBACK_RECT_HEIGHT, FALLBACK_RECT_RADIUS);
  g.fill({ color, alpha: FALLBACK_FILL_ALPHA });
  g.stroke({ color: FALLBACK_STROKE_COLOR, width: FALLBACK_STROKE_WIDTH });
  return g;
}

/**
 * Create the visual for a world item (sprite from tileset, sprite from sprite-def animation, or fallback Graphics).
 * Uses the provided caches to avoid re-loading the same assets.
 */
export async function createItemVisual(
  def: WorldItemDefInfo,
  context: CreateItemVisualContext,
): Promise<Sprite | AnimatedSprite | Graphics> {
  if (def.iconSpriteSheetUrl && def.iconSpriteAnimation) {
    const spriteVisual = await loadSpriteDefVisual(def, context.spriteSheetCache);
    return spriteVisual ?? createFallbackVisual(def);
  }
  if (def.iconTilesetUrl && def.iconTileW && def.iconTileH) {
    const texture = await loadCroppedTexture(def, context.textureCache);
    if (texture) {
      const visual = new Sprite(texture);
      visual.anchor.set(0.5, 1.0);
      return visual;
    }
  }
  return createFallbackVisual(def);
}
