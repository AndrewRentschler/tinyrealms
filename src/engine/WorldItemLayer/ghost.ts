/**
 * Ghost preview (cursor-following item preview in build mode).
 */
import { Sprite, type AnimatedSprite, type Graphics } from "pixi.js";
import type { WorldItemDefInfo, WorldItemLayerGhostContext } from "./types.ts";
import { GHOST_ALPHA, GHOST_Z_INDEX } from "./constants.ts";
import { loadCroppedTexture } from "./loadCroppedTexture.ts";
import { loadSpriteDefVisual } from "./loadSpriteDefVisual.ts";
import { createFallbackVisual } from "./createFallbackVisual.ts";

/** Show a semi-transparent ghost of an item def at the cursor */
export async function showGhost(
  ctx: WorldItemLayerGhostContext,
  def: WorldItemDefInfo,
): Promise<void> {
  if (ctx.ghostDefName === def.name && ctx.ghostSprite) return;
  hideGhost(ctx);
  ctx.ghostDefName = def.name;

  let visual: Sprite | AnimatedSprite | Graphics;
  if (def.iconSpriteSheetUrl && def.iconSpriteAnimation) {
    const spriteVisual = await loadSpriteDefVisual(def, ctx.spriteSheetCache);
    visual = spriteVisual ?? createFallbackVisual(def);
  } else if (def.iconTilesetUrl && def.iconTileW && def.iconTileH) {
    const texture = await loadCroppedTexture(def, ctx.textureCache);
    if (texture) {
      visual = new Sprite(texture);
      visual.anchor.set(0.5, 1.0);
    } else {
      visual = createFallbackVisual(def);
    }
  } else {
    visual = createFallbackVisual(def);
  }
  visual.alpha = GHOST_ALPHA;
  visual.zIndex = GHOST_Z_INDEX;
  ctx.container.addChild(visual);
  ctx.ghostSprite = visual;
}

/** Update ghost position (world coordinates) */
export function updateGhost(
  ctx: WorldItemLayerGhostContext,
  worldX: number,
  worldY: number,
): void {
  if (ctx.ghostSprite) {
    ctx.ghostSprite.x = worldX;
    ctx.ghostSprite.y = worldY;
  }
}

/** Hide and destroy the ghost */
export function hideGhost(ctx: WorldItemLayerGhostContext): void {
  if (ctx.ghostSprite) {
    ctx.container.removeChild(ctx.ghostSprite);
    ctx.ghostSprite.destroy();
    ctx.ghostSprite = null;
    ctx.ghostDefName = null;
  }
}
