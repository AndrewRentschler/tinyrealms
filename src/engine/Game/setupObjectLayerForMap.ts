import type { MapData } from "../types.ts";
import type { IGame } from "./types.ts";

/**
 * Configure ObjectLayer for a map: tile dimensions and door collision callback.
 */
export function setupObjectLayerForMap(game: IGame, mapData: MapData): void {
  game.objectLayer.tileWidth = mapData.tileWidth;
  game.objectLayer.tileHeight = mapData.tileHeight;
  game.objectLayer.onDoorCollisionChange = (tiles, blocked) => {
    for (const t of tiles) {
      game.mapRenderer.setCollisionOverride(t.x, t.y, blocked);
    }
  };
}
