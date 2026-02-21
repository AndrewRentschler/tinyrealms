import type { IGame } from "./types.ts";

/**
 * Fade overlay for map transitions.
 */
export function fadeOverlay(game: IGame, fadeIn: boolean): Promise<void> {
  return new Promise((resolve) => {
    let el = game.fadeEl;
    if (!el) {
      el = document.createElement("div");
      el.style.cssText =
        "position:absolute;top:0;left:0;width:100%;height:100%;background:#000;" +
        "pointer-events:none;z-index:9999;transition:opacity 0.4s ease;opacity:0;";
      game.canvas.parentElement?.appendChild(el);
      (game as { fadeEl: HTMLDivElement }).fadeEl = el;
    }

    if (fadeIn) {
      el.style.opacity = "1";
    } else {
      el.style.opacity = "0";
    }

    setTimeout(resolve, 420);
  });
}
