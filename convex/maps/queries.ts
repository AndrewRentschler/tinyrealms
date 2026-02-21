/**
 * Map queries: list, listPublished, listSummaries, listStartMaps, get, getByName.
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("maps").collect();
  },
});

/** List only published maps (for the map browser / portal validation) */
export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("maps").collect();
    return all.filter((m) => (m as { status?: string }).status !== "draft");
  },
});

/**
 * List map summaries (lightweight, no tile data).
 * Returns only maps the user should see: system maps, maps owned by current user. Superusers see all.
 */
export const listSummaries = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const all = await ctx.db.query("maps").collect();
    let isSuperuser = false;
    if (userId) {
      const profiles = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      isSuperuser = profiles.some((p) => (p as { role?: string }).role === "superuser");
    }
    const filtered = all.filter((m) => {
      if (isSuperuser) return true;
      const mapType = (m as { mapType?: string }).mapType ?? "private";
      if (mapType === "system") return true;
      if (userId && (m as { createdBy?: unknown }).createdBy === userId) return true;
      return false;
    });
    return filtered.map((m) => ({
      _id: m._id,
      name: m.name,
      width: m.width,
      height: m.height,
      tileWidth: m.tileWidth,
      tileHeight: m.tileHeight,
      status: (m as { status?: string }).status ?? "published",
      mapType: (m as { mapType?: string }).mapType ?? "private",
      combatEnabled: (m as { combatEnabled?: boolean }).combatEnabled ?? false,
      combatSettings: (m as { combatSettings?: unknown }).combatSettings,
      musicUrl: (m as { musicUrl?: string }).musicUrl,
      creatorProfileId: (m as { creatorProfileId?: unknown }).creatorProfileId,
      createdBy: (m as { createdBy?: unknown }).createdBy,
      ownedByCurrentUser: !!(userId && (m as { createdBy?: unknown }).createdBy === userId),
      editors: (m as { editors?: unknown[] }).editors ?? [],
      portalCount: ((m as { portals?: unknown[] }).portals ?? []).length,
      labelNames: (m.labels ?? []).map((l: { name: string }) => l.name),
      updatedAt: m.updatedAt,
    }));
  },
});

/** List maps available as starting worlds when creating a profile */
export const listStartMaps = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const all = await ctx.db.query("maps").collect();
    return all
      .filter((m) => {
        const mapType = (m as { mapType?: string }).mapType ?? "private";
        if (mapType === "system") return true;
        if (userId && (m as { createdBy?: unknown }).createdBy === userId) return true;
        return false;
      })
      .map((m) => ({
        name: m.name,
        mapType: (m as { mapType?: string }).mapType ?? "private",
        labelNames: (m.labels ?? []).map((l: { name: string }) => l.name),
      }));
  },
});

export const get = query({
  args: { mapId: v.id("maps") },
  handler: async (ctx, { mapId }) => {
    return await ctx.db.get(mapId);
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
  },
});
