import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { IGame } from "./types.ts";
import { resolveMapData } from "./resolveMapData.ts";
import { fadeOverlay } from "./fadeOverlay.ts";
import { setupObjectLayerForMap } from "./setupObjectLayerForMap.ts";
import { subscribeToMapData } from "./subscribeToMapData.ts";
import { setPlayerSpawnPosition } from "./setPlayerSpawnPosition.ts";
import { DEFAULT_MUSIC } from "./constants.ts";

/**
 * Change to a different map. Handles unloading, loading, fade transition,
 * and resubscribing to all Convex queries.
 */
export async function changeMap(
  game: IGame,
  targetMapName: string,
  spawnLabel: string,
  direction?: string,
): Promise<void> {
  if (game.changingMap) return;
  game.changingMap = true;
  game.portalEmptyWarned = false;

  console.log(`[MapChange] ${game.currentMapName} -> ${targetMapName} (spawn: ${spawnLabel}, isGuest: ${game.isGuest})`);

  const convex = getConvexClient();

  try {
    await fadeOverlay(game, true);

    if (!game.isGuest) {
      const profileId = game.profile._id as Id<"profiles">;
      const pos = game.entityLayer.getPlayerPosition();
      await convex.mutation(api.profiles.savePosition, {
        id: profileId,
        mapName: game.currentMapName,
        x: pos.x,
        y: pos.y,
        direction: pos.direction,
      }).catch(() => {});
    }

    game.mapObjectsUnsub?.();
    game.mapObjectsUnsub = null;
    game.worldItemsUnsub?.();
    game.worldItemsUnsub = null;
    game.npcStateUnsub?.();
    game.npcStateUnsub = null;

    game.worldItemLayer.clear();
    game.objectLayer.clear();
    (game.entityLayer as { removeAllPlacedNPCs: () => void }).removeAllPlacedNPCs();

    const mapData = await resolveMapData(targetMapName, game);

    if (!mapData) {
      console.warn(`[MapChange] ABORT: map "${targetMapName}" not found anywhere`);
      await fadeOverlay(game, false);
      game.changingMap = false;
      return;
    }

    await game.loadMap(mapData);
    game.currentMapName = mapData.name;
    game.currentMapData = mapData;
    game.currentPortals = mapData.portals ?? [];
    game.applyWeatherFromMap(mapData);

    game.mapRenderer.clearAllCollisionOverrides();
    setupObjectLayerForMap(game, mapData);
    setPlayerSpawnPosition(game, mapData, { spawnLabel, direction });

    const mapName = mapData.name;
    await subscribeToMapData(game, mapName);

    game.stopPresence();
    game.startPresence();

    game.audio.loadAndPlay(mapData.musicUrl ?? DEFAULT_MUSIC);

    game.onMapChanged?.(mapName);

    await fadeOverlay(game, false);
  } catch (err) {
    console.error("[MapChange] FAILED at some step:", err);
    await fadeOverlay(game, false);
  }

  game.changingMap = false;
}
