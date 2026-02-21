import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";
import { subscribeToGlobalWeather } from "./subscribeToGlobalWeather.ts";
import { PRESENCE_STALE_THRESHOLD_MS } from "./constants.ts";

/**
 * Run Convex mutations and subscriptions after init (weather loop, presence cleanup).
 */
export async function setupPostInitMutations(game: IGame): Promise<void> {
  const convex = getConvexClient();

  if (!game.isGuest) {
    try {
      await convex.mutation(api.weather.ensureLoop, {});
    } catch (e) {
      console.warn("Global weather loop ensure failed:", e);
    }
  }

  subscribeToGlobalWeather(game);

  if (!game.isGuest) {
    try {
      await convex.mutation(api.presence.cleanup, {
        staleThresholdMs: PRESENCE_STALE_THRESHOLD_MS,
      });
    } catch (e) {
      console.warn("Presence cleanup failed (OK on first run):", e);
    }
  }
}
