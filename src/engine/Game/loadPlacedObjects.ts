import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";
import { refreshMapObjectInstanceCache } from "./refreshMapObjectInstanceCache.ts";
import { buildStaticObjects, type MapObjectRow } from "./buildStaticObjects.ts";

/**
 * Load placed static objects for a map from Convex.
 * NPCs are handled by the npcState subscription.
 */
export async function loadPlacedObjects(game: IGame, mapName: string): Promise<void> {
  try {
    const convex = getConvexClient();

    const [defs, objs] = await Promise.all([
      convex.query(api.spriteDefinitions.list, {}),
      convex.query(api.mapObjects.listByMap, { mapName }),
    ]);

    refreshMapObjectInstanceCache(
      game.mapObjectInstanceNameById,
      objs as Array<{ _id: string; instanceName?: string | null }>,
    );

    if (objs.length === 0 || defs.length === 0) return;

    console.log(`Loading ${objs.length} placed objects for map "${mapName}"`);

    const { staticObjs, staticDefs } = buildStaticObjects(
      objs as MapObjectRow[],
      defs as import("./buildStaticObjects.ts").SpriteDefRow[],
    );

    if (staticObjs.length > 0) {
      await game.objectLayer.loadAll(staticObjs, staticDefs);
    }
  } catch (err) {
    console.warn("Failed to load placed objects:", err);
  }
}
