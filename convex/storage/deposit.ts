import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Deposit item from player inventory to storage */
export default mutation({
  args: {
    storageId: v.id("storages"),
    profileId: v.id("profiles"),
    itemDefName: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, { storageId, profileId, itemDefName, quantity }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { success: false, reason: "Not authenticated" };

    if (quantity <= 0 || !Number.isInteger(quantity)) {
      return { success: false, reason: "Invalid quantity" };
    }

    // Get storage
    const storage = await ctx.db.get(storageId);
    if (!storage) return { success: false, reason: "Storage not found" };

    // Verify access
    if (storage.ownerType === "player" && storage.ownerId !== profileId) {
      return { success: false, reason: "Access denied" };
    }

    // Get player inventory
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      return { success: false, reason: "Invalid profile" };
    }

    // Check if player has item
    const playerItems = [...profile.items];
    const itemIdx = playerItems.findIndex(i => i.name === itemDefName);
    if (itemIdx < 0 || playerItems[itemIdx].quantity < quantity) {
      return { success: false, reason: "Insufficient items" };
    }

    // Get item def for stacking info
    const itemDef = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", q => q.eq("name", itemDefName))
      .first();

    // Check capacity
    const storageSlots = [...storage.slots];
    const occupiedSlots = storageSlots.length;
    const existingSlotIdx = itemDef?.stackable
      ? storageSlots.findIndex(s => s.itemDefName === itemDefName)
      : -1;

    if (existingSlotIdx < 0 && occupiedSlots >= storage.capacity) {
      return { success: false, reason: "Storage full" };
    }

    // Remove from player
    playerItems[itemIdx].quantity -= quantity;
    if (playerItems[itemIdx].quantity <= 0) {
      playerItems.splice(itemIdx, 1);
    }

    // Add to storage
    if (existingSlotIdx >= 0) {
      storageSlots[existingSlotIdx].quantity += quantity;
    } else {
      storageSlots.push({ itemDefName, quantity, metadata: {} });
    }

    // Save both
    await ctx.db.patch(profileId, { items: playerItems });
    await ctx.db.patch(storageId, { slots: storageSlots, updatedAt: Date.now() });

    return { success: true };
  },
});
