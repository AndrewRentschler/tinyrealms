/**
 * Ghost preview sprite logic for object placement in editor.
 */
import { AnimatedSprite } from "pixi.js";
import { loadSpriteSheet } from "../SpriteLoader.ts";
import { GHOST_ALPHA, GHOST_Z_INDEX, SPRITE_ANCHOR_X, SPRITE_ANCHOR_Y } from "./constants.ts";
import type { ObjectLayerContext, SpriteDefInfo } from "./types.ts";

/** Show a semi-transparent ghost of a sprite def at the cursor position */
export async function showGhost(
  layer: ObjectLayerContext,
  def: SpriteDefInfo,
): Promise<void> {
  if (layer.ghostDefName === def.name && layer.ghostSprite) return;

  hideGhost(layer);
  layer.ghostDefName = def.name;

  try {
    let sheet = layer.sheetCache.get(def.spriteSheetUrl);
    if (!sheet) {
      sheet = await loadSpriteSheet(def.spriteSheetUrl);
      layer.sheetCache.set(def.spriteSheetUrl, sheet);
    }

    const animFrames = sheet.animations[def.defaultAnimation];
    if (!animFrames || animFrames.length === 0) return;

    const sprite = new AnimatedSprite(animFrames);
    sprite.anchor.set(SPRITE_ANCHOR_X, SPRITE_ANCHOR_Y);
    sprite.scale.set(def.scale);
    sprite.alpha = GHOST_ALPHA;
    sprite.animationSpeed = def.animationSpeed;
    sprite.play();
    sprite.zIndex = GHOST_Z_INDEX;
    sprite.visible = false;

    layer.ghostSprite = sprite;
    layer.container.addChild(sprite);
  } catch (err) {
    console.warn("Failed to create ghost sprite:", err);
  }
}

/** Update the ghost position (world coordinates) */
export function updateGhost(
  layer: ObjectLayerContext,
  worldX: number,
  worldY: number,
): void {
  if (!layer.ghostSprite) return;
  layer.ghostSprite.x = Math.round(worldX);
  layer.ghostSprite.y = Math.round(worldY);
  layer.ghostSprite.visible = true;
}

/** Remove the ghost */
export function hideGhost(layer: ObjectLayerContext): void {
  if (layer.ghostSprite) {
    layer.container.removeChild(layer.ghostSprite);
    layer.ghostSprite.destroy();
    layer.ghostSprite = null;
    layer.ghostDefName = null;
  }
}
