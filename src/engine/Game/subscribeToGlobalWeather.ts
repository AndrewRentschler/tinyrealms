import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";

/**
 * Subscribe to global weather state (for scattered_rain maps).
 */
export function subscribeToGlobalWeather(game: IGame): void {
  game.globalWeatherUnsub?.();

  const convex = getConvexClient();

  game.globalWeatherUnsub = convex.onUpdate(
    api.weather.getGlobal,
    {},
    (state) => {
      game.globalRainyNow = !!(state as { rainyNow?: boolean })?.rainyNow;
    },
    (err) => {
      console.warn("Global weather subscription error:", err);
    },
  );
}
