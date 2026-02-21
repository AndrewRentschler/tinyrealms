import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";
import { mapWorldItems } from "./mapWorldItems.ts";

/**
 * Load world items (pickups) for a map from Convex.
 */
export async function loadWorldItems(game: IGame, mapName: string): Promise<void> {
  try {
    const convex = getConvexClient();
    const result = await convex.query(api.worldItems.listByMap, { mapName });
    game.worldItemLayer.clear();
    await game.worldItemLayer.loadAll(mapWorldItems(result.items), result.defs);
    console.log(`[WorldItems] Loaded ${result.items.length} items on "${mapName}"`);
  } catch (err) {
    console.warn("Failed to load world items:", err);
  }
}
