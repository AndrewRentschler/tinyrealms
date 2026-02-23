import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { computeChunkXY } from "../lib/globalSpatial.ts";

const GLOBAL_WORLD_KEY = "global";
const PROFILE_ENTITY_TYPE = "profile" as const;

type EntityLocationDoc = Doc<"entityLocations">;
type GlobalSpatialDoc = Doc<"globalSpatial">;
type PortalDefDoc = Doc<"portalDefs">;

type SourceLocation = Pick<
  EntityLocationDoc,
  "dimensionType" | "worldKey" | "mapName"
>;

async function requireOwnedProfile(
  ctx: MutationCtx,
  profileId: Doc<"profiles">["_id"],
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const profile = await ctx.db.get(profileId);
  if (!profile) {
    throw new Error("Profile not found");
  }
  if (profile.userId !== userId) {
    throw new Error("Cannot use portal for another profile");
  }

  return profile;
}

function requireEnabledPortal(portal: PortalDefDoc | null): PortalDefDoc {
  if (!portal || portal.enabled === false) {
    throw new Error("Portal is unavailable");
  }
  return portal;
}

function resolveSourceLocation(
  profile: Doc<"profiles">,
  entityLocation: EntityLocationDoc | null,
): SourceLocation {
  if (entityLocation) {
    return {
      dimensionType: entityLocation.dimensionType,
      worldKey: entityLocation.worldKey,
      mapName: entityLocation.mapName,
    };
  }

  return {
    dimensionType: "instance",
    worldKey: GLOBAL_WORLD_KEY,
    mapName: profile.mapName,
  };
}

function validateSourceCompatibility(
  source: SourceLocation,
  portal: PortalDefDoc,
) {
  if (source.dimensionType !== portal.fromDimensionType) {
    throw new Error("Portal source dimension mismatch");
  }

  if (portal.fromDimensionType === "instance") {
    if (!source.mapName) {
      throw new Error("Source map is required for instance transitions");
    }
    if (portal.fromMapName !== source.mapName) {
      throw new Error("Portal source map mismatch");
    }
  }
}

export const usePortal = mutation({
  args: {
    profileId: v.id("profiles"),
    portalId: v.string(),
    chunkWorldWidth: v.float64(),
    chunkWorldHeight: v.float64(),
  },
  handler: async (ctx, args) => {
    const profile = await requireOwnedProfile(ctx, args.profileId);

    const portal = requireEnabledPortal(
      await ctx.db
        .query("portalDefs")
        .withIndex("by_portal_id", (q) => q.eq("portalId", args.portalId))
        .first(),
    );

    const entityId = String(args.profileId);
    const existingLocation = await ctx.db
      .query("entityLocations")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", PROFILE_ENTITY_TYPE).eq("entityId", entityId),
      )
      .first();
    const source = resolveSourceLocation(profile, existingLocation);
    validateSourceCompatibility(source, portal);

    const usedAt = Date.now();

    if (portal.toDimensionType === "instance" && !portal.toMapName) {
      throw new Error("Portal destination map is required for instance transitions");
    }
    if (
      portal.toDimensionType === "global" &&
      (portal.toGlobalX === undefined || portal.toGlobalY === undefined)
    ) {
      throw new Error(
        "Portal destination coordinates are required for global transitions",
      );
    }

    const destinationWorldKey = source.worldKey;
    const destinationMapName =
      portal.toDimensionType === "instance" ? portal.toMapName : undefined;
    const destinationGlobalX =
      portal.toDimensionType === "global" ? portal.toGlobalX : undefined;
    const destinationGlobalY =
      portal.toDimensionType === "global" ? portal.toGlobalY : undefined;
    const nextLastGlobalX =
      portal.toDimensionType === "global"
        ? destinationGlobalX
        : (existingLocation?.lastGlobalX ??
          (source.dimensionType === "global" && profile.x !== undefined
            ? profile.x
            : undefined));
    const nextLastGlobalY =
      portal.toDimensionType === "global"
        ? destinationGlobalY
        : (existingLocation?.lastGlobalY ??
          (source.dimensionType === "global" && profile.y !== undefined
            ? profile.y
            : undefined));

    const nextLocation = {
      entityType: PROFILE_ENTITY_TYPE,
      entityId,
      dimensionType: portal.toDimensionType,
      worldKey: destinationWorldKey,
      ...(portal.toDimensionType === "instance"
        ? { mapName: destinationMapName }
        : {}),
      lastPortalId: portal.portalId,
      lastPortalUsedAt: usedAt,
      ...(nextLastGlobalX !== undefined ? { lastGlobalX: nextLastGlobalX } : {}),
      ...(nextLastGlobalY !== undefined ? { lastGlobalY: nextLastGlobalY } : {}),
      updatedAt: usedAt,
    } satisfies Omit<EntityLocationDoc, "_id" | "_creationTime">;

    if (existingLocation) {
      await ctx.db.replace(existingLocation._id, nextLocation);
    } else {
      await ctx.db.insert("entityLocations", nextLocation);
    }

    const existingGlobalSpatial = await ctx.db
      .query("globalSpatial")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", PROFILE_ENTITY_TYPE).eq("entityId", entityId),
      )
      .first();

    if (portal.toDimensionType === "instance") {
      if (existingGlobalSpatial) {
        await ctx.db.delete(existingGlobalSpatial._id);
      }

      await ctx.db.patch(profile._id, { mapName: destinationMapName });
    } else {
      if (destinationGlobalX === undefined || destinationGlobalY === undefined) {
        throw new Error(
          "Portal destination coordinates are required for global transitions",
        );
      }
      const globalX = destinationGlobalX;
      const globalY = destinationGlobalY;

      const { chunkX, chunkY } = computeChunkXY(
        globalX,
        globalY,
        args.chunkWorldWidth,
        args.chunkWorldHeight,
      );

      const globalSpatialPatch = {
        worldKey: destinationWorldKey,
        entityType: PROFILE_ENTITY_TYPE,
        entityId,
        x: globalX,
        y: globalY,
        dx: 0,
        dy: 0,
        chunkX,
        chunkY,
        animation: existingGlobalSpatial?.animation ?? "idle",
        updatedAt: usedAt,
      } satisfies Omit<GlobalSpatialDoc, "_id" | "_creationTime">;

      if (existingGlobalSpatial) {
        await ctx.db.patch(existingGlobalSpatial._id, globalSpatialPatch);
      } else {
        await ctx.db.insert("globalSpatial", globalSpatialPatch);
      }

      await ctx.db.patch(profile._id, {
        mapName: "global",
        x: globalX,
        y: globalY,
      });
    }

    await ctx.db.insert("portalTransitions", {
      entityType: PROFILE_ENTITY_TYPE,
      entityId,
      portalId: portal.portalId,
      fromDimensionType: source.dimensionType,
      ...(source.mapName !== undefined ? { fromMapName: source.mapName } : {}),
      toDimensionType: portal.toDimensionType,
      ...(portal.toDimensionType === "instance" ? { toMapName: destinationMapName } : {}),
      usedAt,
    });

    return {
      portalId: portal.portalId,
      dimensionType: portal.toDimensionType,
      worldKey: destinationWorldKey,
      mapName: destinationMapName,
      spawnLabel:
        portal.toDimensionType === "instance" ? portal.toSpawnLabel : undefined,
      direction: portal.direction,
      x: destinationGlobalX,
      y: destinationGlobalY,
      usedAt,
    };
  },
});
