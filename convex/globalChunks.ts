import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

type GlobalChunkDoc = Doc<"globalChunks">;

const staticObjectValidator = v.object({
  objectKey: v.string(),
  spriteDefName: v.string(),
  x: v.float64(),
  y: v.float64(),
  layer: v.number(),
  isCollidable: v.boolean(),
  animation: v.optional(v.string()),
  portalId: v.optional(v.string()),
});

async function findChunk(
  ctx: QueryCtx | MutationCtx,
  worldKey: string,
  chunkX: number,
  chunkY: number,
) {
  return await ctx.db
    .query("globalChunks")
    .withIndex("by_world_chunk", (q) =>
      q.eq("worldKey", worldKey).eq("chunkX", chunkX).eq("chunkY", chunkY),
    )
    .first();
}

export const getChunk = query({
  args: {
    worldKey: v.string(),
    chunkX: v.number(),
    chunkY: v.number(),
  },
  handler: async (ctx, { worldKey, chunkX, chunkY }) => {
    return await findChunk(ctx, worldKey, chunkX, chunkY);
  },
});

export const listChunksInWindow = query({
  args: {
    worldKey: v.string(),
    minChunkX: v.number(),
    maxChunkX: v.number(),
    minChunkY: v.number(),
    maxChunkY: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.minChunkX > args.maxChunkX || args.minChunkY > args.maxChunkY) {
      return [];
    }

    const chunks: Array<GlobalChunkDoc> = [];
    for (let chunkX = args.minChunkX; chunkX <= args.maxChunkX; chunkX += 1) {
      const rows = await ctx.db
        .query("globalChunks")
        .withIndex("by_world_chunk", (q) =>
          q
            .eq("worldKey", args.worldKey)
            .eq("chunkX", chunkX)
            .gte("chunkY", args.minChunkY)
            .lte("chunkY", args.maxChunkY),
        )
        .collect();

      chunks.push(...rows);
    }

    return chunks;
  },
});

export const upsertChunk = internalMutation({
  args: {
    worldKey: v.string(),
    chunkX: v.number(),
    chunkY: v.number(),
    chunkWidthTiles: v.number(),
    chunkHeightTiles: v.number(),
    tileWidth: v.number(),
    tileHeight: v.number(),
    bgTiles: v.string(),
    objTiles: v.string(),
    overlayTiles: v.string(),
    collisionMask: v.string(),
    staticObjects: v.array(staticObjectValidator),
    revision: v.optional(v.number()),
    generatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await findChunk(ctx, args.worldKey, args.chunkX, args.chunkY);
    const now = Date.now();

    const row = {
      worldKey: args.worldKey,
      chunkX: args.chunkX,
      chunkY: args.chunkY,
      chunkWidthTiles: args.chunkWidthTiles,
      chunkHeightTiles: args.chunkHeightTiles,
      tileWidth: args.tileWidth,
      tileHeight: args.tileHeight,
      bgTiles: args.bgTiles,
      objTiles: args.objTiles,
      overlayTiles: args.overlayTiles,
      collisionMask: args.collisionMask,
      staticObjects: args.staticObjects,
      revision: args.revision ?? existing?.revision ?? 1,
      generatedAt: args.generatedAt ?? existing?.generatedAt ?? now,
      updatedAt: now,
    } satisfies Omit<GlobalChunkDoc, "_id" | "_creationTime">;

    if (existing) {
      await ctx.db.replace(existing._id, row);
      return await ctx.db.get(existing._id);
    }

    const insertedId = await ctx.db.insert("globalChunks", row);
    return await ctx.db.get(insertedId);
  },
});

export const patchChunkStaticObjects = internalMutation({
  args: {
    worldKey: v.string(),
    chunkX: v.number(),
    chunkY: v.number(),
    staticObjects: v.array(staticObjectValidator),
    revision: v.optional(v.number()),
  },
  handler: async (ctx, { worldKey, chunkX, chunkY, staticObjects, revision }) => {
    const existing = await findChunk(ctx, worldKey, chunkX, chunkY);
    if (!existing) {
      throw new Error("Chunk not found");
    }

    await ctx.db.patch(existing._id, {
      staticObjects,
      revision: revision ?? existing.revision + 1,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(existing._id);
  },
});
