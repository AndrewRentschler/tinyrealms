import { ColorMatrixFilter } from "pixi.js";
import {
  HIT_SHAKE_DURATION_MS,
  HIT_SHAKE_MAGNITUDE_PX,
  HIT_FLASH_DURATION_MS,
} from "../../config/combat-config.ts";
import type { IEntityLayer } from "./types.ts";
import { HIT_FLASH_MATRIX, SHAKE_RANDOM_RANGE } from "./constants.ts";

export function playPlayerHitEffect(layer: IEntityLayer): void {
  const target = layer.playerSprite ?? layer.playerFallback;
  if (!target) return;

  const redFilter = new ColorMatrixFilter();
  redFilter.matrix = HIT_FLASH_MATRIX;
  target.filters = [redFilter];
  setTimeout(() => {
    if (target.filters) {
      target.filters = [];
    }
  }, HIT_FLASH_DURATION_MS);

  const origX = target.x;
  const origY = target.y;
  const start = performance.now();
  const shake = () => {
    const elapsed = performance.now() - start;
    if (elapsed >= HIT_SHAKE_DURATION_MS) {
      target.x = origX;
      target.y = origY;
      return;
    }
    const progress = elapsed / HIT_SHAKE_DURATION_MS;
    const mag = HIT_SHAKE_MAGNITUDE_PX * (1 - progress);
    target.x = origX + (Math.random() * SHAKE_RANDOM_RANGE - 1) * mag;
    target.y = origY + (Math.random() * SHAKE_RANDOM_RANGE - 1) * mag;
    requestAnimationFrame(shake);
  };
  requestAnimationFrame(shake);
}
