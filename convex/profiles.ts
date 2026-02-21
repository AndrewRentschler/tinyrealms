import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { DEFAULT_START_MAP } from "./maps";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List profiles for the authenticated user (for the selection screen). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Get only this user's profiles
    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/** Get a single profile by id */
export const get = query({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    return await requireOwnedProfile(ctx, id);
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const DEFAULT_STATS = {
  hp: 100,
  maxHp: 100,
  atk: 10,
  def: 5,
  spd: 5,
  level: 1,
  xp: 0,
};

async function requireOwnedProfile(ctx: QueryCtx, id: Id<"profiles">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const profile = await ctx.db.get(id);
  if (!profile) throw new Error("Profile not found");
  if (profile.userId !== userId) {
    throw new Error("You can only access your own profiles");
  }
  return profile;
}

/** Create a new profile for the authenticated user.
 *  All new profiles start as "player". Use the management script
 *  (`node scripts/manage-users.mjs set-role <name> admin`) to grant admin. */
export const create = mutation({
  args: {
    name: v.string(),
    spriteUrl: v.string(),
    color: v.optional(v.string()),
    startMapName: v.optional(v.string()),
    startLabel: v.optional(v.string()),
  },
  handler: async (ctx, { name, spriteUrl, color, startMapName, startLabel }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Check for duplicate names (scoped to this user's profiles)
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (existing.some((p) => p.name === name)) {
      throw new Error(`You already have a profile named "${name}"`);
    }

    return await ctx.db.insert("profiles", {
      userId,
      name,
      spriteUrl,
      color: color ?? "#6c5ce7",
      role: "player",
      stats: DEFAULT_STATS,
      items: [],
      npcsChatted: [],
      mapName: startMapName ?? "cozy-cabin",
      startLabel: startLabel ?? "start1",
      createdAt: Date.now(),
    });
  },
});

/** Save position/direction when leaving or periodically */
export const savePosition = mutation({
  args: {
    id: v.id("profiles"),
    mapName: v.optional(v.string()),
    x: v.float64(),
    y: v.float64(),
    direction: v.string(),
  },
  handler: async (ctx, { id, ...pos }) => {
    await requireOwnedProfile(ctx, id);
    await ctx.db.patch(id, pos);
  },
});

/** Record that this profile has chatted with an NPC */
export const recordNpcChat = mutation({
  args: {
    id: v.id("profiles"),
    npcName: v.string(),
  },
  handler: async (ctx, { id, npcName }) => {
    const profile = await requireOwnedProfile(ctx, id);
    if (!profile.npcsChatted.includes(npcName)) {
      await ctx.db.patch(id, {
        npcsChatted: [...profile.npcsChatted, npcName],
      });
    }
  },
});

/** Update stats */
export const updateStats = mutation({
  args: {
    id: v.id("profiles"),
    stats: v.object({
      hp: v.number(),
      maxHp: v.number(),
      atk: v.number(),
      def: v.number(),
      spd: v.number(),
      level: v.number(),
      xp: v.number(),
    }),
  },
  handler: async (ctx, { id, stats }) => {
    await requireOwnedProfile(ctx, id);
    await ctx.db.patch(id, { stats });
  },
});

/** Add an item (or increase quantity if it already exists) */
export const addItem = mutation({
  args: {
    id: v.id("profiles"),
    itemName: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, { id, itemName, quantity }) => {
    const profile = await requireOwnedProfile(ctx, id);
    const items = [...profile.items];
    const existing = items.find((i) => i.name === itemName);
    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({ name: itemName, quantity });
    }
    await ctx.db.patch(id, { items });
  },
});

/** Remove an item (or decrease its quantity) */
export const removeItem = mutation({
  args: {
    id: v.id("profiles"),
    itemName: v.string(),
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, { id, itemName, quantity }) => {
    const profile = await requireOwnedProfile(ctx, id);
    const items = [...profile.items];
    const idx = items.findIndex((i) => i.name === itemName);
    if (idx < 0) return;
    if (quantity !== undefined && quantity < items[idx].quantity) {
      items[idx].quantity -= quantity;
    } else {
      items.splice(idx, 1);
    }
    await ctx.db.patch(id, { items });
  },
});

/** Consume one consumable item and apply its HP delta (+heal, -poison). */
export const consumeConsumable = mutation({
  args: {
    id: v.id("profiles"),
    itemName: v.string(),
  },
  handler: async (ctx, { id, itemName }) => {
    const profile = await requireOwnedProfile(ctx, id);
    const itemDef = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", (q) => q.eq("name", itemName))
      .first();
    if (!itemDef) throw new Error(`Item definition "${itemName}" not found`);
    if (itemDef.type !== "consumable") {
      throw new Error(`"${itemName}" is not consumable`);
    }

    // Consumables may be "effectless" (HP delta 0): still allow consuming.
    const hpDelta = itemDef.consumeHpDelta ?? 0;

    const items = [...profile.items];
    const idx = items.findIndex((i) => i.name === itemName);
    if (idx < 0 || items[idx].quantity <= 0) {
      throw new Error(`No "${itemDef.displayName}" in inventory`);
    }
    if (items[idx].quantity > 1) {
      items[idx] = { ...items[idx], quantity: items[idx].quantity - 1 };
    } else {
      items.splice(idx, 1);
    }

    const currentHp = profile.stats.hp ?? 0;
    const maxHp = Math.max(1, profile.stats.maxHp ?? 1);
    const nextHp = Math.max(0, Math.min(maxHp, currentHp + hpDelta));
    const stats = {
      ...profile.stats,
      hp: nextHp,
    };

    await ctx.db.patch(id, { items, stats });
    return {
      itemName,
      displayName: itemDef.displayName,
      hpDelta,
      hp: nextHp,
      maxHp,
      items,
      stats,
    };
  },
});

/** Set a profile's role */
export const setRole = mutation({
  args: {
    id: v.id("profiles"),
    role: v.string(),
  },
  handler: async (ctx, { id, role }) => {
    if (role !== "superuser" && role !== "player") {
      throw new Error(`Invalid role "${role}". Must be "superuser" or "player".`);
    }
    await requireOwnedProfile(ctx, id);
    throw new Error("profiles.setRole is disabled. Use admin.setRole via management script.");
  },
});

/** Reset a profile's map to the default starting map so they respawn there */
export const resetMap = mutation({
  args: {
    id: v.id("profiles"),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { id, mapName }) => {
    const profile = await requireOwnedProfile(ctx, id);
    const target = mapName ?? DEFAULT_START_MAP;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, _creationTime, x: _x, y: _y, direction: _d, mapName: _m, ...rest } = profile;
    await ctx.db.replace(_id, { ...rest, mapName: target });
  },
});


/** Delete a profile. Must be the owner. */
export const remove = mutation({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    await requireOwnedProfile(ctx, id);

    // Clean up any presence rows
    const presenceRows = await ctx.db
      .query("presence")
      .withIndex("by_profile", (q) => q.eq("profileId", id))
      .collect();
    for (const p of presenceRows) {
      await ctx.db.delete(p._id);
    }
    await ctx.db.delete(id);
  },
});
