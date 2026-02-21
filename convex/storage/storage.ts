import { v } from "convex/values";
import { query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ---------------------------------------------------------------------------
// Shared Validators (exported for reuse in mutation files)
// ---------------------------------------------------------------------------

export const storageSlotValidator = v.object({
  itemDefName: v.string(),
  quantity: v.number(),
  metadata: v.optional(v.record(v.string(), v.string())),
});

export const ownerTypeValidator = v.union(v.literal("public"), v.literal("player"));

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Get storage by ID */
export const get = query({
  args: { storageId: v.id("storages") },
  handler: async (ctx, { storageId }) => {
    return await ctx.db.get(storageId);
  },
});

/** Check if player can access storage */
export const canAccess = query({
  args: { 
    storageId: v.id("storages"),
    profileId: v.id("profiles"),
  },
  handler: async (ctx, { storageId, profileId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    
    const storage = await ctx.db.get(storageId);
    if (!storage) return false;
    
    // Public storage: any authenticated user
    if (storage.ownerType === "public") {
      const profile = await ctx.db.get(profileId);
      return profile?.userId === userId;
    }
    
    // Player storage: only owner (and must be requesting user's profile)
    if (storage.ownerType === "player") {
      const profile = await ctx.db.get(profileId);
      if (!profile || profile.userId !== userId) return false;
      return storage.ownerId === profileId;
    }
    
    return false;
  },
});

/** List storages by owner */
export const listByOwner = query({
  args: { 
    ownerType: ownerTypeValidator,
    ownerId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, { ownerType, ownerId }) => {
    return await ctx.db
      .query("storages")
      .withIndex("by_owner", (q) => 
        ownerId 
          ? q.eq("ownerType", ownerType).eq("ownerId", ownerId)
          : q.eq("ownerType", ownerType)
      )
      .collect();
  },
});
