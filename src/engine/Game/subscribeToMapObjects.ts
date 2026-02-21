import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { SpriteDefInfo } from "../ObjectLayer.ts";
import type { IGame } from "./types.ts";
import { refreshMapObjectInstanceCache } from "./refreshMapObjectInstanceCache.ts";
import { reloadPlacedObjects } from "./reloadPlacedObjects.ts";

export type Unsubscriber = () => void;

/**
 * Subscribe to mapObjects table — fires whenever objects are added/removed/moved.
 */
export function subscribeToMapObjects(
  game: IGame & {
    mapObjectsUnsub: Unsubscriber | null;
    mapObjectsFirstCallback: boolean;
    mapObjectsDirty: boolean;
    mapObjectsLoading: boolean;
    mode: string;
  },
  mapName: string,
  skipFirst = true,
): void {
  game.mapObjectsUnsub?.();

  const convex = getConvexClient();

  (game as { mapObjectsFirstCallback: boolean }).mapObjectsFirstCallback = skipFirst;
  (game as { mapObjectsDirty: boolean }).mapObjectsDirty = false;
  (game as { mapObjectsUnsub: Unsubscriber | null }).mapObjectsUnsub = convex.onUpdate(
    api.mapObjects.listByMap,
    { mapName },
    (objs) => {
      refreshMapObjectInstanceCache(game.mapObjectInstanceNameById, objs as Array<{ _id: string; instanceName?: string | null }>);
      if (game.mapObjectsFirstCallback) {
        (game as { mapObjectsFirstCallback: boolean }).mapObjectsFirstCallback = false;
        return;
      }
      if (game.mapObjectsLoading) return;
      if (game.mode === "build") {
        (game as { mapObjectsDirty: boolean }).mapObjectsDirty = true;
        return;
      }
      console.log(`[MapObjects] Subscription fired: ${objs.length} objects`);
      reloadPlacedObjects(game, mapName, objs as Array<{
        _id: string;
        spriteDefName: string;
        x: number;
        y: number;
        layer?: number;
        isOn?: boolean;
        instanceName?: string;
      }>);
    },
    (err) => {
      console.warn("MapObjects subscription error:", err);
    },
  );
}
