/**
 * Map queries: list, listPublished, listSummaries, listStartMaps, get, getByName.
 */
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { getMapType } from "../lib/visibility.ts";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("maps").collect();
  },
});

/**
 * List only published maps (for the map browser / portal validation).
 * Uses index by_status. Maps with status undefined are not included
 * (schema default is "published" but we only show explicitly published).
 */
export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("maps")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
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
    let isSuperuser = false;
    if (userId) {
      const profiles = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      isSuperuser = profiles.some((p) => (p as { role?: string }).role === "superuser");
    }

    let maps: Doc<"maps">[];
    if (isSuperuser) {
      maps = await ctx.db.query("maps").collect();
    } else {
      const [systemMaps, userMaps] = await Promise.all([
        ctx.db
          .query("maps")
          .withIndex("by_mapType", (q) => q.eq("mapType", "system"))
          .collect(),
        userId
          ? ctx.db
              .query("maps")
              .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
              .collect()
          : [],
      ]);
      const seen = new Set<string>();
      maps = [...systemMaps, ...userMaps].filter((m) => {
        const id = m._id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }

    return maps.map((m) => ({
      _id: m._id,
      name: m.name,
      width: m.width,
      height: m.height,
      tileWidth: m.tileWidth,
      tileHeight: m.tileHeight,
      status: (m as { status?: string }).status ?? "published",
      mapType: getMapType(m),
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
    let maps: Doc<"maps">[];
    const [systemMaps, userMaps] = await Promise.all([
      ctx.db
        .query("maps")
        .withIndex("by_mapType", (q) => q.eq("mapType", "system"))
        .collect(),
      userId
        ? ctx.db
            .query("maps")
            .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
            .collect()
        : [],
    ]);
    const seen = new Set<string>();
    maps = [...systemMaps, ...userMaps].filter((m) => {
      const id = m._id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return maps.map((m) => ({
      name: m.name,
      mapType: getMapType(m),
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
