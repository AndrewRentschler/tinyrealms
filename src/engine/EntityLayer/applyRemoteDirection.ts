import type { AnimatedSprite, Spritesheet } from "pixi.js";
import { dirToAnimKey, REMOTE_FRAME_IDLE } from "./constants.ts";
import type { Direction } from "../types.ts";

export function applyRemoteDirection(
  sprite: AnimatedSprite | null,
  spritesheet: Spritesheet | null,
  animation: string,
  dir: Direction,
): void {
  if (!sprite || !spritesheet) return;
  const animKey = dirToAnimKey(dir);
  const frames = spritesheet.animations[animKey];
  if (frames && frames.length > 0) {
    sprite.textures = frames;
    if (animation === "walk") sprite.play();
    else sprite.gotoAndStop(REMOTE_FRAME_IDLE);
  }
}
