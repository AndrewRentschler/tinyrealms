import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Withdraw item from storage to player inventory */
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

    // Get storage
    const storage = await ctx.db.get(storageId);
    if (!storage) return { success: false, reason: "Storage not found" };

    // Get profile first
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      return { success: false, reason: "Invalid profile" };
    }

    // Verify access
    if (storage.ownerType === "player") {
      if (storage.ownerId !== profileId) {
        return { success: false, reason: "Access denied" };
      }
    } else if (storage.ownerType !== "public") {
      return { success: false, reason: "Unsupported storage type" };
    }
    // Public storage: any authenticated user can access

    // Check if storage has item
    const storageSlots = [...storage.slots];
    const slotIdx = storageSlots.findIndex(s => s.itemDefName === itemDefName);
    if (slotIdx < 0 || storageSlots[slotIdx].quantity < quantity) {
      return { success: false, reason: "Insufficient items in storage" };
    }

    // Get item def for stacking
    const itemDef = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", q => q.eq("name", itemDefName))
      .first();
    if (!itemDef) {
      return { success: false, reason: "Item definition not found" };
    }

    // Remove from storage
    storageSlots[slotIdx].quantity -= quantity;
    if (storageSlots[slotIdx].quantity <= 0) {
      storageSlots.splice(slotIdx, 1);
    }

    // Add to player inventory
    const playerItems = [...profile.items];
    const existingIdx = itemDef.stackable
      ? playerItems.findIndex(i => i.name === itemDefName)
      : -1;

    if (existingIdx >= 0) {
      playerItems[existingIdx].quantity += quantity;
    } else {
      playerItems.push({ name: itemDefName, quantity });
    }

    // Save both
    await ctx.db.patch(storageId, { slots: storageSlots, updatedAt: Date.now() });
    await ctx.db.patch(profileId, { items: playerItems });

    return { success: true };
  },
});
