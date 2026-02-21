import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { MapData } from "../types.ts";
import type { IGame } from "./types.ts";
import { convexMapToMapData } from "./convexMapToMapData.ts";
import { seedMapToConvex } from "./seedMapToConvex.ts";
import { loadPlacedObjects } from "./loadPlacedObjects.ts";
import { subscribeToMapObjects } from "./subscribeToMapObjects.ts";
import { loadWorldItems } from "./loadWorldItems.ts";
import { subscribeToWorldItems } from "./subscribeToWorldItems.ts";
import { loadSpriteDefs } from "./loadSpriteDefs.ts";
import { subscribeToNpcState } from "./subscribeToNpcState.ts";

/**
 * Load the default map (from profile or fallback).
 */
export async function loadDefaultMap(game: IGame & {
  objectLayer: { tileWidth: number; tileHeight: number; onDoorCollisionChange: ((tiles: Array<{ x: number; y: number }>, blocked: boolean) => void) | null };
  mapRenderer: { setCollisionOverride: (x: number, y: number, blocked: boolean) => void };
}): Promise<void> {
  try {
    let mapData: MapData | null = null;

    const targetMap = game.profile.mapName || "Cozy Cabin";
    console.log(`Loading map: "${targetMap}" (profile.mapName=${game.profile.mapName})`);

    try {
      const convex = getConvexClient();
      const saved = await convex.query(api.maps.getByName, { name: targetMap });
      if (saved) {
        console.log(`[loadDefaultMap] found "${targetMap}" in Convex (id: ${saved._id})`);
        mapData = convexMapToMapData(saved as Record<string, unknown>);
      } else {
        console.warn(`[loadDefaultMap] Convex returned null for "${targetMap}" — map not found by that name`);
      }
    } catch (convexErr) {
      console.error(`[loadDefaultMap] Convex query FAILED for "${targetMap}":`, convexErr);
    }

    if (!mapData) {
      const resp = await fetch(`/assets/maps/${targetMap}.json`);
      if (resp.ok) {
        mapData = (await resp.json()) as MapData;
        mapData.portals = mapData.portals ?? [];
        console.warn(`Loaded map "${targetMap}" from static JSON (Convex missing/unavailable)`);
        if (!game.isGuest) {
          seedMapToConvex(game, mapData).catch((e) =>
            console.warn("Failed to seed map to Convex:", e),
          );
        }
      } else {
        console.warn(`Static JSON not found for map "${targetMap}" (status ${resp.status})`);
      }
    }

    if (!mapData && targetMap !== "cozy-cabin") {
      const resp = await fetch("/assets/maps/cozy-cabin.json");
      if (resp.ok) {
        mapData = (await resp.json()) as MapData;
        console.warn(`Fell back to "cozy-cabin" static JSON`);
      } else {
        console.warn(`Static fallback map JSON not found (status ${resp.status})`);
      }
    }

    if (!mapData) {
      console.warn("No map could be loaded");
      return;
    }

    await game.loadMap(mapData);
    (game as { currentMapName: string }).currentMapName = mapData.name || "Cozy Cabin";
    (game as { currentMapData: MapData | null }).currentMapData = mapData;
    (game as { currentPortals: MapData["portals"] }).currentPortals = mapData.portals ?? [];
    game.applyWeatherFromMap(mapData);
    console.log(
      `[Init] Map "${(game as { currentMapName: string }).currentMapName}" loaded — ${(game as { currentPortals: MapData["portals"] }).currentPortals.length} portals, isGuest=${game.isGuest}`,
      (game as { currentPortals: MapData["portals"] }).currentPortals.map((p) =>
        `"${p.name}" at (${p.x},${p.y}) ${p.width}x${p.height} -> ${p.targetMap}`,
      ),
    );

    game.objectLayer.tileWidth = mapData.tileWidth;
    game.objectLayer.tileHeight = mapData.tileHeight;
    game.objectLayer.onDoorCollisionChange = (tiles, blocked) => {
      for (const t of tiles) {
        if (blocked) {
          game.mapRenderer.setCollisionOverride(t.x, t.y, true);
        } else {
          game.mapRenderer.setCollisionOverride(t.x, t.y, false);
        }
      }
    };

    if (
      game.profile.mapName === (game as { currentMapName: string }).currentMapName &&
      game.profile.x != null &&
      game.profile.y != null
    ) {
      game.entityLayer.playerX = game.profile.x;
      game.entityLayer.playerY = game.profile.y;
      if (game.profile.direction) {
        (game.entityLayer as { playerDirection: string }).playerDirection = game.profile.direction;
      }
    } else {
      const preferredStartLabel = game.profile.startLabel || "start1";
      const startLabel =
        mapData.labels?.find((l: { name: string }) => l.name === preferredStartLabel) ??
        mapData.labels?.find((l: { name: string }) => l.name === "start1") ??
        mapData.labels?.[0];
      if (startLabel && game.entityLayer) {
        game.entityLayer.playerX =
          startLabel.x * mapData.tileWidth + mapData.tileWidth / 2;
        game.entityLayer.playerY =
          startLabel.y * mapData.tileHeight + mapData.tileHeight / 2;
      }
    }

    const mapName = (game as { currentMapName: string }).currentMapName;
    await loadPlacedObjects(game, mapName);
    subscribeToMapObjects(game as Parameters<typeof subscribeToMapObjects>[0], mapName);

    await loadWorldItems(game, mapName);
    subscribeToWorldItems(game as Parameters<typeof subscribeToWorldItems>[0], mapName);

    await loadSpriteDefs(game);
    subscribeToNpcState(game as Parameters<typeof subscribeToNpcState>[0], mapName);

    if (!game.isGuest) {
      try {
        const convex = getConvexClient();
        await convex.mutation(api.npcEngine.ensureLoop, {});
      } catch (e) {
        console.warn("NPC ensureLoop failed (OK on first run):", e);
      }
    }

    const musicUrl = mapData.musicUrl ?? "/assets/audio/cozy.m4a";
    if (musicUrl) {
      game.audio.loadAndPlay(musicUrl);
    }
  } catch (err) {
    console.warn("Failed to load default map:", err);
  }
}
