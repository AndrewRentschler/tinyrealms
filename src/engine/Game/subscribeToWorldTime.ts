import { api } from "../../../convex/_generated/api";
import { getConvexClient } from "../../lib/convexClient.ts";
import type { IGame, WorldTimeState } from "./types.ts";

function normalizeWorldTimeState(
  state: Partial<WorldTimeState> | null | undefined,
): WorldTimeState {
  return {
    key: state?.key ?? "global",
    currentTime: typeof state?.currentTime === "number" ? state.currentTime : 12,
    dayNumber: typeof state?.dayNumber === "number" ? state.dayNumber : 0,
    timeScale: typeof state?.timeScale === "number" ? state.timeScale : 60,
    isPaused: !!state?.isPaused,
    updatedAt: typeof state?.updatedAt === "number" ? state.updatedAt : 0,
    lastTickAt: typeof state?.lastTickAt === "number" ? state.lastTickAt : 0,
  };
}

/**
 * Subscribe to global world time state for future day/night features.
 */
export function subscribeToWorldTime(game: IGame): void {
  game.worldTimeUnsub?.();

  const convex = getConvexClient();

  game.worldTimeUnsub = convex.onUpdate(
    api.worldTime.getGlobal,
    {},
    (state) => {
      game.worldTime = normalizeWorldTimeState(
        (state ?? null) as Partial<WorldTimeState> | null,
      );
    },
    (err) => {
      console.warn("World time subscription error:", err);
    },
  );
}
