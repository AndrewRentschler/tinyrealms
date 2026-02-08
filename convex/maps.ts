import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMapEditor } from "./lib/requireMapEditor";
import { requireAdmin } from "./lib/requireAdmin";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

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
    return all.filter((m) => (m as any).status !== "draft");
  },
});

/** List map summaries (lightweight, no tile data) */
export const listSummaries = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("maps").collect();
    return all.map((m) => ({
      _id: m._id,
      name: m.name,
      width: m.width,
      height: m.height,
      tileWidth: m.tileWidth,
      tileHeight: m.tileHeight,
      status: (m as any).status ?? "published",
      isHub: (m as any).isHub ?? false,
      combatEnabled: (m as any).combatEnabled ?? false,
      musicUrl: (m as any).musicUrl,
      creatorProfileId: (m as any).creatorProfileId,
      editors: (m as any).editors ?? [],
      portalCount: ((m as any).portals ?? []).length,
      updatedAt: m.updatedAt,
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

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const portalValidator = v.object({
  name: v.string(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  targetMap: v.string(),
  targetSpawn: v.string(),
  direction: v.optional(v.string()),
  transition: v.optional(v.string()),
});

const labelValidator = v.object({
  name: v.string(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
});

const layerValidator = v.object({
  name: v.string(),
  type: v.union(v.literal("bg"), v.literal("obj"), v.literal("overlay")),
  tiles: v.string(),
  visible: v.boolean(),
});

/** Create a brand-new empty map. Requires admin. */
export const create = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    width: v.number(),
    height: v.number(),
    tileWidth: v.number(),
    tileHeight: v.number(),
    tilesetUrl: v.optional(v.string()),
    tilesetPxW: v.number(),
    tilesetPxH: v.number(),
    musicUrl: v.optional(v.string()),
    ambientSoundUrl: v.optional(v.string()),
    combatEnabled: v.optional(v.boolean()),
    isHub: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.profileId);

    // Unique name check
    const existing = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) throw new Error(`Map "${args.name}" already exists`);

    const emptyLayer = JSON.stringify(
      new Array(args.width * args.height).fill(-1),
    );
    const emptyCollision = JSON.stringify(
      new Array(args.width * args.height).fill(false),
    );

    // If this is marked as hub, unmark any existing hub
    if (args.isHub) {
      const all = await ctx.db.query("maps").collect();
      for (const m of all) {
        if ((m as any).isHub) {
          await ctx.db.patch(m._id, { isHub: false } as any);
        }
      }
    }

    return await ctx.db.insert("maps", {
      name: args.name,
      width: args.width,
      height: args.height,
      tileWidth: args.tileWidth,
      tileHeight: args.tileHeight,
      tilesetUrl: args.tilesetUrl,
      tilesetPxW: args.tilesetPxW,
      tilesetPxH: args.tilesetPxH,
      layers: [
        { name: "bg0", type: "bg" as const, tiles: emptyLayer, visible: true },
        { name: "bg1", type: "bg" as const, tiles: emptyLayer, visible: true },
        { name: "obj0", type: "obj" as const, tiles: emptyLayer, visible: true },
        { name: "obj1", type: "obj" as const, tiles: emptyLayer, visible: true },
        { name: "overlay", type: "overlay" as const, tiles: emptyLayer, visible: true },
      ],
      collisionMask: emptyCollision,
      labels: [
        // Default spawn point
        { name: "start1", x: Math.floor(args.width / 2), y: Math.floor(args.height / 2), width: 1, height: 1 },
      ],
      portals: [],
      musicUrl: args.musicUrl,
      ambientSoundUrl: args.ambientSoundUrl,
      combatEnabled: args.combatEnabled ?? false,
      status: "draft",
      isHub: args.isHub ?? false,
      editors: [args.profileId],
      creatorProfileId: args.profileId,
      updatedAt: Date.now(),
    });
  },
});

/** Save the full map state (upsert by name). Requires map editor or admin. */
export const saveFullMap = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    width: v.number(),
    height: v.number(),
    tileWidth: v.number(),
    tileHeight: v.number(),
    tilesetUrl: v.optional(v.string()),
    tilesetPxW: v.number(),
    tilesetPxH: v.number(),
    layers: v.array(layerValidator),
    collisionMask: v.string(),
    labels: v.array(labelValidator),
    portals: v.optional(v.array(portalValidator)),
    animationUrl: v.optional(v.string()),
    musicUrl: v.optional(v.string()),
    ambientSoundUrl: v.optional(v.string()),
    combatEnabled: v.optional(v.boolean()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireMapEditor(ctx, args.profileId, args.name);

    const existing = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    const data = {
      name: args.name,
      width: args.width,
      height: args.height,
      tileWidth: args.tileWidth,
      tileHeight: args.tileHeight,
      tilesetUrl: args.tilesetUrl,
      tilesetPxW: args.tilesetPxW,
      tilesetPxH: args.tilesetPxH,
      layers: args.layers,
      collisionMask: args.collisionMask,
      labels: args.labels,
      portals: args.portals ?? [],
      animationUrl: args.animationUrl,
      musicUrl: args.musicUrl,
      ambientSoundUrl: args.ambientSoundUrl,
      combatEnabled: args.combatEnabled,
      status: args.status,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("maps", {
        ...data,
        editors: [args.profileId],
        creatorProfileId: args.profileId,
      } as any);
    }
  },
});

/** Update map metadata (music, combat, status, editors). Requires map editor. */
export const updateMetadata = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    musicUrl: v.optional(v.string()),
    ambientSoundUrl: v.optional(v.string()),
    combatEnabled: v.optional(v.boolean()),
    status: v.optional(v.string()),
    isHub: v.optional(v.boolean()),
  },
  handler: async (ctx, { profileId, name, ...updates }) => {
    await requireMapEditor(ctx, profileId, name);

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!map) throw new Error(`Map "${name}" not found`);

    // If marking as hub, unmark others
    if (updates.isHub) {
      const all = await ctx.db.query("maps").collect();
      for (const m of all) {
        if ((m as any).isHub && m._id !== map._id) {
          await ctx.db.patch(m._id, { isHub: false } as any);
        }
      }
    }

    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (updates.musicUrl !== undefined) patch.musicUrl = updates.musicUrl;
    if (updates.ambientSoundUrl !== undefined) patch.ambientSoundUrl = updates.ambientSoundUrl;
    if (updates.combatEnabled !== undefined) patch.combatEnabled = updates.combatEnabled;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.isHub !== undefined) patch.isHub = updates.isHub;

    await ctx.db.patch(map._id, patch);
  },
});

/** Add/remove an editor for a map. Requires map creator or global admin. */
export const setEditors = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    editors: v.array(v.id("profiles")),
  },
  handler: async (ctx, { profileId, name, editors }) => {
    // Only creator or global admin can change editors
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!map) throw new Error(`Map "${name}" not found`);

    const isGlobalAdmin = (profile as any).role === "admin";
    const isCreator = (map as any).creatorProfileId === profileId;
    if (!isGlobalAdmin && !isCreator) {
      throw new Error("Only the map creator or a global admin can change editors");
    }

    await ctx.db.patch(map._id, { editors, updatedAt: Date.now() } as any);
  },
});

/** Delete a map and all its objects. Requires global admin. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
  },
  handler: async (ctx, { profileId, name }) => {
    await requireAdmin(ctx, profileId);

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!map) throw new Error(`Map "${name}" not found`);

    // Delete map objects
    const objs = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", name))
      .collect();
    for (const o of objs) await ctx.db.delete(o._id);

    // Delete NPC state
    const npcs = await ctx.db
      .query("npcState")
      .withIndex("by_map", (q) => q.eq("mapName", name))
      .collect();
    for (const n of npcs) await ctx.db.delete(n._id);

    await ctx.db.delete(map._id);
  },
});

// Legacy mutations (kept for compatibility)

export const updateLayer = mutation({
  args: {
    mapId: v.id("maps"),
    layerIndex: v.number(),
    tiles: v.string(),
  },
  handler: async (ctx, { mapId, layerIndex, tiles }) => {
    const map = await ctx.db.get(mapId);
    if (!map) throw new Error("Map not found");

    const layers = [...map.layers];
    layers[layerIndex] = { ...layers[layerIndex], tiles };

    await ctx.db.patch(mapId, { layers, updatedAt: Date.now() });
  },
});

export const updateCollision = mutation({
  args: {
    mapId: v.id("maps"),
    collisionMask: v.string(),
  },
  handler: async (ctx, { mapId, collisionMask }) => {
    await ctx.db.patch(mapId, { collisionMask, updatedAt: Date.now() });
  },
});

export const updateLabels = mutation({
  args: {
    mapId: v.id("maps"),
    labels: v.array(labelValidator),
  },
  handler: async (ctx, { mapId, labels }) => {
    await ctx.db.patch(mapId, { labels, updatedAt: Date.now() });
  },
});
