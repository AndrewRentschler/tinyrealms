import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ownerTypeValidator } from "./Storage.ts";

/** Create a new storage instance */
export default mutation({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.optional(v.id("profiles")),
    capacity: v.number(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { ownerType, ownerId, capacity, name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Validate ownerId if player-owned
    if (ownerType === "player" && ownerId) {
      const profile = await ctx.db.get(ownerId);
      if (!profile || profile.userId !== userId) {
        throw new Error("Cannot create storage for another player");
      }
    }

    const id = await ctx.db.insert("storages", {
      ownerType,
      ownerId,
      capacity,
      slots: [],
      name,
      updatedAt: Date.now(),
    });

    return id;
  },
});
