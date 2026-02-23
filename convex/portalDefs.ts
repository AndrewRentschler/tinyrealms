import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  dimensionTypeValidator,
  globalEntityTypeValidator,
} from "./schema.ts";

type PortalDefDoc = Doc<"portalDefs">;

function requireInstanceMapName(
  dimensionType: PortalDefDoc["fromDimensionType"] | PortalDefDoc["toDimensionType"],
  mapName: string | undefined,
  fieldName: "fromMapName" | "toMapName",
) {
  if (dimensionType === "instance" && !mapName) {
    throw new Error(`${fieldName} is required when ${fieldName.replace("MapName", "DimensionType")} is instance`);
  }
}

function requireGlobalDestinationCoords(
  toDimensionType: PortalDefDoc["toDimensionType"],
  toGlobalX: number | undefined,
  toGlobalY: number | undefined,
) {
  if (
    toDimensionType === "global" &&
    (toGlobalX === undefined || toGlobalY === undefined)
  ) {
    throw new Error(
      "toGlobalX and toGlobalY are required when toDimensionType is global",
    );
  }
}

export const getByPortalId = query({
  args: {
    portalId: v.string(),
  },
  handler: async (ctx, { portalId }) => {
    return await ctx.db
      .query("portalDefs")
      .withIndex("by_portal_id", (q) => q.eq("portalId", portalId))
      .first();
  },
});

export const listFromAnchor = query({
  args: {
    fromDimensionType: dimensionTypeValidator,
    fromMapName: v.optional(v.string()),
  },
  handler: async (ctx, { fromDimensionType, fromMapName }) => {
    requireInstanceMapName(fromDimensionType, fromMapName, "fromMapName");
    const anchorMapName =
      fromDimensionType === "instance" ? fromMapName : undefined;

    return await ctx.db
      .query("portalDefs")
      .withIndex("by_from", (q) =>
        q
          .eq("fromDimensionType", fromDimensionType)
          .eq("fromMapName", anchorMapName),
      )
      .collect();
  },
});

export const upsertPortalDef = internalMutation({
  args: {
    portalId: v.string(),
    name: v.string(),
    fromDimensionType: dimensionTypeValidator,
    fromMapName: v.optional(v.string()),
    fromGlobalX: v.optional(v.float64()),
    fromGlobalY: v.optional(v.float64()),
    toDimensionType: dimensionTypeValidator,
    toMapName: v.optional(v.string()),
    toSpawnLabel: v.optional(v.string()),
    toGlobalX: v.optional(v.float64()),
    toGlobalY: v.optional(v.float64()),
    direction: v.optional(v.string()),
    transition: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireInstanceMapName(args.fromDimensionType, args.fromMapName, "fromMapName");
    requireInstanceMapName(args.toDimensionType, args.toMapName, "toMapName");
    requireGlobalDestinationCoords(
      args.toDimensionType,
      args.toGlobalX,
      args.toGlobalY,
    );

    const row = {
      portalId: args.portalId,
      name: args.name,
      fromDimensionType: args.fromDimensionType,
      ...(args.fromDimensionType === "instance"
        ? { fromMapName: args.fromMapName }
        : {}),
      ...(args.fromGlobalX !== undefined ? { fromGlobalX: args.fromGlobalX } : {}),
      ...(args.fromGlobalY !== undefined ? { fromGlobalY: args.fromGlobalY } : {}),
      toDimensionType: args.toDimensionType,
      ...(args.toDimensionType === "instance"
        ? {
            toMapName: args.toMapName,
            ...(args.toSpawnLabel !== undefined
              ? { toSpawnLabel: args.toSpawnLabel }
              : {}),
          }
        : {
            toGlobalX: args.toGlobalX,
            toGlobalY: args.toGlobalY,
          }),
      ...(args.direction !== undefined ? { direction: args.direction } : {}),
      ...(args.transition !== undefined ? { transition: args.transition } : {}),
      enabled: args.enabled ?? true,
      updatedAt: Date.now(),
    } satisfies Omit<PortalDefDoc, "_id" | "_creationTime">;

    const existing = await ctx.db
      .query("portalDefs")
      .withIndex("by_portal_id", (q) => q.eq("portalId", args.portalId))
      .first();

    if (existing) {
      await ctx.db.replace(existing._id, row);
      return await ctx.db.get(existing._id);
    }

    const insertedId = await ctx.db.insert("portalDefs", row);
    return await ctx.db.get(insertedId);
  },
});

export const removePortalDef = internalMutation({
  args: {
    portalId: v.string(),
  },
  handler: async (ctx, { portalId }) => {
    const existing = await ctx.db
      .query("portalDefs")
      .withIndex("by_portal_id", (q) => q.eq("portalId", portalId))
      .first();

    if (!existing) {
      return { removed: false };
    }

    await ctx.db.delete(existing._id);
    return { removed: true };
  },
});

export const recordTransition = internalMutation({
  args: {
    entityType: globalEntityTypeValidator,
    entityId: v.string(),
    portalId: v.string(),
    fromDimensionType: dimensionTypeValidator,
    fromMapName: v.optional(v.string()),
    toDimensionType: dimensionTypeValidator,
    toMapName: v.optional(v.string()),
    usedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireInstanceMapName(args.fromDimensionType, args.fromMapName, "fromMapName");
    requireInstanceMapName(args.toDimensionType, args.toMapName, "toMapName");

    const row = {
      entityType: args.entityType,
      entityId: args.entityId,
      portalId: args.portalId,
      fromDimensionType: args.fromDimensionType,
      ...(args.fromMapName !== undefined ? { fromMapName: args.fromMapName } : {}),
      toDimensionType: args.toDimensionType,
      ...(args.toMapName !== undefined ? { toMapName: args.toMapName } : {}),
      usedAt: args.usedAt ?? Date.now(),
    } satisfies Omit<Doc<"portalTransitions">, "_id" | "_creationTime">;

    const insertedId = await ctx.db.insert("portalTransitions", row);
    return await ctx.db.get(insertedId);
  },
});
