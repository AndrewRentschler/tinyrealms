import { FADE_OVERLAY } from "../../constants/colors.ts";
import type { IGame } from "./types.ts";

const FADE_DURATION_MS = 420;

/**
 * Fade overlay for map transitions.
 */
export function fadeOverlay(game: IGame, fadeIn: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (!game.fadeEl) {
      const el = document.createElement("div");
      el.style.cssText =
        `position:absolute;top:0;left:0;width:100%;height:100%;background:${FADE_OVERLAY};` +
        "pointer-events:none;z-index:9999;transition:opacity 0.4s ease;opacity:0;";
      game.canvas.parentElement?.appendChild(el);
      game.fadeEl = el;
    }

    game.fadeEl.style.opacity = fadeIn ? "1" : "0";
    setTimeout(resolve, FADE_DURATION_MS);
  });
}
