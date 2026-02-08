import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByMap = query({
  args: { mapId: v.id("maps") },
  handler: async (ctx, { mapId }) => {
    return await ctx.db
      .query("npcs")
      .withIndex("by_map", (q) => q.eq("mapId", mapId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("npcs") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    mapId: v.id("maps"),
    x: v.float64(),
    y: v.float64(),
    animation: v.string(),
    systemPrompt: v.optional(v.string()),
    behavior: v.optional(v.string()),
    spriteSheetId: v.optional(v.id("spriteSheets")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("npcs", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("npcs"),
    name: v.optional(v.string()),
    x: v.optional(v.float64()),
    y: v.optional(v.float64()),
    animation: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    behavior: v.optional(v.string()),
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
