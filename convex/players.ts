import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getOrCreate = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject as any;

    const existing = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("players", {
      userId,
      name: identity.name ?? "Adventurer",
      x: 0,
      y: 0,
      direction: "down",
      animation: "idle",
      stats: { hp: 100, maxHp: 100, atk: 10, def: 5, spd: 5, level: 1, xp: 0 },
    });
  },
});

export const get = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    return await ctx.db.get(playerId);
  },
});

export const getByUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject as any;
    return await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const update = mutation({
  args: {
    playerId: v.id("players"),
    x: v.optional(v.float64()),
    y: v.optional(v.float64()),
    direction: v.optional(v.string()),
    animation: v.optional(v.string()),
    mapId: v.optional(v.id("maps")),
    stats: v.optional(v.any()),
  },
  handler: async (ctx, { playerId, ...updates }) => {
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(playerId, filtered);
    }
  },
});
