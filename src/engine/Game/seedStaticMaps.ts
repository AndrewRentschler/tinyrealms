import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { MapData } from "../types.ts";
import type { IGame } from "./types.ts";
import { STATIC_MAPS } from "./constants.ts";
import { seedMapToConvex } from "./seedMapToConvex.ts";

/**
 * Check each known static map — if it doesn't exist in Convex yet,
 * seed it from the static JSON file. Maps that already exist in Convex
 * are never overwritten — the database is the source of truth once seeded.
 *
 * Static maps ship WITHOUT portals — portals are created in-game via
 * the map editor and stored only in Convex.
 */
export async function seedStaticMaps(game: IGame): Promise<void> {
  const convex = getConvexClient();
  for (const name of STATIC_MAPS) {
    try {
      const existing = await convex.query(api.maps.getByName, { name });
      if (existing) continue;

      const resp = await fetch(`/assets/maps/${name}.json`);
      if (!resp.ok) continue;

      const mapData = (await resp.json()) as MapData;
      mapData.portals = mapData.portals ?? [];

      console.log(`Seeding static map "${name}" into Convex...`);
      await seedMapToConvex(game, mapData);
    } catch (err) {
      console.warn(`Failed to seed static map "${name}":`, err);
    }
  }
}
