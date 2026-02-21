import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Delete a storage (cleanup when object removed or for admin) */
export default mutation({
  args: {
    storageId: v.id("storages"),
  },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { success: false, reason: "Not authenticated" };

    const storage = await ctx.db.get(storageId);
    if (!storage) return { success: false, reason: "Storage not found" };

    // Check if storage has items
    if (storage.slots.length > 0) {
      return { success: false, reason: "Cannot delete non-empty storage" };
    }

    await ctx.db.delete(storageId);
    return { success: true };
  },
});
