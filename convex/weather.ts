import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireSuperuser } from "./lib/requireSuperuser";
import { requireAdminKey } from "./lib/requireAdminKey";

const GLOBAL_KEY = "global";
const DEFAULT_RAINY_PERCENT = 0.45;
const DEFAULT_TICK_INTERVAL_MS = 90_000;
const STALE_MULTIPLIER = 3;

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clampTickMs(n: number) {
  if (!Number.isFinite(n)) return DEFAULT_TICK_INTERVAL_MS;
  return Math.max(5_000, Math.min(60 * 60 * 1000, Math.round(n)));
}

async function getGlobalRow(ctx: any) {
  return await ctx.db
    .query("weatherGlobal")
    .withIndex("by_key", (q: any) => q.eq("key", GLOBAL_KEY))
    .first();
}

export const getGlobal = query({
  args: {},
  handler: async (ctx) => {
    const row = await getGlobalRow(ctx);
    if (!row) {
      return {
        key: GLOBAL_KEY,
        rainyNow: false,
        rainyPercent: DEFAULT_RAINY_PERCENT,
        tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
        updatedAt: 0,
        lastTickAt: 0,
      };
    }
    return row;
  },
});

/**
 * Ensure global weather loop exists and keeps running.
 * Safe to call from clients on startup.
 */
export const ensureLoop = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let row = await getGlobalRow(ctx);
    if (!row) {
      const id = await ctx.db.insert("weatherGlobal", {
        key: GLOBAL_KEY,
        rainyNow: false,
        rainyPercent: DEFAULT_RAINY_PERCENT,
        tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
        updatedAt: now,
        lastTickAt: 0,
      });
      row = await ctx.db.get(id);
      await ctx.scheduler.runAfter(0, internal.weather.tick, {});
      return row;
    }

    const tickIntervalMs = clampTickMs((row as any).tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS);
    const lastTickAt = Number((row as any).lastTickAt ?? 0);
    const staleAfterMs = tickIntervalMs * STALE_MULTIPLIER;
    if (now - lastTickAt > staleAfterMs) {
      await ctx.scheduler.runAfter(0, internal.weather.tick, {});
    }
    return row;
  },
});

export const setGlobalConfig = mutation({
  args: {
    profileId: v.id("profiles"),
    rainyPercent: v.number(),
    tickIntervalMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperuser(ctx, args.profileId);
    const now = Date.now();
    const rainyPercent = clamp01(args.rainyPercent);
    const tickIntervalMs = clampTickMs(args.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS);

    let row = await getGlobalRow(ctx);
    if (!row) {
      const id = await ctx.db.insert("weatherGlobal", {
        key: GLOBAL_KEY,
        rainyNow: false,
        rainyPercent,
        tickIntervalMs,
        updatedAt: now,
        lastTickAt: 0,
      });
      row = await ctx.db.get(id);
      await ctx.scheduler.runAfter(0, internal.weather.tick, {});
      return row;
    }

    await ctx.db.patch(row._id, {
      rainyPercent,
      tickIntervalMs,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.weather.tick, {});
    return await ctx.db.get(row._id);
  },
});

export const setGlobalConfigAdmin = mutation({
  args: {
    adminKey: v.string(),
    rainyPercent: v.number(),
    tickIntervalMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireAdminKey(args.adminKey);
    const now = Date.now();
    const rainyPercent = clamp01(args.rainyPercent);
    const tickIntervalMs = clampTickMs(args.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS);

    let row = await getGlobalRow(ctx);
    if (!row) {
      const id = await ctx.db.insert("weatherGlobal", {
        key: GLOBAL_KEY,
        rainyNow: false,
        rainyPercent,
        tickIntervalMs,
        updatedAt: now,
        lastTickAt: 0,
      });
      row = await ctx.db.get(id);
      await ctx.scheduler.runAfter(0, internal.weather.tick, {});
      return row;
    }

    await ctx.db.patch(row._id, {
      rainyPercent,
      tickIntervalMs,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.weather.tick, {});
    return await ctx.db.get(row._id);
  },
});

export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let row = await getGlobalRow(ctx);
    if (!row) {
      const id = await ctx.db.insert("weatherGlobal", {
        key: GLOBAL_KEY,
        rainyNow: false,
        rainyPercent: DEFAULT_RAINY_PERCENT,
        tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
        updatedAt: now,
        lastTickAt: 0,
      });
      row = await ctx.db.get(id);
      if (!row) return;
    }

    const rainyPercent = clamp01((row as any).rainyPercent ?? DEFAULT_RAINY_PERCENT);
    const tickIntervalMs = clampTickMs((row as any).tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS);
    const rainyNow = Math.random() < rainyPercent;

    await ctx.db.patch(row._id, {
      rainyNow,
      lastTickAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(tickIntervalMs, internal.weather.tick, {});
  },
});
