/**
 * Admin mutations: clear chat, profiles, presence, maps, map objects.
 * Run via: npx convex run admin:clearChat, admin:clearProfiles, etc.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireAdminKey } from "../lib/requireAdminKey";

/** Delete all chat messages */
export const clearChat = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const messages = await ctx.db.query("messages").collect();
    let count = 0;
    for (const m of messages) {
      await ctx.db.delete(m._id);
      count++;
    }
    return { deleted: count };
  },
});

/** Delete all profiles and their associated presence rows */
export const clearProfiles = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const presence = await ctx.db.query("presence").collect();
    for (const p of presence) {
      await ctx.db.delete(p._id);
    }
    const profiles = await ctx.db.query("profiles").collect();
    let count = 0;
    for (const p of profiles) {
      await ctx.db.delete(p._id);
      count++;
    }
    return { deletedProfiles: count, deletedPresence: presence.length };
  },
});

/** Delete all presence rows (useful if ghosts are stuck) */
export const clearPresence = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const presence = await ctx.db.query("presence").collect();
    for (const p of presence) {
      await ctx.db.delete(p._id);
    }
    return { deleted: presence.length };
  },
});

/** Delete all maps and their associated objects, NPCs, world items, and messages */
export const clearMaps = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const maps = await ctx.db.query("maps").collect();
    let deleted = 0;
    for (const map of maps) {
      const objs = await ctx.db
        .query("mapObjects")
        .withIndex("by_map", (q) => q.eq("mapName", map.name))
        .collect();
      for (const o of objs) await ctx.db.delete(o._id);

      const npcs = await ctx.db
        .query("npcState")
        .withIndex("by_map", (q) => q.eq("mapName", map.name))
        .collect();
      for (const n of npcs) await ctx.db.delete(n._id);

      const worldItems = await ctx.db
        .query("worldItems")
        .withIndex("by_map", (q) => q.eq("mapName", map.name))
        .collect();
      for (const wi of worldItems) await ctx.db.delete(wi._id);

      const messages = await ctx.db
        .query("messages")
        .withIndex("by_map_time", (q) => q.eq("mapName", map.name))
        .collect();
      for (const m of messages) await ctx.db.delete(m._id);

      await ctx.db.delete(map._id);
      deleted++;
    }
    return { deleted };
  },
});

/** Delete all placed map objects (reset a map to empty) */
export const clearMapObjects = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const objects = await ctx.db.query("mapObjects").collect();
    for (const o of objects) {
      await ctx.db.delete(o._id);
    }
    return { deleted: objects.length };
  },
});
