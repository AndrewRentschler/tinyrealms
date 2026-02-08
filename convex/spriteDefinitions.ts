import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/requireAdmin";

/** List all saved sprite definitions */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("spriteDefinitions").collect();
  },
});

/** Get a single sprite definition by name */
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
  },
});

/** Save (upsert) a sprite definition. Requires admin. */
export const save = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    spriteSheetUrl: v.string(),
    defaultAnimation: v.string(),
    animationSpeed: v.number(),
    anchorX: v.number(),
    anchorY: v.number(),
    scale: v.number(),
    isCollidable: v.boolean(),
    category: v.string(),
    frameWidth: v.number(),
    frameHeight: v.number(),
    // NPC-specific (optional)
    npcSpeed: v.optional(v.number()),
    npcWanderRadius: v.optional(v.number()),
    npcDirDown: v.optional(v.string()),
    npcDirUp: v.optional(v.string()),
    npcDirLeft: v.optional(v.string()),
    npcDirRight: v.optional(v.string()),
    npcGreeting: v.optional(v.string()),
    // Sound fields
    ambientSoundUrl: v.optional(v.string()),
    ambientSoundRadius: v.optional(v.number()),
    ambientSoundVolume: v.optional(v.number()),
    interactSoundUrl: v.optional(v.string()),
    // Toggleable on/off
    toggleable: v.optional(v.boolean()),
    onAnimation: v.optional(v.string()),
    offAnimation: v.optional(v.string()),
    onSoundUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.profileId);

    const existing = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    // Strip profileId from the data before storing
    const { profileId: _, ...fields } = args;
    const data = { ...fields, updatedAt: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("spriteDefinitions", data);
    }
  },
});

/** Delete a sprite definition by ID. Requires admin. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    id: v.id("spriteDefinitions"),
  },
  handler: async (ctx, { profileId, id }) => {
    await requireAdmin(ctx, profileId);
    await ctx.db.delete(id);
  },
});
