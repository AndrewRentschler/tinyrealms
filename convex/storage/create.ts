import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ownerTypeValidator } from "./storage.ts";

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

    // Validate capacity
    if (capacity <= 0 || capacity > 100) {
      throw new Error("Capacity must be between 1 and 100");
    }

    // Validate ownerId is required for player-owned storage
    if (ownerType === "player" && !ownerId) {
      throw new Error("ownerId is required for player-owned storage");
    }

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
