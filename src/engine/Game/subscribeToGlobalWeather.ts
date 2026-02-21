import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";

export type Unsubscriber = () => void;

/**
 * Subscribe to global weather state (for scattered_rain maps).
 */
export function subscribeToGlobalWeather(
  game: { globalWeatherUnsub: Unsubscriber | null; globalRainyNow: boolean },
): void {
  game.globalWeatherUnsub?.();

  const convex = getConvexClient();

  (game as { globalWeatherUnsub: Unsubscriber }).globalWeatherUnsub = convex.onUpdate(
    api.weather.getGlobal,
    {},
    (state) => {
      (game as { globalRainyNow: boolean }).globalRainyNow = !!(state as { rainyNow?: boolean })?.rainyNow;
    },
    (err) => {
      console.warn("Global weather subscription error:", err);
    },
  );
}
