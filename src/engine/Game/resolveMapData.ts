import { api } from "../../../convex/_generated/api";
import { getConvexClient } from "../../lib/convexClient.ts";
import type { MapData } from "../types.ts";
import { convexMapToMapData, type ConvexMapDoc } from "./convexMapToMapData.ts";
import { seedMapToConvex } from "./seedMapToConvex.ts";
import type { IGame } from "./types.ts";

/**
 * Resolve map data from Convex or static JSON.
 * Tries Convex first, then static JSON, optionally seeding to Convex.
 */
export async function resolveMapData(
  mapName: string,
  game: IGame,
): Promise<MapData | null> {
  if (mapName === "global") {
    return {
      name: "global",
      width: 0,
      height: 0,
      tileWidth: 32,
      tileHeight: 32,
      tilesetPxW: 32,
      tilesetPxH: 32,
      layers: [
        { name: "bg", type: "bg", tiles: "", visible: false },
        { name: "obj", type: "obj", tiles: "", visible: false },
        { name: "overlay", type: "overlay", tiles: "", visible: false },
      ],
      collisionMask: "",
      labels: [],
      portals: [],
    } as unknown as MapData;
  }

  const convex = getConvexClient();

  try {
    const saved = await convex.query(api.maps.queries.getByName, {
      name: mapName,
    });
    if (saved) {
      return convexMapToMapData(saved as ConvexMapDoc);
    }
  } catch {}

  const resp = await fetch(`/assets/maps/${mapName}.json`);
  if (!resp.ok) return null;

  const mapData = (await resp.json()) as MapData;
  mapData.portals = mapData.portals ?? [];

  if (!game.isGuest) {
    seedMapToConvex(game, mapData).catch((e) =>
      console.warn("Failed to seed map to Convex:", e),
    );
  }

  return mapData;
}
