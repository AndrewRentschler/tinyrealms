import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";
import { mapWorldItems } from "./mapWorldItems.ts";

/**
 * Subscribe to world items for a map.
 */
export function subscribeToWorldItems(game: IGame, mapName: string): void {
  game.worldItemsUnsub?.();

  const convex = getConvexClient();
  let firstFire = true;

  game.worldItemsUnsub = convex.onUpdate(
    api.worldItems.listByMap,
    { mapName },
    async (result) => {
      if (firstFire) {
        firstFire = false;
        return;
      }
      if (game.mode === "build") return;
      console.log(`[WorldItems] Subscription fired: ${result.items.length} items`);
      game.worldItemLayer.clear();
      await game.worldItemLayer.loadAll(mapWorldItems(result.items), result.defs);
    },
    (err) => {
      console.warn("WorldItems subscription error:", err);
    },
  );
}
