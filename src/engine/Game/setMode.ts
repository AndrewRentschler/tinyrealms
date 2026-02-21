import type { AppMode } from "../types.ts";
import type { IGame } from "./types.ts";
import { loadWorldItems } from "./loadWorldItems.ts";
import { subscribeToWorldItems } from "./subscribeToWorldItems.ts";
import { subscribeToMapObjects } from "./subscribeToMapObjects.ts";

/**
 * Switch between play and build mode.
 */
export function setMode(game: IGame, mode: AppMode): void {
  const wasBuild = game.mode === "build";
  game.mode = mode;

  if (mode === "build") {
    game.camera.stopFollowing();
    game.mapRenderer.setPortalOverlayVisible(true);
  } else {
    game.mapRenderer.setPortalOverlayVisible(false);
    game.mapRenderer.setCollisionOverlayVisible(false);
    game.mapRenderer.highlightLayer(-1);
    game.mapRenderer.hidePortalGhost();
    game.mapRenderer.hideLabelGhost();
    game.mapRenderer.hideTileGhost();

    if (wasBuild && game.mapObjectsDirty) {
      subscribeToMapObjects(game, game.currentMapName, false);
    }

    if (wasBuild) {
      loadWorldItems(game, game.currentMapName);
      subscribeToWorldItems(game, game.currentMapName);
    }
  }
}
