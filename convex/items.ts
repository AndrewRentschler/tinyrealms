import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isSuperuserProfile } from "./lib/profileRole.ts";
import { getVisibilityType, visibilityTypeValidator } from "./lib/visibility.ts";

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

function canReadItem(
  item: { createdByUser?: string; visibilityType?: string },
  userId: string | null,
): boolean {
  const visibility = getVisibilityType(item);
  if (visibility === "system" || visibility === "public") return true;
  if (!userId) return false;
  return item.createdByUser === userId;
}

async function isSuperuserUser(
  ctx: QueryCtx,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const profiles = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId as Id<"users">))
    .collect();
  return profiles.some((p) => isSuperuserProfile(p));
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all item definitions */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const superuser = await isSuperuserUser(ctx, userId);
    const all = await ctx.db.query("itemDefs").collect();
    if (superuser) return all;
    return all.filter((item) => canReadItem(item, userId));
  },
});

/** Get item definition by unique name */
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    const superuser = await isSuperuserUser(ctx, userId);
    const item = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!item) return null;
    if (superuser) return item;
    if (!canReadItem(item, userId)) return null;
    return item;
  },
});

/** Get multiple item definitions by their names */
export const listByNames = query({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    const userId = await getAuthUserId(ctx);
    const superuser = await isSuperuserUser(ctx, userId);
    const uniqueNames = [...new Set(names)];
    const items = [];
    for (const name of uniqueNames) {
      const item = await ctx.db
        .query("itemDefs")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (item) {
        if (superuser || canReadItem(item, userId)) {
          items.push(item);
        }
      }
    }
    return items;
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Save (upsert) an item definition with visibility scoping. */
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
    iconSpriteDefName: v.optional(v.string()),
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
    consumeHpDelta: v.optional(v.number()),
    pickupSoundUrl: v.optional(v.string()),
    visibilityType: v.optional(visibilityTypeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.userId !== userId) throw new Error("Not your profile");
    const isSuperuser = isSuperuserProfile(profile);

    const existing = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (args.iconSpriteDefName) {
      const spriteDef = await ctx.db
        .query("spriteDefinitions")
        .withIndex("by_name", (q) => q.eq("name", args.iconSpriteDefName!))
        .first();
      if (!spriteDef) {
        throw new Error(`Sprite definition "${args.iconSpriteDefName}" was not found.`);
      }
      if (spriteDef.category !== "object") {
        throw new Error(`Item icon sprite must use an object sprite definition.`);
      }
      if (spriteDef.toggleable || spriteDef.isDoor) {
        throw new Error(`Item icon sprite cannot use toggleable or door object definitions.`);
      }
    }

    if (existing) {
      const existingOwner = existing.createdByUser;
      const existingVisibility = getVisibilityType(existing);
      const isOwner = existingOwner === userId;
      if (!isSuperuser && !isOwner) {
        throw new Error(
          `Permission denied: you can only edit your own item definitions (or be superuser).`,
        );
      }
      if (!isSuperuser && existingVisibility === "system") {
        throw new Error(`Permission denied: only superusers can edit system item definitions.`);
      }
    }

    let visibilityType = args.visibilityType ?? (existing ? getVisibilityType(existing) : "private");
    if (visibilityType === "system" && !isSuperuser) {
      throw new Error(`Only superusers can set item visibility to "system".`);
    }

    const { profileId: _, visibilityType: __, ...fields } = args;
    const data = {
      ...fields,
      visibilityType,
      createdBy: args.profileId,
      createdByUser: existing?.createdByUser ?? userId,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("itemDefs", data);
    }
  },
});

/** Delete an item definition. Requires owner or superuser. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    id: v.id("itemDefs"),
  },
  handler: async (ctx, { profileId, id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.userId !== userId) throw new Error("Not your profile");
    const isSuperuser = isSuperuserProfile(profile);

    const item = await ctx.db.get(id);
    if (!item) throw new Error("Item definition not found");
    const visibility = getVisibilityType(item);
    const isOwner = item.createdByUser === userId;
    if (!isSuperuser && !isOwner) {
      throw new Error(`Permission denied: only owner or superuser can delete this item definition.`);
    }
    if (!isSuperuser && visibility === "system") {
      throw new Error(`Permission denied: only superusers can delete system item definitions.`);
    }
    await ctx.db.delete(id);
  },
});
