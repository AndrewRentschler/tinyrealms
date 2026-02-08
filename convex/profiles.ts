import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all profiles (for the selection screen).
 *  Also checks for stale claims — if a profile is marked inUse but has no
 *  active presence row, it's effectively released (browser closed/refreshed). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();

    // For each in-use profile, verify there's still an active presence row
    // with a recent lastSeen timestamp. Presence updates every ~200ms, so
    // anything older than 15 seconds means the player is gone.
    const STALE_PRESENCE_MS = 15_000;
    const now = Date.now();

    const result = [];
    for (const p of profiles) {
      if (p.inUse) {
        const presence = await ctx.db
          .query("presence")
          .withIndex("by_profile", (q) => q.eq("profileId", p._id))
          .first();
        if (!presence || (now - presence.lastSeen > STALE_PRESENCE_MS)) {
          // No presence or stale — return as not-in-use to the client
          // (actual DB cleanup happens via claim/release/cleanup mutations)
          result.push({ ...p, inUse: false, inUseSince: undefined });
          continue;
        }
      }
      result.push(p);
    }
    return result;
  },
});

/** Get a single profile by id */
export const get = query({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
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

/** Create a new profile */
export const create = mutation({
  args: {
    name: v.string(),
    spriteUrl: v.string(),
    color: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, { name, spriteUrl, color, role }) => {
    // Check for duplicate names
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existing) throw new Error(`Profile "${name}" already exists`);

    // First profile ever created gets admin, rest get player
    const allProfiles = await ctx.db.query("profiles").collect();
    const assignedRole = role ?? (allProfiles.length === 0 ? "admin" : "player");

    return await ctx.db.insert("profiles", {
      name,
      spriteUrl,
      color: color ?? "#6c5ce7",
      role: assignedRole,
      stats: DEFAULT_STATS,
      items: [],
      npcsChatted: [],
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
    const profile = await ctx.db.get(id);
    if (!profile) return;
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
    const profile = await ctx.db.get(id);
    if (!profile) return;
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
    const profile = await ctx.db.get(id);
    if (!profile) return;
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

/** Set a profile's role */
export const setRole = mutation({
  args: {
    id: v.id("profiles"),
    role: v.string(),
  },
  handler: async (ctx, { id, role }) => {
    if (role !== "admin" && role !== "player") {
      throw new Error(`Invalid role "${role}". Must be "admin" or "player".`);
    }
    await ctx.db.patch(id, { role });
  },
});

/** Reset a profile's map to the default (cozy-cabin) so they respawn there */
export const resetMap = mutation({
  args: {
    id: v.id("profiles"),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { id, mapName }) => {
    const profile = await ctx.db.get(id);
    if (!profile) throw new Error("Profile not found");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, _creationTime, x: _x, y: _y, direction: _d, mapName: _m, ...rest } = profile;
    await ctx.db.replace(_id, { ...rest, mapName: mapName ?? "cozy-cabin" });
  },
});

/** Claim a profile (mark as in-use). Fails if already actively claimed. */
export const claim = mutation({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    const profile = await ctx.db.get(id);
    if (!profile) throw new Error("Profile not found");

    if (profile.inUse) {
      // Check if the previous owner still has an active presence row
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_profile", (q) => q.eq("profileId", id))
        .first();
      const STALE_PRESENCE_MS = 15_000;
      const now = Date.now();
      if (presence && (now - presence.lastSeen < STALE_PRESENCE_MS)) {
        // Presence is fresh — profile is genuinely in use
        throw new Error("Profile is already in use by another player");
      }
      // No presence row or stale presence — safe to reclaim
      // Clean up stale presence row if it exists
      if (presence) {
        await ctx.db.delete(presence._id);
      }
    }

    await ctx.db.patch(id, { inUse: true, inUseSince: Date.now() });
  },
});

/** Release a profile (mark as no longer in-use) */
export const release = mutation({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    const profile = await ctx.db.get(id);
    if (!profile) return;
    await ctx.db.patch(id, { inUse: false, inUseSince: undefined });
  },
});

/** Heartbeat — refresh inUseSince so the profile doesn't go stale */
export const heartbeat = mutation({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    const profile = await ctx.db.get(id);
    if (!profile || !profile.inUse) return;
    await ctx.db.patch(id, { inUseSince: Date.now() });
  },
});

/** Delete a profile */
export const remove = mutation({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    // Also clean up any presence rows
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
