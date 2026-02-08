import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireMapEditor } from "./lib/requireMapEditor";

/** List all objects on a given map */
export const listByMap = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    return await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
  },
});

/** Place a new object on the map. Requires map editor. */
export const place = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    spriteDefName: v.string(),
    x: v.float64(),
    y: v.float64(),
    layer: v.number(),
    scaleOverride: v.optional(v.number()),
    flipX: v.optional(v.boolean()),
  },
  handler: async (ctx, { profileId, ...args }) => {
    await requireMapEditor(ctx, profileId, args.mapName);
    const id = await ctx.db.insert("mapObjects", {
      ...args,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, { mapName: args.mapName });
    return id;
  },
});

/** Move an existing object. Requires map editor. */
export const move = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    id: v.id("mapObjects"),
    x: v.float64(),
    y: v.float64(),
  },
  handler: async (ctx, { profileId, mapName, id, x, y }) => {
    await requireMapEditor(ctx, profileId, mapName);
    await ctx.db.patch(id, { x, y, updatedAt: Date.now() });
  },
});

/** Remove an object from the map. Requires map editor. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    id: v.id("mapObjects"),
  },
  handler: async (ctx, { profileId, mapName, id }) => {
    await requireMapEditor(ctx, profileId, mapName);
    await ctx.db.delete(id);
    await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, { mapName });
  },
});

/** Toggle on/off state of a map object. Any player can do this. */
export const toggle = mutation({
  args: {
    id: v.id("mapObjects"),
  },
  handler: async (ctx, { id }) => {
    const obj = await ctx.db.get(id);
    if (!obj) return { success: false };
    const newState = !obj.isOn;
    await ctx.db.patch(id, { isOn: newState, updatedAt: Date.now() });
    return { success: true, isOn: newState };
  },
});

/** Bulk save: remove all objects for a map and re-insert. Requires map editor. */
export const bulkSave = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    objects: v.array(
      v.object({
        spriteDefName: v.string(),
        instanceName: v.optional(v.string()),
        x: v.float64(),
        y: v.float64(),
        layer: v.number(),
        scaleOverride: v.optional(v.number()),
        flipX: v.optional(v.boolean()),
        isOn: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, { profileId, mapName, objects }) => {
    await requireMapEditor(ctx, profileId, mapName);
    // Delete existing
    const existing = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    for (const obj of existing) {
      await ctx.db.delete(obj._id);
    }
    // Insert new
    for (const obj of objects) {
      await ctx.db.insert("mapObjects", {
        mapName,
        ...obj,
        updatedAt: Date.now(),
      });
    }

    // Sync NPC runtime state (creates/removes npcState rows as needed)
    await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, { mapName });
  },
});
