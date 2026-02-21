import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";

/**
 * Handle E key press to toggle nearest toggleable object.
 */
export async function handleObjectToggle(
  game: IGame & { toggling: boolean },
): Promise<void> {
  if (game.toggling) return;
  const nearestId = game.objectLayer.getNearestToggleableId();
  if (!nearestId) return;
  const ePressed = game.input.wasJustPressed("e") || game.input.wasJustPressed("E");
  if (!ePressed) return;
  if (game.entityLayer.inDialogue) return;

  (game as { toggling: boolean }).toggling = true;
  try {
    const convex = getConvexClient();
    const result = await convex.mutation(api.mapObjects.toggle, {
      id: nearestId as import("../../../convex/_generated/dataModel").Id<"mapObjects">,
    });
    if (result.success && typeof result.isOn === "boolean") {
      game.objectLayer.applyToggle(nearestId, result.isOn);
    }
  } catch (err) {
    console.warn("Toggle failed:", err);
  }
  (game as { toggling: boolean }).toggling = false;
}
