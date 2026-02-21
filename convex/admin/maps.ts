/**
 * Admin: profile map reset, map list, map update.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireAdminKey } from "../lib/requireAdminKey";
import { getMapType, isValidVisibilityType } from "../lib/visibility.ts";
import { DEFAULT_START_MAP } from "../maps";

/** Reset a profile's map by name */
export const resetProfileMap = mutation({
  args: {
    adminKey: v.string(),
    name: v.string(),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { adminKey, name, mapName }) => {
    requireAdminKey(adminKey);
    const target = mapName ?? DEFAULT_START_MAP;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!profile) throw new Error(`Profile "${name}" not found`);
    const { _id, _creationTime, x: _x, y: _y, direction: _d, mapName: _m, ...rest } = profile;
    await ctx.db.replace(_id, { ...rest, mapName: target });
    return { name: profile.name, mapName: target };
  },
});

/** Reset ALL profiles to the default map */
export const resetAllProfileMaps = mutation({
  args: {
    adminKey: v.string(),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { adminKey, mapName }) => {
    requireAdminKey(adminKey);
    const target = mapName ?? DEFAULT_START_MAP;
    const profiles = await ctx.db.query("profiles").collect();
    let count = 0;
    for (const p of profiles) {
      const { _id, _creationTime, x: _x, y: _y, direction: _d, mapName: _m, ...rest } = p;
      await ctx.db.replace(_id, { ...rest, mapName: target });
      count++;
    }
    return { reset: count, mapName: target };
  },
});

/** Lightweight map list for CLI */
export const listMaps = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const maps = await ctx.db.query("maps").collect();
    const users = await ctx.db.query("users").collect();
    const emailById = new Map<string, string>();
    for (const u of users) {
      emailById.set(String(u._id), (u as { email?: string }).email ?? "(no-email)");
    }
    return maps.map((m) => ({
      name: m.name,
      width: m.width,
      height: m.height,
      mapType: getMapType(m),
      owner: m.createdBy ? (emailById.get(String(m.createdBy)) ?? String(m.createdBy)) : "(none)",
    }));
  },
});

/** Admin: update a map's type and/or owner. CLI-only. */
export const adminUpdateMap = mutation({
  args: {
    adminKey: v.string(),
    mapName: v.string(),
    mapType: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
  },
  handler: async (ctx, { adminKey, mapName, mapType, ownerEmail }) => {
    requireAdminKey(adminKey);
    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", mapName))
      .first();
    if (!map) throw new Error(`Map "${mapName}" not found`);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (mapType !== undefined) {
      if (!isValidVisibilityType(mapType)) {
        throw new Error(`Invalid mapType "${mapType}". Must be "public", "private", or "system".`);
      }
      patch.mapType = mapType;
    }
    if (ownerEmail !== undefined) {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", ownerEmail)
        )
        .first();
      if (!account) throw new Error(`No user found with email "${ownerEmail}"`);
      patch.createdBy = account.userId;
    }
    await ctx.db.patch(map._id, patch);
    return { ok: true, mapName, patched: Object.keys(patch).filter((k) => k !== "updatedAt") };
  },
});
