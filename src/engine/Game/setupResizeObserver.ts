import type { IGame } from "./types.ts";

/**
 * Observe canvas parent and resize app + camera on dimension change.
 */
export function setupResizeObserver(game: IGame): void {
  const parent = game.canvas.parentElement!;
  game.resizeObserver = new ResizeObserver(() => {
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    game.app.renderer.resize(w, h);
    game.camera.setViewport(w, h);
  });
  game.resizeObserver.observe(parent);
  game.camera.setViewport(parent.clientWidth, parent.clientHeight);
}
