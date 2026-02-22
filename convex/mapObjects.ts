import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireMapEditor } from "./lib/requireMapEditor";

function slugifyInstanceName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function generateUniqueNpcInstanceName(
  ctx: QueryCtx,
  baseInput: string,
  usedObjectNames?: Set<string>,
  usedProfileNames?: Set<string>,
): Promise<string> {
  const base = slugifyInstanceName(baseInput) || "npc";
  const objectNames =
    usedObjectNames ??
    new Set(
      (await ctx.db.query("mapObjects").collect())
        .map((o) => o.instanceName)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    );
  const profileNames =
    usedProfileNames ??
    new Set(
      (await ctx.db.query("npcProfiles").collect()).map((p) => String(p.name)),
    );

  let candidate = base;
  let suffix = 2;
  while (objectNames.has(candidate) || profileNames.has(candidate)) {
    candidate = `${base}-${suffix++}`;
  }
  objectNames.add(candidate);
  return candidate;
}

/** List all objects on a given map */
export const listByMap = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    return await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
  },
});

/** Place a new object on the map. Requires map editor. */
export const place = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    spriteDefName: v.string(),
    x: v.float64(),
    y: v.float64(),
    layer: v.number(),
    scaleOverride: v.optional(v.number()),
    flipX: v.optional(v.boolean()),
    // New: storage configuration
    hasStorage: v.optional(v.boolean()),
    storageCapacity: v.optional(v.number()),
    storageOwnerType: v.optional(
      v.union(v.literal("public"), v.literal("player")),
    ),
  },
  handler: async (
    ctx,
    { profileId, hasStorage, storageCapacity, storageOwnerType, ...args },
  ) => {
    await requireMapEditor(ctx, profileId, args.mapName);

    let instanceName: string | undefined = undefined;
    let storageId: Id<"storages"> | undefined = undefined;

    const def = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.spriteDefName))
      .first();

    if (def?.category === "npc") {
      instanceName = await generateUniqueNpcInstanceName(
        ctx,
        args.spriteDefName,
      );
    }

    // Create storage if requested
    if (hasStorage && storageCapacity && storageCapacity > 0) {
      const ownerType = storageOwnerType ?? "public";
      const ownerId = ownerType === "player" ? profileId : undefined;

      storageId = await ctx.db.insert("storages", {
        ownerType,
        ownerId,
        capacity: storageCapacity,
        slots: [],
        name: `${args.spriteDefName} Storage`,
        updatedAt: Date.now(),
      });
    }

    const id = await ctx.db.insert("mapObjects", {
      ...args,
      instanceName,
      storageId,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, {
      mapName: args.mapName,
    });
    return id;
  },
});

/** Move an existing object. Requires map editor. */
export const move = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    id: v.id("mapObjects"),
    x: v.float64(),
    y: v.float64(),
  },
  handler: async (ctx, { profileId, mapName, id, x, y }) => {
    await requireMapEditor(ctx, profileId, mapName);
    await ctx.db.patch(id, { x, y, updatedAt: Date.now() });
    // Keep runtime NPC state aligned when moving placed NPC objects in editor.
    const linkedNpcStates = await ctx.db
      .query("npcState")
      .withIndex("by_mapObject", (q) => q.eq("mapObjectId", id))
      .collect();
    for (const state of linkedNpcStates) {
      await ctx.db.patch(state._id, {
        x,
        y,
        spawnX: x,
        spawnY: y,
      });
    }
  },
});

/** Remove an object from the map. Requires map editor. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    id: v.id("mapObjects"),
  },
  handler: async (ctx, { profileId, mapName, id }) => {
    await requireMapEditor(ctx, profileId, mapName);
    await ctx.db.delete(id);
    await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, { mapName });
  },
});

/** Toggle on/off state of a map object. Any player can do this. */
export const toggle = mutation({
  args: {
    id: v.id("mapObjects"),
  },
  handler: async (ctx, { id }) => {
    const obj = await ctx.db.get(id);
    if (!obj) return { success: false };
    const newState = !obj.isOn;
    await ctx.db.patch(id, { isOn: newState, updatedAt: Date.now() });
    return { success: true, isOn: newState };
  },
});

/**
 * Bulk save: sync placed objects for a map.
 *
 * Objects that already exist in the DB (identified by `existingId`) are
 * **patched** — only position / layer / spriteDefName are updated.  Runtime
 * state like `isOn` is left untouched so toggles survive an editor save.
 *
 * Objects without an `existingId` are inserted as new.
 * Existing DB objects not present in the incoming list are deleted.
 */
export const bulkSave = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    objects: v.array(
      v.object({
        existingId: v.optional(v.id("mapObjects")),
        spriteDefName: v.string(),
        instanceName: v.optional(v.string()),
        x: v.float64(),
        y: v.float64(),
        layer: v.number(),
        scaleOverride: v.optional(v.number()),
        flipX: v.optional(v.boolean()),
        storageId: v.optional(v.id("storages")), // NEW: preserve storage link
        // NEW: storage configuration for new objects
        hasStorage: v.optional(v.boolean()),
        storageCapacity: v.optional(v.number()),
        storageOwnerType: v.optional(
          v.union(v.literal("public"), v.literal("player")),
        ),
      }),
    ),
  },
  handler: async (ctx, { profileId, mapName, objects }) => {
    await requireMapEditor(ctx, profileId, mapName);

    // Load existing objects on this map
    const existing = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    const existingById = new Map(existing.map((o) => [o._id, o]));

    // Track which existing IDs are still present in the editor
    const keptIds = new Set<string>();

    const now = Date.now();
    const usedObjectNames = new Set(
      existing
        .map((o) => o.instanceName)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    );
    const allProfiles = await ctx.db.query("npcProfiles").collect();
    const usedProfileNames = new Set(allProfiles.map((p) => String(p.name)));
    const allDefs = await ctx.db.query("spriteDefinitions").collect();
    const defByName = new Map(allDefs.map((d) => [d.name, d]));

    for (const obj of objects) {
      const {
        existingId,
        storageId: incomingStorageId,
        hasStorage,
        storageCapacity,
        storageOwnerType,
        ...fields
      } = obj;

      if (existingId && existingById.has(existingId)) {
        // Existing object — patch position / layout only; preserve isOn and storageId
        keptIds.add(existingId);
        const existingObj = existingById.get(existingId)!;
        let storageId = incomingStorageId ?? existingObj.storageId;

        // If storage was requested but doesn't exist, create it
        if (
          !storageId &&
          hasStorage &&
          storageCapacity &&
          storageCapacity > 0
        ) {
          const ownerType = storageOwnerType ?? "public";
          const ownerId = ownerType === "player" ? profileId : undefined;

          storageId = await ctx.db.insert("storages", {
            ownerType,
            ownerId,
            capacity: storageCapacity,
            slots: [],
            name: `${fields.spriteDefName} Storage`,
            updatedAt: now,
          });
        }
        // If storage exists but was explicitly removed (hasStorage is false)
        else if (storageId && hasStorage === false) {
          await ctx.db.delete(storageId);
          storageId = undefined;
        }

        await ctx.db.patch(existingId, {
          ...fields,
          storageId,
          updatedAt: now,
        });
      } else {
        // New object
        let instanceName = fields.instanceName;
        const def = defByName.get(obj.spriteDefName);
        if (def?.category === "npc" && !instanceName) {
          instanceName = await generateUniqueNpcInstanceName(
            ctx,
            obj.spriteDefName,
            usedObjectNames,
            usedProfileNames,
          );
        }

        let storageId = incomingStorageId;
        // Create storage if requested for a new object
        if (
          !storageId &&
          hasStorage &&
          storageCapacity &&
          storageCapacity > 0
        ) {
          const ownerType = storageOwnerType ?? "public";
          const ownerId = ownerType === "player" ? profileId : undefined;

          storageId = await ctx.db.insert("storages", {
            ownerType,
            ownerId,
            capacity: storageCapacity,
            slots: [],
            name: `${fields.spriteDefName} Storage`,
            updatedAt: now,
          });
        }

        await ctx.db.insert("mapObjects", {
          mapName,
          ...fields,
          storageId,
          ...(instanceName ? { instanceName } : {}),
          updatedAt: now,
        });
      }
    }

    // Delete objects removed by the editor
    for (const old of existing) {
      if (!keptIds.has(old._id)) {
        // Optional: Clean up orphaned storage rows
        if (old.storageId) {
          await ctx.db.delete(old.storageId);
        }
        await ctx.db.delete(old._id);
      }
    }

    // Sync NPC runtime state (creates/removes npcState rows as needed)
    await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, { mapName });
  },
});
