import { dirToAnimKey } from "./constants.ts";
import type { IEntityLayer } from "./types.ts";
import type { Direction } from "../types.ts";

export function setDirection(
  layer: IEntityLayer,
  dir: Direction,
  isMoving: boolean,
): void {
  if (layer.playerDirection === dir && isMoving) return;
  (layer as { playerDirection: Direction }).playerDirection = dir;

  if (layer.playerSprite && layer.spritesheet?.animations) {
    const animKey = dirToAnimKey(dir);
    const frames = layer.spritesheet.animations[animKey];
    if (frames && frames.length > 0) {
      layer.playerSprite.textures = frames;
      layer.playerSprite.play();
    }
  }
}
