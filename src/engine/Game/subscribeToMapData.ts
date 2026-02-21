import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";
import { loadPlacedObjects } from "./loadPlacedObjects.ts";
import { subscribeToMapObjects } from "./subscribeToMapObjects.ts";
import { loadWorldItems } from "./loadWorldItems.ts";
import { subscribeToWorldItems } from "./subscribeToWorldItems.ts";
import { loadSpriteDefs } from "./loadSpriteDefs.ts";
import { subscribeToNpcState } from "./subscribeToNpcState.ts";

/**
 * Load and subscribe to all map-dependent Convex data.
 * Call after loadMap when switching maps.
 */
export async function subscribeToMapData(
  game: IGame,
  mapName: string,
  options?: { skipFirstMapObjects?: boolean },
): Promise<void> {
  await loadPlacedObjects(game, mapName);
  subscribeToMapObjects(game, mapName, options?.skipFirstMapObjects ?? true);

  await loadWorldItems(game, mapName);
  subscribeToWorldItems(game, mapName);

  await loadSpriteDefs(game);
  subscribeToNpcState(game, mapName);

  if (!game.isGuest) {
    try {
      const convex = getConvexClient();
      await convex.mutation(api.npcEngine.ensureLoop, {});
    } catch (e) {
      console.warn("NPC ensureLoop failed (OK on first run):", e);
    }
  }
}
