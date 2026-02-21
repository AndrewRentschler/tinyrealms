import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import { DEFAULT_ITEM_PICKUP_SFX } from "../../config/audio-config.ts";
import type { IGame } from "./types.ts";
import { showPickupNotification } from "./showPickupNotification.ts";

/**
 * Handle E key press to pick up nearest world item.
 */
export async function handleItemPickup(
  game: IGame & { pickingUp: boolean },
): Promise<void> {
  if (game.pickingUp) return;
  const nearestId = game.worldItemLayer.getNearestItemId();
  if (!nearestId) return;
  if (!(game.input.wasJustPressed("e") || game.input.wasJustPressed("E"))) return;
  if (game.entityLayer.inDialogue) return;

  (game as { pickingUp: boolean }).pickingUp = true;
  try {
    const convex = getConvexClient();
    const result = await convex.mutation(api.worldItems.pickup, {
      profileId: game.profile._id as import("../../../convex/_generated/dataModel").Id<"profiles">,
      worldItemId: nearestId as import("../../../convex/_generated/dataModel").Id<"worldItems">,
    });
    if (result.success && result.itemName && typeof result.quantity === "number") {
      const name = game.worldItemLayer.getNearestItemName() ?? result.itemName;
      console.log(`[Pickup] Got ${result.quantity}x ${name}`);
      const pickupSfx =
        game.worldItemLayer.getNearestItemPickupSoundUrl() ||
        result.pickupSoundUrl ||
        DEFAULT_ITEM_PICKUP_SFX;
      game.audio.playOneShot(pickupSfx, 0.7);
      showPickupNotification(`+${result.quantity} ${name}`);
      game.worldItemLayer.markPickedUp(nearestId, !!result.respawns);
      const existing = game.profile.items.find((i) => i.name === result.itemName);
      if (existing) {
        existing.quantity += result.quantity;
      } else {
        game.profile.items.push({ name: result.itemName, quantity: result.quantity });
      }
    } else {
      console.log(`[Pickup] Failed: ${result.reason}`);
    }
  } catch (err) {
    console.warn("Pickup failed:", err);
  }
  (game as { pickingUp: boolean }).pickingUp = false;
}
