import { Graphics } from "pixi.js";
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
import type { WorldItemDefInfo } from "./types.ts";

/** Create a fallback Graphics visual (coloured square) when tileset/sprite def is missing */
export function createFallbackVisual(def: WorldItemDefInfo): Graphics {
  const g = new Graphics();
  const color = RARITY_COLORS[def.rarity] ?? PROMPT_FILL_COLOR;
  g.roundRect(
    FALLBACK_RECT_X,
    FALLBACK_RECT_Y,
    FALLBACK_RECT_WIDTH,
    FALLBACK_RECT_HEIGHT,
    FALLBACK_RECT_RADIUS,
  );
  g.fill({ color, alpha: FALLBACK_FILL_ALPHA });
  g.stroke({ color: FALLBACK_STROKE_COLOR, width: FALLBACK_STROKE_WIDTH });
  return g;
}
