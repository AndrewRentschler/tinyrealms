import type { IGame } from "./types.ts";

/**
 * Check if the player is standing in a portal zone and trigger map change.
 */
export function checkPortals(game: IGame): void {
  if (game.changingMap) return;
  if (game.currentPortals.length === 0) {
    if (!game.portalEmptyWarned) {
      console.warn("[Portal:check] No portals on current map:", game.currentMapName);
      game.portalEmptyWarned = true;
    }
    return;
  }
  if (!game.currentMapData) return;

  const px = game.entityLayer.playerX;
  const py = game.entityLayer.playerY;
  const tw = game.currentMapData.tileWidth;
  const th = game.currentMapData.tileHeight;

  const ptx = px / tw;
  const pty = py / th;

  for (const portal of game.currentPortals) {
    if (
      ptx >= portal.x &&
      ptx < portal.x + portal.width &&
      pty >= portal.y &&
      pty < portal.y + portal.height
    ) {
      console.log(
        `[Portal] HIT "${portal.name}" -> map "${portal.targetMap}" spawn "${portal.targetSpawn}" | isGuest=${game.isGuest}`,
      );
      game.changeMap(portal.targetMap, portal.targetSpawn, portal.direction);
      return;
    }
  }
}
