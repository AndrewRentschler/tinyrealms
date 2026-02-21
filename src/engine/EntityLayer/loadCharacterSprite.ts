import { AnimatedSprite } from "pixi.js";
import { loadSpriteSheet } from "../SpriteLoader.ts";
import { PLAYER_ANIM_SPEED } from "../../config/multiplayer-config.ts";
import type { IEntityLayer } from "./types.ts";
import { PLAYER_LABEL_ANCHOR_X, PLAYER_LABEL_ANCHOR_Y, SPRITE_LABEL_Y_OFFSET } from "./constants.ts";

export async function loadCharacterSprite(layer: IEntityLayer): Promise<void> {
  try {
    const spriteUrl = layer.game.profile?.spriteUrl ?? "/assets/characters/villager4.json";
    const sheet = await loadSpriteSheet(spriteUrl);
    (layer as { spritesheet: typeof sheet | null }).spritesheet = sheet;
    if (!sheet.animations) return;

    const downFrames = sheet.animations["row0"];
    if (!downFrames || downFrames.length === 0) return;

    const sprite = new AnimatedSprite(downFrames);
    sprite.animationSpeed = PLAYER_ANIM_SPEED;
    sprite.anchor.set(PLAYER_LABEL_ANCHOR_X, PLAYER_LABEL_ANCHOR_Y);
    sprite.play();

    if (layer.playerFallback) {
      layer.playerContainer.removeChild(layer.playerFallback);
      layer.playerFallback.destroy();
      (layer as { playerFallback: null }).playerFallback = null;
    }

    layer.playerContainer.addChild(sprite);
    (layer as { playerSprite: AnimatedSprite | null }).playerSprite = sprite;
    layer.playerLabel.y = -SPRITE_LABEL_Y_OFFSET;
  } catch (err) {
    console.warn("Failed to load character sprite:", err);
  }
}
