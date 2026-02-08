import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/requireAdmin";

// ---------------------------------------------------------------------------
// Item type / rarity validators (must match schema)
// ---------------------------------------------------------------------------

const itemTypeValidator = v.union(
  v.literal("weapon"),
  v.literal("armor"),
  v.literal("accessory"),
  v.literal("consumable"),
  v.literal("material"),
  v.literal("key"),
  v.literal("currency"),
  v.literal("quest"),
  v.literal("misc"),
);

const rarityValidator = v.union(
  v.literal("common"),
  v.literal("uncommon"),
  v.literal("rare"),
  v.literal("epic"),
  v.literal("legendary"),
  v.literal("unique"),
);

const statsValidator = v.optional(
  v.object({
    atk: v.optional(v.number()),
    def: v.optional(v.number()),
    spd: v.optional(v.number()),
    hp: v.optional(v.number()),
    maxHp: v.optional(v.number()),
  }),
);

const effectValidator = v.object({
  type: v.string(),
  value: v.optional(v.number()),
  duration: v.optional(v.number()),
  description: v.optional(v.string()),
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all item definitions */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("itemDefs").collect();
  },
});

/** Get item definition by unique name */
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return await ctx.db
      .query("itemDefs")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Save (upsert) an item definition. Requires admin. */
export const save = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    displayName: v.string(),
    description: v.string(),
    type: itemTypeValidator,
    rarity: rarityValidator,
    iconUrl: v.optional(v.string()),
    iconTilesetUrl: v.optional(v.string()),
    iconTileX: v.optional(v.number()),
    iconTileY: v.optional(v.number()),
    iconTileW: v.optional(v.number()),
    iconTileH: v.optional(v.number()),
    stats: statsValidator,
    effects: v.optional(v.array(effectValidator)),
    equipSlot: v.optional(v.string()),
    levelRequirement: v.optional(v.number()),
    stackable: v.boolean(),
    maxStack: v.optional(v.number()),
    value: v.number(),
    isUnique: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    lore: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.profileId);

    const existing = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    const { profileId: _, ...fields } = args;
    const data = { ...fields, updatedAt: Date.now(), createdBy: args.profileId };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("itemDefs", data);
    }
  },
});

/** Delete an item definition. Requires admin. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    id: v.id("itemDefs"),
  },
  handler: async (ctx, { profileId, id }) => {
    await requireAdmin(ctx, profileId);
    await ctx.db.delete(id);
  },
});
