import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getConvexClient } from "../../lib/convexClient.ts";
import type { MapData, MapLayerType } from "../types.ts";
import type { IGame } from "./types.ts";

/**
 * Seed a static JSON map into Convex (so future loads come from there).
 */
export async function seedMapToConvex(
  game: IGame,
  mapData: MapData,
): Promise<void> {
  const convex = getConvexClient();
  const existing = await convex.query(api.maps.queries.getByName, {
    name: mapData.name,
  });
  if (existing) {
    console.warn(
      `Skipping seed for "${mapData.name}" (already exists in Convex)`,
    );
    return;
  }
  const profileId = game.profile._id as Id<"profiles">;
  await convex.mutation(api.maps.mutations.saveFullMap, {
    profileId,
    name: mapData.name,
    width: mapData.width,
    height: mapData.height,
    tileWidth: mapData.tileWidth,
    tileHeight: mapData.tileHeight,
    tilesetUrl: mapData.tilesetUrl,
    tilesetPxW: mapData.tilesetPxW,
    tilesetPxH: mapData.tilesetPxH,
    layers: mapData.layers.map((l) => ({
      name: l.name,
      type: l.type as MapLayerType,
      tiles: JSON.stringify(l.tiles),
      visible: l.visible,
      tilesetUrl: l.tilesetUrl,
    })),
    collisionMask: JSON.stringify(mapData.collisionMask),
    labels: mapData.labels.map((l) => ({
      name: l.name,
      x: l.x,
      y: l.y,
      width: l.width ?? 1,
      height: l.height ?? 1,
    })),
    portals: (mapData.portals ?? []).map((p) => ({
      name: p.name,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      targetMap: p.targetMap,
      targetSpawn: p.targetSpawn,
      direction: p.direction,
      transition: p.transition,
    })),
    ...(mapData.animationUrl ? { animationUrl: mapData.animationUrl } : {}),
    musicUrl: mapData.musicUrl,
    weatherMode: mapData.weatherMode,
    weatherIntensity: mapData.weatherIntensity,
    weatherRainSfx: mapData.weatherRainSfx,
    weatherLightningEnabled: mapData.weatherLightningEnabled,
    weatherLightningChancePerSec: mapData.weatherLightningChancePerSec,
    combatEnabled: mapData.combatEnabled,
    combatSettings: mapData.combatSettings,
    status: mapData.status ?? "published",
    mapType: "system",
  });
  console.log(`Map "${mapData.name}" seeded to Convex as system map`);
}
