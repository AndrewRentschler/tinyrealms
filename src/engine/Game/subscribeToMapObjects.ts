import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";
import { refreshMapObjectInstanceCache } from "./refreshMapObjectInstanceCache.ts";
import { reloadPlacedObjects } from "./reloadPlacedObjects.ts";
import type { MapObjectRow } from "./buildStaticObjects.ts";

/**
 * Subscribe to mapObjects table — fires whenever objects are added/removed/moved.
 */
export function subscribeToMapObjects(
  game: IGame,
  mapName: string,
  skipFirst = true,
): void {
  game.mapObjectsUnsub?.();

  const convex = getConvexClient();

  game.mapObjectsFirstCallback = skipFirst;
  game.mapObjectsDirty = false;
  game.mapObjectsUnsub = convex.onUpdate(
    api.mapObjects.listByMap,
    { mapName },
    (objs) => {
      refreshMapObjectInstanceCache(
        game.mapObjectInstanceNameById,
        objs as Array<{ _id: string; instanceName?: string | null }>,
      );
      if (game.mapObjectsFirstCallback) {
        game.mapObjectsFirstCallback = false;
        return;
      }
      if (game.mapObjectsLoading) return;
      if (game.mode === "build") {
        game.mapObjectsDirty = true;
        return;
      }
      console.log(`[MapObjects] Subscription fired: ${objs.length} objects`);
      void reloadPlacedObjects(game, mapName, objs as (MapObjectRow & { instanceName?: string })[]);
    },
    (err) => {
      console.warn("MapObjects subscription error:", err);
    },
  );
}
