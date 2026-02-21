import type { MapData } from "../types.ts";
import type { IGame } from "./types.ts";

const DEFAULT_START_LABEL = "start1";

/**
 * Set player position from profile (if saved on same map) or from a map label.
 */
export function setPlayerSpawnPosition(
  game: IGame,
  mapData: MapData,
  options?: { spawnLabel?: string; direction?: string },
): void {
  const useProfile =
    !options?.spawnLabel &&
    game.profile.mapName === game.currentMapName &&
    game.profile.x != null &&
    game.profile.y != null;

  if (useProfile && game.profile.x != null && game.profile.y != null) {
    game.entityLayer.playerX = game.profile.x;
    game.entityLayer.playerY = game.profile.y;
    if (game.profile.direction) {
      (game.entityLayer as { playerDirection: string }).playerDirection =
        game.profile.direction;
    }
    return;
  }

  const preferredLabel =
    options?.spawnLabel ?? game.profile.startLabel ?? DEFAULT_START_LABEL;
  const label =
    mapData.labels?.find((l) => l.name === preferredLabel) ??
    mapData.labels?.find((l) => l.name === DEFAULT_START_LABEL) ??
    mapData.labels?.[0];

  if (label) {
    game.entityLayer.playerX =
      label.x * mapData.tileWidth + mapData.tileWidth / 2;
    game.entityLayer.playerY =
      label.y * mapData.tileHeight + mapData.tileHeight / 2;
  }

  if (options?.direction) {
    (game.entityLayer as { playerDirection: string }).playerDirection =
      options.direction;
  }
}
