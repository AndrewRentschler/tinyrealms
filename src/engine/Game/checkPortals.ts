import type { IGame } from "./types.ts";
import type { Portal } from "../types.ts";
import { usePortalRegistryTransition } from "./usePortalRegistryTransition.ts";

function isPlayerInPortal(game: IGame, portal: Portal): boolean {
  if (!game.currentMapData) return false;

  const px = game.entityLayer.playerX;
  const py = game.entityLayer.playerY;
  const tw = game.currentMapData.tileWidth;
  const th = game.currentMapData.tileHeight;
  const ptx = px / tw;
  const pty = py / th;

  return (
    ptx >= portal.x &&
    ptx < portal.x + portal.width &&
    pty >= portal.y &&
    pty < portal.y + portal.height
  );
}

async function runLegacyPortalTransition(game: IGame, portal: Portal): Promise<void> {
  console.log(
    `[Portal] HIT "${portal.name}" -> map "${portal.targetMap}" spawn "${portal.targetSpawn}" | isGuest=${game.isGuest}`,
  );
  await game.changeMap(portal.targetMap, portal.targetSpawn, portal.direction);
}

async function runPortalRegistryTransition(game: IGame, portal: Portal): Promise<void> {
  if (!portal.portalId || game.isGuest) {
    await runLegacyPortalTransition(game, portal);
    return;
  }

  try {
    const transition = await usePortalRegistryTransition(game, portal.portalId);
    const result = transition as {
      dimensionType?: string;
      mapName?: string;
      spawnLabel?: string;
      direction?: string;
      x?: number;
      y?: number;
    };

    if (result.dimensionType === "instance" && typeof result.mapName === "string") {
      const spawnLabel =
        typeof result.spawnLabel === "string" ? result.spawnLabel : portal.targetSpawn;
      const direction =
        typeof result.direction === "string" ? result.direction : portal.direction;
      await game.changeMap(result.mapName, spawnLabel, direction);
      return;
    }

    if (result.dimensionType === "global") {
      const direction =
        typeof result.direction === "string" ? result.direction : portal.direction;
      const globalCoords = result.x !== undefined && result.y !== undefined ? { x: result.x, y: result.y } : undefined;
      await game.changeMap("global", "", direction, globalCoords);
      return;
    }

    console.error(
      `[Portal] Registry transition returned unsupported destination (dimensionType=${result.dimensionType}). Global renderer not yet wired. DB state has moved, client is stuck.`,
      result,
    );
    // Do NOT fall back to legacy here, because the DB transaction already committed the dimension change!
    return;
  } catch (error) {
    console.warn(
      `[Portal] Registry transition mutation failed for portalId="${portal.portalId}"; falling back to legacy map transition`,
      error,
    );
  }

  await runLegacyPortalTransition(game, portal);
}

/**
 * Check if the player is standing in a portal zone and trigger map change.
 */
export function checkPortals(game: IGame): void {
  if (game.changingMap || game.portalTransitionInFlight) return;
  if (game.currentPortals.length === 0) {
    if (!game.portalEmptyWarned) {
      console.warn("[Portal:check] No portals on current map:", game.currentMapName);
      game.portalEmptyWarned = true;
    }
    return;
  }

  for (const portal of game.currentPortals) {
    if (isPlayerInPortal(game, portal)) {
      game.portalTransitionInFlight = true;
      void runPortalRegistryTransition(game, portal).finally(() => {
        game.portalTransitionInFlight = false;
      });
      return;
    }
  }
}
