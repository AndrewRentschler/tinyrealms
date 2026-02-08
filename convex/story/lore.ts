import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const list = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, { category }) => {
    const all = await ctx.db.query("lore").collect();
    if (category) {
      return all.filter((l) => l.category === category);
    }
    return all;
  },
});

export const getByKey = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    return await ctx.db
      .query("lore")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
  },
});

export const create = mutation({
  args: {
    key: v.string(),
    title: v.string(),
    content: v.string(),
    category: v.union(
      v.literal("world"),
      v.literal("character"),
      v.literal("item")
    ),
    discoverable: v.boolean(),
    draft: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("lore", {
      ...args,
      discoveredBy: [],
    });
  },
});

export const discover = mutation({
  args: {
    loreId: v.id("lore"),
    playerId: v.id("players"),
  },
  handler: async (ctx, { loreId, playerId }) => {
    const entry = await ctx.db.get(loreId);
    if (!entry) return;
    if (!entry.discoveredBy.includes(playerId)) {
      await ctx.db.patch(loreId, {
        discoveredBy: [...entry.discoveredBy, playerId],
      });
    }
  },
});
