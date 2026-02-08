import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("spriteSheets").collect();
  },
});

export const get = query({
  args: { id: v.id("spriteSheets") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    imageId: v.id("_storage"),
    frameWidth: v.number(),
    frameHeight: v.number(),
    frames: v.any(),
    animations: v.any(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject as any;
    return await ctx.db.insert("spriteSheets", { ...args, createdBy: userId });
  },
});

export const update = mutation({
  args: {
    id: v.id("spriteSheets"),
    name: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    frameWidth: v.optional(v.number()),
    frameHeight: v.optional(v.number()),
    frames: v.optional(v.any()),
    animations: v.optional(v.any()),
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

export const remove = mutation({
  args: { id: v.id("spriteSheets") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
