import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MapData } from "../types.ts";
import type { IGame } from "./types.ts";
import { convexMapToMapData } from "./convexMapToMapData.ts";
import { seedMapToConvex } from "./seedMapToConvex.ts";
import { fadeOverlay } from "./fadeOverlay.ts";
import { loadPlacedObjects } from "./loadPlacedObjects.ts";
import { subscribeToMapObjects } from "./subscribeToMapObjects.ts";
import { loadWorldItems } from "./loadWorldItems.ts";
import { subscribeToWorldItems } from "./subscribeToWorldItems.ts";
import { loadSpriteDefs } from "./loadSpriteDefs.ts";
import { subscribeToNpcState } from "./subscribeToNpcState.ts";

type GameWithSubs = IGame & {
  mapObjectsUnsub: (() => void) | null;
  worldItemsUnsub: (() => void) | null;
  npcStateUnsub: (() => void) | null;
  changingMap: boolean;
  _portalEmptyWarned?: boolean;
};

/**
 * Change to a different map. Handles unloading, loading, fade transition,
 * and resubscribing to all Convex queries.
 */
export async function changeMap(
  game: GameWithSubs,
  targetMapName: string,
  spawnLabel: string,
  direction?: string,
): Promise<void> {
  if (game.changingMap) return;
  (game as { changingMap: boolean }).changingMap = true;
  (game as { _portalEmptyWarned?: boolean })._portalEmptyWarned = false;

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
    (game as { mapObjectsUnsub: null }).mapObjectsUnsub = null;
    game.worldItemsUnsub?.();
    (game as { worldItemsUnsub: null }).worldItemsUnsub = null;
    game.npcStateUnsub?.();
    (game as { npcStateUnsub: null }).npcStateUnsub = null;

    game.worldItemLayer.clear();
    game.objectLayer.clear();
    (game.entityLayer as { removeAllPlacedNPCs: () => void }).removeAllPlacedNPCs();

    let mapData: MapData | null = null;
    try {
      const saved = await convex.query(api.maps.getByName, { name: targetMapName });
      if (saved) {
        mapData = convexMapToMapData(saved as Record<string, unknown>);
      }
    } catch {
      /* ignore */
    }

    if (!mapData) {
      try {
        const resp = await fetch(`/assets/maps/${targetMapName}.json`);
        if (resp.ok) {
          mapData = (await resp.json()) as MapData;
          mapData.portals = mapData.portals ?? [];
          if (!game.isGuest) {
            seedMapToConvex(game, mapData).catch((e) =>
              console.warn("Failed to seed map to Convex:", e),
            );
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (!mapData) {
      console.warn(`[MapChange] ABORT: map "${targetMapName}" not found anywhere`);
      await fadeOverlay(game, false);
      (game as { changingMap: boolean }).changingMap = false;
      return;
    }

    await game.loadMap(mapData);
    (game as { currentMapName: string }).currentMapName = mapData.name;
    (game as { currentMapData: MapData | null }).currentMapData = mapData;
    (game as { currentPortals: MapData["portals"] }).currentPortals = mapData.portals ?? [];
    game.applyWeatherFromMap(mapData);

    (game.mapRenderer as { clearAllCollisionOverrides: () => void }).clearAllCollisionOverrides();
    game.objectLayer.tileWidth = mapData.tileWidth;
    game.objectLayer.tileHeight = mapData.tileHeight;
    game.objectLayer.onDoorCollisionChange = (tiles, blocked) => {
      for (const t of tiles) {
        game.mapRenderer.setCollisionOverride(t.x, t.y, blocked);
      }
    };

    const spawn = mapData.labels?.find((l) => l.name === spawnLabel) ?? mapData.labels?.[0];
    if (spawn) {
      game.entityLayer.playerX = spawn.x * mapData.tileWidth + mapData.tileWidth / 2;
      game.entityLayer.playerY = spawn.y * mapData.tileHeight + mapData.tileHeight / 2;
    }
    if (direction) {
      (game.entityLayer as { playerDirection: string }).playerDirection = direction;
    }

    const mapName = mapData.name;
    await loadPlacedObjects(game, mapName);
    subscribeToMapObjects(game as unknown as Parameters<typeof subscribeToMapObjects>[0], mapName);

    await loadWorldItems(game, mapName);
    subscribeToWorldItems(game as Parameters<typeof subscribeToWorldItems>[0], mapName);

    await loadSpriteDefs(game);
    subscribeToNpcState(game as Parameters<typeof subscribeToNpcState>[0], mapName);

    game.stopPresence();
    game.startPresence();

    if (!game.isGuest) {
      await convex.mutation(api.npcEngine.ensureLoop, {}).catch(() => {});
    }

    const newMusic = mapData.musicUrl ?? "/assets/audio/cozy.m4a";
    game.audio.loadAndPlay(newMusic);

    game.onMapChanged?.(mapName);

    await fadeOverlay(game, false);
  } catch (err) {
    console.error("[MapChange] FAILED at some step:", err);
    await fadeOverlay(game, false);
  }

  (game as { changingMap: boolean }).changingMap = false;
}
