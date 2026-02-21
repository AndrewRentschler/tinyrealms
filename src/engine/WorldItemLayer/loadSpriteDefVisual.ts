import { AnimatedSprite } from "pixi.js";
import { loadSpriteSheet } from "../SpriteLoader.ts";
import type { WorldItemDefInfo } from "./types.ts";
import { DEFAULT_ICON_ANIMATION_SPEED } from "./constants.ts";

/** Sprite sheet cache value type */
export type SpriteSheetCache = Map<string, Awaited<ReturnType<typeof loadSpriteSheet>>>;

/**
 * Load an animated sprite from an item def's icon sprite sheet.
 * Uses spriteSheetCache to avoid re-loading the same sheet.
 */
export async function loadSpriteDefVisual(
  def: WorldItemDefInfo,
  spriteSheetCache: SpriteSheetCache,
): Promise<AnimatedSprite | null> {
  const sheetUrl = def.iconSpriteSheetUrl;
  const animation = def.iconSpriteAnimation;
  if (!sheetUrl || !animation) return null;

  try {
    let sheet = spriteSheetCache.get(sheetUrl);
    if (!sheet) {
      sheet = await loadSpriteSheet(sheetUrl);
      spriteSheetCache.set(sheetUrl, sheet);
    }
    const frames = sheet.animations?.[animation];
    if (!frames || frames.length === 0) return null;

    const sprite = new AnimatedSprite(frames);
    sprite.anchor.set(0.5, 1.0);
    sprite.animationSpeed = def.iconSpriteAnimationSpeed ?? DEFAULT_ICON_ANIMATION_SPEED;
    sprite.scale.set(def.iconSpriteScale ?? 1);
    sprite.play();
    return sprite;
  } catch (err) {
    console.warn("Failed to load sprite-def icon for world item:", err);
    return null;
  }
}
