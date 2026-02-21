import type { AppMode } from "../types.ts";
import type { IGame } from "./types.ts";
import { loadWorldItems } from "./loadWorldItems.ts";
import { subscribeToWorldItems } from "./subscribeToWorldItems.ts";
import { subscribeToMapObjects } from "./subscribeToMapObjects.ts";

/**
 * Switch between play and build mode.
 */
export function setMode(
  game: IGame & {
    mapObjectsDirty: boolean;
    mapRenderer: {
      setPortalOverlayVisible: (v: boolean) => void;
      setCollisionOverlayVisible: (v: boolean) => void;
      highlightLayer: (n: number) => void;
      hidePortalGhost: () => void;
      hideLabelGhost: () => void;
      hideTileGhost: () => void;
    };
    camera: { stopFollowing: () => void };
  },
  mode: AppMode,
): void {
  const wasBuild = game.mode === "build";
  (game as { mode: AppMode }).mode = mode;

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
      subscribeToMapObjects(game as Parameters<typeof subscribeToMapObjects>[0], game.currentMapName, false);
    }

    if (wasBuild) {
      loadWorldItems(game, game.currentMapName);
      subscribeToWorldItems(game as Parameters<typeof subscribeToWorldItems>[0], game.currentMapName);
    }
  }
}
