import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  chunksForRadius,
  computeChunkXY,
} from "./lib/globalSpatial.ts";
import { globalEntityTypeValidator } from "./schema.ts";

type GlobalSpatialDoc = Doc<"globalSpatial">;

async function listChunkRows(
  ctx: QueryCtx,
  worldKey: string,
  chunkX: number,
  chunkY: number,
  entityType?: GlobalSpatialDoc["entityType"],
): Promise<Array<GlobalSpatialDoc>> {
  if (entityType) {
    return await ctx.db
      .query("globalSpatial")
      .withIndex("by_chunk_type", (q) =>
        q
          .eq("worldKey", worldKey)
          .eq("chunkX", chunkX)
          .eq("chunkY", chunkY)
          .eq("entityType", entityType),
      )
      .collect();
  }

  return await ctx.db
    .query("globalSpatial")
    .withIndex("by_chunk", (q) =>
      q.eq("worldKey", worldKey).eq("chunkX", chunkX).eq("chunkY", chunkY),
    )
    .collect();
}

export const getByEntity = query({
  args: {
    entityType: globalEntityTypeValidator,
    entityId: v.string(),
  },
  handler: async (ctx, { entityType, entityId }) => {
    return await ctx.db
      .query("globalSpatial")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", entityType).eq("entityId", entityId),
      )
      .first();
  },
});

export const listByChunk = query({
  args: {
    worldKey: v.string(),
    chunkX: v.number(),
    chunkY: v.number(),
    entityType: v.optional(globalEntityTypeValidator),
  },
  handler: async (ctx, { worldKey, chunkX, chunkY, entityType }) => {
    return await listChunkRows(ctx, worldKey, chunkX, chunkY, entityType);
  },
});

export const queryRadius = query({
  args: {
    worldKey: v.string(),
    x: v.float64(),
    y: v.float64(),
    radius: v.float64(),
    entityType: v.optional(globalEntityTypeValidator),
    chunkWorldWidth: v.float64(),
    chunkWorldHeight: v.float64(),
  },
  handler: async (
    ctx,
    { worldKey, x, y, radius, entityType, chunkWorldWidth, chunkWorldHeight },
  ) => {
    const chunkCoords = chunksForRadius(
      x,
      y,
      radius,
      chunkWorldWidth,
      chunkWorldHeight,
    );

    const chunkRows = await Promise.all(
      chunkCoords.map(({ chunkX, chunkY }) =>
        listChunkRows(ctx, worldKey, chunkX, chunkY, entityType),
      ),
    );

    const radiusSquared = radius * radius;

    return chunkRows.flat().filter((row: GlobalSpatialDoc) => {
      const dx = row.x - x;
      const dy = row.y - y;
      return dx * dx + dy * dy <= radiusSquared;
    });
  },
});

export const upsertEntity = internalMutation({
  args: {
    worldKey: v.string(),
    entityType: globalEntityTypeValidator,
    entityId: v.string(),
    x: v.float64(),
    y: v.float64(),
    dx: v.optional(v.float64()),
    dy: v.optional(v.float64()),
    animation: v.optional(v.string()),
    chunkWorldWidth: v.float64(),
    chunkWorldHeight: v.float64(),
  },
  handler: async (
    ctx,
    {
      worldKey,
      entityType,
      entityId,
      x,
      y,
      dx,
      dy,
      animation,
      chunkWorldWidth,
      chunkWorldHeight,
    },
  ) => {
    const { chunkX, chunkY } = computeChunkXY(
      x,
      y,
      chunkWorldWidth,
      chunkWorldHeight,
    );

    const row = {
      worldKey,
      entityType,
      entityId,
      x,
      y,
      dx: dx ?? 0,
      dy: dy ?? 0,
      chunkX,
      chunkY,
      animation: animation ?? "idle",
      updatedAt: Date.now(),
    };

    const existing = await ctx.db
      .query("globalSpatial")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", entityType).eq("entityId", entityId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, row);
      return await ctx.db.get(existing._id);
    }

    const insertedId = await ctx.db.insert("globalSpatial", row);
    return await ctx.db.get(insertedId);
  },
});

export const removeEntity = internalMutation({
  args: {
    entityType: globalEntityTypeValidator,
    entityId: v.string(),
  },
  handler: async (ctx, { entityType, entityId }) => {
    const existing = await ctx.db
      .query("globalSpatial")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", entityType).eq("entityId", entityId),
      )
      .first();

    if (!existing) {
      return { removed: false };
    }

    await ctx.db.delete(existing._id);
    return { removed: true };
  },
});
