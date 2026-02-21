import type { MapData } from "../types.ts";
import type { IGame } from "./types.ts";
import { resolveMapData } from "./resolveMapData.ts";
import { setupObjectLayerForMap } from "./setupObjectLayerForMap.ts";
import { subscribeToMapData } from "./subscribeToMapData.ts";
import { setPlayerSpawnPosition } from "./setPlayerSpawnPosition.ts";
import { DEFAULT_MAP, DEFAULT_MUSIC, FALLBACK_MAP } from "./constants.ts";

/**
 * Load the default map (from profile or fallback).
 */
export async function loadDefaultMap(game: IGame): Promise<void> {
  try {
    const targetMap = game.profile.mapName || DEFAULT_MAP;
    console.log(`Loading map: "${targetMap}" (profile.mapName=${game.profile.mapName})`);

    let mapData: MapData | null = await resolveMapData(targetMap, game);

    if (!mapData && targetMap !== FALLBACK_MAP) {
      mapData = await resolveMapData(FALLBACK_MAP, game);
      if (mapData) console.warn(`Fell back to "${FALLBACK_MAP}" static JSON`);
    }

    if (!mapData) {
      console.warn("No map could be loaded");
      return;
    }

    await game.loadMap(mapData);
    game.currentMapName = mapData.name || DEFAULT_MAP;
    game.currentMapData = mapData;
    game.currentPortals = mapData.portals ?? [];
    game.applyWeatherFromMap(mapData);

    console.log(
      `[Init] Map "${game.currentMapName}" loaded — ${game.currentPortals.length} portals, isGuest=${game.isGuest}`,
      game.currentPortals.map((p) =>
        `"${p.name}" at (${p.x},${p.y}) ${p.width}x${p.height} -> ${p.targetMap}`,
      ),
    );

    setupObjectLayerForMap(game, mapData);
    setPlayerSpawnPosition(game, mapData);

    await subscribeToMapData(game, game.currentMapName, {
      skipFirstMapObjects: true,
    });

    const musicUrl = mapData.musicUrl ?? DEFAULT_MUSIC;
    if (musicUrl) {
      game.audio.loadAndPlay(musicUrl);
    }
  } catch (err) {
    console.warn("Failed to load default map:", err);
  }
}
