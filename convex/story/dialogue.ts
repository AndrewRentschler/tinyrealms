import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const getByNpc = query({
  args: { npcId: v.id("npcs") },
  handler: async (ctx, { npcId }) => {
    return await ctx.db
      .query("dialogueTrees")
      .withIndex("by_npc", (q) => q.eq("npcId", npcId))
      .first();
  },
});

export const get = query({
  args: { id: v.id("dialogueTrees") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    npcId: v.optional(v.id("npcs")),
    triggerId: v.optional(v.string()),
    nodes: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("dialogueTrees", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("dialogueTrees"),
    nodes: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});
