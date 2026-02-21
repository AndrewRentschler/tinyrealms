import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";
import { refreshMapObjectInstanceCache } from "./refreshMapObjectInstanceCache.ts";
import { buildStaticObjects, type MapObjectRow } from "./buildStaticObjects.ts";

/** Map object from subscription callback. */
type MapObjectSubscriptionRow = MapObjectRow & { instanceName?: string };

/**
 * Reload placed objects when subscription fires.
 * Clears current static objects, then re-renders from data.
 */
export async function reloadPlacedObjects(
  game: IGame,
  mapName: string,
  objs: MapObjectSubscriptionRow[],
): Promise<void> {
  game.mapObjectsLoading = true;
  try {
    const convex = getConvexClient();
    refreshMapObjectInstanceCache(game.mapObjectInstanceNameById, objs);

    const defs = await convex.query(api.spriteDefinitions.list, {});
    game.spriteDefCache = new Map(defs.map((d) => [d.name, d]));

    game.objectLayer.clear();

    const { staticObjs, staticDefs } = buildStaticObjects(
      objs,
      defs as import("./buildStaticObjects.ts").SpriteDefRow[],
    );

    if (staticObjs.length > 0) {
      game.mapRenderer.clearAllCollisionOverrides();
      await game.objectLayer.loadAll(staticObjs, staticDefs);
    }
  } catch (err) {
    console.warn("Failed to reload placed objects:", err);
  } finally {
    game.mapObjectsLoading = false;
  }
}
