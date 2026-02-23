import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  dimensionTypeValidator,
  globalEntityTypeValidator,
} from "./schema.ts";

type EntityLocationDoc = Doc<"entityLocations">;

export const get = query({
  args: {
    entityType: globalEntityTypeValidator,
    entityId: v.string(),
  },
  handler: async (ctx, { entityType, entityId }) => {
    return await ctx.db
      .query("entityLocations")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", entityType).eq("entityId", entityId),
      )
      .first();
  },
});

export const setLocation = internalMutation({
  args: {
    entityType: globalEntityTypeValidator,
    entityId: v.string(),
    dimensionType: dimensionTypeValidator,
    worldKey: v.string(),
    mapName: v.optional(v.string()),
    lastPortalId: v.optional(v.string()),
    lastPortalUsedAt: v.optional(v.number()),
    lastGlobalX: v.optional(v.float64()),
    lastGlobalY: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    if (args.dimensionType === "instance" && !args.mapName) {
      throw new Error("mapName is required when dimensionType is instance");
    }
    if (args.dimensionType === "global" && args.mapName !== undefined) {
      throw new Error("mapName must be unset when dimensionType is global");
    }

    const existing = await ctx.db
      .query("entityLocations")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .first();

    const nextLastPortalId = args.lastPortalId ?? existing?.lastPortalId;
    const nextLastPortalUsedAt =
      args.lastPortalUsedAt ?? existing?.lastPortalUsedAt;
    const nextLastGlobalX = args.lastGlobalX ?? existing?.lastGlobalX;
    const nextLastGlobalY = args.lastGlobalY ?? existing?.lastGlobalY;

    const row = {
      entityType: args.entityType,
      entityId: args.entityId,
      dimensionType: args.dimensionType,
      worldKey: args.worldKey,
      ...(args.dimensionType === "instance" ? { mapName: args.mapName } : {}),
      ...(nextLastPortalId !== undefined
        ? { lastPortalId: nextLastPortalId }
        : {}),
      ...(nextLastPortalUsedAt !== undefined
        ? { lastPortalUsedAt: nextLastPortalUsedAt }
        : {}),
      ...(nextLastGlobalX !== undefined ? { lastGlobalX: nextLastGlobalX } : {}),
      ...(nextLastGlobalY !== undefined ? { lastGlobalY: nextLastGlobalY } : {}),
      updatedAt: Date.now(),
    } satisfies Omit<EntityLocationDoc, "_id" | "_creationTime">;

    if (existing) {
      await ctx.db.replace(existing._id, row);
      return await ctx.db.get(existing._id);
    }

    const insertedId = await ctx.db.insert("entityLocations", row);
    return await ctx.db.get(insertedId);
  },
});
