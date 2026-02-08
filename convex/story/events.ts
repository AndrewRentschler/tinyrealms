import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const listByMap = query({
  args: { mapId: v.optional(v.id("maps")) },
  handler: async (ctx, { mapId }) => {
    return await ctx.db
      .query("storyEvents")
      .withIndex("by_map", (q) => q.eq("mapId", mapId))
      .collect();
  },
});

export const create = mutation({
  args: {
    mapId: v.optional(v.id("maps")),
    triggerId: v.string(),
    type: v.string(),
    conditions: v.any(),
    script: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("storyEvents", args);
  },
});
