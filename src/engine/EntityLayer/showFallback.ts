import { Graphics } from "pixi.js";
import type { IEntityLayer } from "./types.ts";
import { FALLBACK_SIZE, FALLBACK_FILL, FALLBACK_LABEL_GAP } from "./constants.ts";

export function showFallback(layer: IEntityLayer): void {
  const size = FALLBACK_SIZE;
  const fallback = new Graphics();
  fallback.rect(-size / 2, -size / 2, size, size);
  fallback.fill(FALLBACK_FILL);
  layer.playerContainer.addChild(fallback);
  (layer as { playerFallback: Graphics }).playerFallback = fallback;
  layer.playerLabel.y = -size / 2 - FALLBACK_LABEL_GAP;
}
