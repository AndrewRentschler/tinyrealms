import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAdminKey } from "./lib/requireAdminKey";
import { requireSuperuser } from "./lib/requireSuperuser";

const GLOBAL_KEY = "global";
const DEFAULT_CURRENT_TIME = 12;
const DEFAULT_DAY_NUMBER = 0;
const DEFAULT_TIME_SCALE_SECONDS_PER_HOUR = 60;
const DEFAULT_IS_PAUSED = false;
const LOOP_INTERVAL_MS = 10_000;
const STALE_MULTIPLIER = 3;

type WorldTimeDoc = Doc<"worldTime">;
type WorldTimeInsert = Omit<WorldTimeDoc, "_id" | "_creationTime">;
type WorldTimeReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

function clampCurrentTime(hour: number): number {
  if (!Number.isFinite(hour)) return DEFAULT_CURRENT_TIME;
  const wrapped = hour % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

function clampDayNumber(dayNumber: number): number {
  if (!Number.isFinite(dayNumber)) return DEFAULT_DAY_NUMBER;
  return Math.max(0, Math.floor(dayNumber));
}

function clampTimeScale(secondsPerHour: number): number {
  if (!Number.isFinite(secondsPerHour)) {
    return DEFAULT_TIME_SCALE_SECONDS_PER_HOUR;
  }
  return Math.max(1, secondsPerHour);
}

async function getGlobalRow(ctx: WorldTimeReadCtx): Promise<WorldTimeDoc | null> {
  return await ctx.db
    .query("worldTime")
    .withIndex("by_key", (q) => q.eq("key", GLOBAL_KEY))
    .first();
}

function buildDefaultState(now: number): WorldTimeInsert {
  return {
    key: GLOBAL_KEY,
    currentTime: DEFAULT_CURRENT_TIME,
    dayNumber: DEFAULT_DAY_NUMBER,
    timeScale: DEFAULT_TIME_SCALE_SECONDS_PER_HOUR,
    isPaused: DEFAULT_IS_PAUSED,
    updatedAt: now,
    lastTickAt: now,
  };
}

export const getGlobal = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const row = await getGlobalRow(ctx);
    if (!row) {
      return buildDefaultState(now);
    }

    return {
      ...row,
      currentTime: clampCurrentTime(row.currentTime),
      dayNumber: clampDayNumber(row.dayNumber),
      timeScale: clampTimeScale(row.timeScale),
      isPaused: !!row.isPaused,
      updatedAt: Number(row.updatedAt ?? now),
      lastTickAt: Number(row.lastTickAt ?? now),
    };
  },
});

/**
 * Ensure world time loop exists and keeps running.
 * Safe to call from clients on startup.
 */
export const ensureLoop = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let row = await getGlobalRow(ctx);

    if (!row) {
      const id = await ctx.db.insert("worldTime", buildDefaultState(now));
      row = await ctx.db.get(id);
      await ctx.scheduler.runAfter(0, internal.worldTime.tick, {});
      return row;
    }

    const lastTickAt = Number(row.lastTickAt ?? 0);
    const staleAfterMs = LOOP_INTERVAL_MS * STALE_MULTIPLIER;
    if (now - lastTickAt > staleAfterMs) {
      await ctx.scheduler.runAfter(0, internal.worldTime.tick, {});
    }

    return row;
  },
});

export const setGlobalConfig = mutation({
  args: {
    profileId: v.id("profiles"),
    currentTime: v.optional(v.number()),
    dayNumber: v.optional(v.number()),
    timeScale: v.optional(v.number()),
    isPaused: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireSuperuser(ctx, args.profileId);
    return await upsertGlobalConfig(ctx, {
      currentTime: args.currentTime,
      dayNumber: args.dayNumber,
      timeScale: args.timeScale,
      isPaused: args.isPaused,
    });
  },
});

export const setGlobalConfigAdmin = mutation({
  args: {
    adminKey: v.string(),
    currentTime: v.optional(v.number()),
    dayNumber: v.optional(v.number()),
    timeScale: v.optional(v.number()),
    isPaused: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireAdminKey(args.adminKey);
    return await upsertGlobalConfig(ctx, {
      currentTime: args.currentTime,
      dayNumber: args.dayNumber,
      timeScale: args.timeScale,
      isPaused: args.isPaused,
    });
  },
});

async function upsertGlobalConfig(
  ctx: MutationCtx,
  updates: {
    currentTime?: number;
    dayNumber?: number;
    timeScale?: number;
    isPaused?: boolean;
  },
) {
  const now = Date.now();
  let row = await getGlobalRow(ctx);

  if (!row) {
    const initialState = buildDefaultState(now);
    if (updates.currentTime !== undefined) {
      initialState.currentTime = clampCurrentTime(updates.currentTime);
    }
    if (updates.dayNumber !== undefined) {
      initialState.dayNumber = clampDayNumber(updates.dayNumber);
    }
    if (updates.timeScale !== undefined) {
      initialState.timeScale = clampTimeScale(updates.timeScale);
    }
    if (updates.isPaused !== undefined) {
      initialState.isPaused = updates.isPaused;
    }

    const id = await ctx.db.insert("worldTime", initialState);
    row = await ctx.db.get(id);
    await ctx.scheduler.runAfter(0, internal.worldTime.tick, {});
    return row;
  }

  const patch: Record<string, unknown> = { updatedAt: now };
  if (updates.currentTime !== undefined) {
    patch.currentTime = clampCurrentTime(updates.currentTime);
  }
  if (updates.dayNumber !== undefined) {
    patch.dayNumber = clampDayNumber(updates.dayNumber);
  }
  if (updates.timeScale !== undefined) {
    patch.timeScale = clampTimeScale(updates.timeScale);
  }
  if (updates.isPaused !== undefined) {
    patch.isPaused = updates.isPaused;
  }

  await ctx.db.patch(row._id, patch);
  await ctx.scheduler.runAfter(0, internal.worldTime.tick, {});
  return await ctx.db.get(row._id);
}

export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let row = await getGlobalRow(ctx);
    if (!row) {
      const id = await ctx.db.insert("worldTime", buildDefaultState(now));
      row = await ctx.db.get(id);
      if (!row) return;
    }

    const currentTime = clampCurrentTime(row.currentTime ?? DEFAULT_CURRENT_TIME);
    const dayNumber = clampDayNumber(row.dayNumber ?? DEFAULT_DAY_NUMBER);
    const timeScale = clampTimeScale(
      row.timeScale ?? DEFAULT_TIME_SCALE_SECONDS_PER_HOUR,
    );
    const isPaused = !!row.isPaused;
    const lastTickAt = Number(row.lastTickAt ?? now);

    let nextCurrentTime = currentTime;
    let nextDayNumber = dayNumber;
    if (!isPaused) {
      const elapsedMs = Math.max(0, now - lastTickAt);
      const elapsedHours = elapsedMs / 1000 / timeScale;
      const totalHours = currentTime + elapsedHours;
      const dayAdvance = Math.floor(totalHours / 24);

      nextCurrentTime = clampCurrentTime(totalHours);
      nextDayNumber = dayNumber + Math.max(0, dayAdvance);
    }

    await ctx.db.patch(row._id, {
      currentTime: nextCurrentTime,
      dayNumber: nextDayNumber,
      lastTickAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(LOOP_INTERVAL_MS, internal.worldTime.tick, {});
  },
});
