import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMapEditor, isMapOwner } from "./lib/requireMapEditor";
import { requireSuperuser } from "./lib/requireSuperuser";
import { getAuthUserId } from "@convex-dev/auth/server";

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

/**
 * List map summaries (lightweight, no tile data).
 * Returns only maps the user should see:
 *   - "system" maps (visible to everyone)
 *   - Maps owned by the current user
 * Superusers see all maps.
 */
export const listSummaries = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const all = await ctx.db.query("maps").collect();

    // Check if the user is a superuser (see all maps)
    let isSuperuser = false;
    if (userId) {
      const profiles = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      isSuperuser = profiles.some((p) => (p as any).role === "superuser");
    }

    const filtered = all.filter((m) => {
      if (isSuperuser) return true;
      const mapType = (m as any).mapType ?? "private";
      if (mapType === "system") return true;
      if (userId && (m as any).createdBy === userId) return true;
      return false;
    });

    return filtered.map((m) => ({
      _id: m._id,
      name: m.name,
      width: m.width,
      height: m.height,
      tileWidth: m.tileWidth,
      tileHeight: m.tileHeight,
      status: (m as any).status ?? "published",
      mapType: (m as any).mapType ?? "private",
      combatEnabled: (m as any).combatEnabled ?? false,
      combatSettings: (m as any).combatSettings,
      musicUrl: (m as any).musicUrl,
      creatorProfileId: (m as any).creatorProfileId,
      createdBy: (m as any).createdBy,
      ownedByCurrentUser: !!(userId && (m as any).createdBy === userId),
      editors: (m as any).editors ?? [],
      portalCount: ((m as any).portals ?? []).length,
      labelNames: (m.labels ?? []).map((l: any) => l.name as string),
      updatedAt: m.updatedAt,
    }));
  },
});

/**
 * List maps available as starting worlds when creating a profile.
 * Includes: "system" maps + maps created by the current user.
 */
export const listStartMaps = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const all = await ctx.db.query("maps").collect();

    return all
      .filter((m) => {
        const mapType = (m as any).mapType ?? "private";
        if (mapType === "system") return true;
        // Include maps the current user created
        if (userId && (m as any).createdBy === userId) return true;
        return false;
      })
      .map((m) => ({
        name: m.name,
        mapType: (m as any).mapType ?? "private",
        labelNames: (m.labels ?? []).map((l: any) => l.name as string),
      }));
  },
});

/** Default starting map name (used as fallback when a profile has no mapName) */
export const DEFAULT_START_MAP = "cozy-cabin";

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
  tilesetUrl: v.optional(v.string()),
});

const mapTypeValidator = v.union(
  v.literal("public"),
  v.literal("private"),
  v.literal("system"),
);

const weatherModeValidator = v.union(
  v.literal("clear"),
  v.literal("rainy"),
  v.literal("scattered_rain"),
);

const weatherIntensityValidator = v.union(
  v.literal("light"),
  v.literal("medium"),
  v.literal("heavy"),
);

const combatSettingsValidator = v.object({
  attackRangePx: v.optional(v.number()),
  playerAttackCooldownMs: v.optional(v.number()),
  npcHitCooldownMs: v.optional(v.number()),
  damageVariancePct: v.optional(v.number()),
});

/**
 * Validate portal permissions.
 * - Regular users can only create portals between maps they own.
 * - Superusers can create cross-user portals only to public/system maps.
 */
async function validatePortals(
  ctx: any,
  profileId: any,
  sourceMapName: string,
  portals: Array<{ targetMap: string; [key: string]: any }>,
) {
  if (!portals || portals.length === 0) return;

  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Profile not found");

  const isSuperuser = (profile as any).role === "superuser";

  for (const portal of portals) {
    if (portal.targetMap === sourceMapName) continue; // portal within same map is always OK
    const ownsTarget = await isMapOwner(ctx, profileId, portal.targetMap);
    if (ownsTarget) continue;

    if (!isSuperuser) {
      throw new Error(
        `Permission denied: you cannot create a portal to "${portal.targetMap}" ` +
        `because you don't own that map. Only superusers can create cross-user portals.`
      );
    }

    const target = await ctx.db
      .query("maps")
      .withIndex("by_name", (q: any) => q.eq("name", portal.targetMap))
      .first();
    if (!target) throw new Error(`Target map "${portal.targetMap}" not found`);
    const targetType = (target as any).mapType ?? "private";
    if (targetType !== "public" && targetType !== "system") {
      throw new Error(
        `Permission denied: "${portal.targetMap}" is private. ` +
        `Set map type to "public" for cross-user portal links.`
      );
    }
  }
}

/** Create a brand-new empty map. Any authenticated user can create maps. */
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
    weatherMode: v.optional(weatherModeValidator),
    weatherIntensity: v.optional(weatherIntensityValidator),
    weatherRainSfx: v.optional(v.boolean()),
    weatherLightningEnabled: v.optional(v.boolean()),
    weatherLightningChancePerSec: v.optional(v.number()),
    combatEnabled: v.optional(v.boolean()),
    combatSettings: v.optional(combatSettingsValidator),
    mapType: v.optional(mapTypeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.userId !== userId) throw new Error("Not your profile");
    const mapType = args.mapType ?? "private";
    if (mapType === "system" && (profile as any).role !== "superuser") {
      throw new Error(`Only superusers can set map type to "system"`);
    }

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
      weatherMode: args.weatherMode ?? "clear",
      weatherIntensity: args.weatherIntensity ?? "medium",
      weatherRainSfx: args.weatherRainSfx ?? false,
      weatherLightningEnabled: args.weatherLightningEnabled ?? false,
      weatherLightningChancePerSec: args.weatherLightningChancePerSec ?? 0.03,
      combatEnabled: args.combatEnabled ?? false,
      combatSettings: args.combatSettings,
      status: "draft",
      mapType,
      editors: [args.profileId],
      creatorProfileId: args.profileId,
      createdBy: userId,
      updatedAt: Date.now(),
    });
  },
});

/** Save the full map state (upsert by name). Requires map editor or superuser. */
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
    weatherMode: v.optional(weatherModeValidator),
    weatherIntensity: v.optional(weatherIntensityValidator),
    weatherRainSfx: v.optional(v.boolean()),
    weatherLightningEnabled: v.optional(v.boolean()),
    weatherLightningChancePerSec: v.optional(v.number()),
    combatEnabled: v.optional(v.boolean()),
    combatSettings: v.optional(combatSettingsValidator),
    status: v.optional(v.string()),
    mapType: v.optional(mapTypeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await requireMapEditor(ctx, args.profileId, args.name);

    // Validate portal permissions (cross-user portals require superuser)
    if (args.portals && args.portals.length > 0) {
      await validatePortals(ctx, args.profileId, args.name, args.portals);
    }

    const existing = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    // Determine mapType: explicit arg > existing value > "private"
    let mapType: string;
    if (args.mapType) {
      mapType = args.mapType;
    } else if (existing) {
      mapType = (existing as any).mapType ?? "private";
    } else {
      mapType = "private";
    }

    // Determine weather mode: explicit arg > existing value > "clear"
    let weatherMode: "clear" | "rainy" | "scattered_rain";
    if (args.weatherMode) {
      weatherMode = args.weatherMode;
    } else if (existing && (existing as any).weatherMode) {
      weatherMode = (existing as any).weatherMode as "clear" | "rainy" | "scattered_rain";
    } else {
      weatherMode = "clear";
    }

    // Determine weather intensity: explicit arg > existing value > "medium"
    let weatherIntensity: "light" | "medium" | "heavy";
    if (args.weatherIntensity) {
      weatherIntensity = args.weatherIntensity;
    } else if (existing && (existing as any).weatherIntensity) {
      weatherIntensity = (existing as any).weatherIntensity as "light" | "medium" | "heavy";
    } else {
      weatherIntensity = "medium";
    }

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
      weatherMode,
      weatherIntensity,
      weatherRainSfx: args.weatherRainSfx ?? (existing as any)?.weatherRainSfx ?? false,
      weatherLightningEnabled: args.weatherLightningEnabled ?? (existing as any)?.weatherLightningEnabled ?? false,
      weatherLightningChancePerSec: args.weatherLightningChancePerSec ?? (existing as any)?.weatherLightningChancePerSec ?? 0.03,
      combatEnabled: args.combatEnabled,
      combatSettings: args.combatSettings,
      status: args.status,
      mapType,
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
        createdBy: userId,
      } as any);
    }
  },
});

/** Update map metadata (music, combat, status). Requires map editor. */
export const updateMetadata = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    musicUrl: v.optional(v.string()),
    ambientSoundUrl: v.optional(v.string()),
    weatherMode: v.optional(weatherModeValidator),
    weatherIntensity: v.optional(weatherIntensityValidator),
    weatherRainSfx: v.optional(v.boolean()),
    weatherLightningEnabled: v.optional(v.boolean()),
    weatherLightningChancePerSec: v.optional(v.number()),
    combatEnabled: v.optional(v.boolean()),
    combatSettings: v.optional(combatSettingsValidator),
    status: v.optional(v.string()),
    mapType: v.optional(mapTypeValidator),
  },
  handler: async (ctx, { profileId, name, ...updates }) => {
    await requireMapEditor(ctx, profileId, name);

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!map) throw new Error(`Map "${name}" not found`);

    if (updates.mapType !== undefined) {
      const profile = await ctx.db.get(profileId);
      if (!profile) throw new Error("Profile not found");
      const isSuperuser = (profile as any).role === "superuser";
      const owner = await isMapOwner(ctx, profileId, name);
      if (!owner && !isSuperuser) {
        throw new Error("Only the map owner or a superuser can change map type");
      }
      if (updates.mapType === "system" && !isSuperuser) {
        throw new Error(`Only superusers can set map type to "system"`);
      }
      // Prevent non-superusers from changing a system map's type
      const currentType = (map as any).mapType ?? "private";
      if (currentType === "system" && !isSuperuser) {
        throw new Error("Only superusers can change the type of system maps");
      }
    }

    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (updates.musicUrl !== undefined) patch.musicUrl = updates.musicUrl;
    if (updates.ambientSoundUrl !== undefined) patch.ambientSoundUrl = updates.ambientSoundUrl;
    if (updates.weatherMode !== undefined) patch.weatherMode = updates.weatherMode;
    if (updates.weatherIntensity !== undefined) patch.weatherIntensity = updates.weatherIntensity;
    if (updates.weatherRainSfx !== undefined) patch.weatherRainSfx = updates.weatherRainSfx;
    if (updates.weatherLightningEnabled !== undefined) patch.weatherLightningEnabled = updates.weatherLightningEnabled;
    if (updates.weatherLightningChancePerSec !== undefined) patch.weatherLightningChancePerSec = updates.weatherLightningChancePerSec;
    if (updates.combatEnabled !== undefined) patch.combatEnabled = updates.combatEnabled;
    if (updates.combatSettings !== undefined) patch.combatSettings = updates.combatSettings;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.mapType !== undefined) patch.mapType = updates.mapType;

    await ctx.db.patch(map._id, patch);
  },
});

/** Add/remove an editor for a map. Requires map creator (by user) or superuser. */
export const setEditors = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    editors: v.array(v.id("profiles")),
  },
  handler: async (ctx, { profileId, name, editors }) => {
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!map) throw new Error(`Map "${name}" not found`);

    const isSuperuser = (profile as any).role === "superuser";
    const isCreatorByUser = map.createdBy && profile.userId && map.createdBy === profile.userId;
    const isCreatorByProfile = (map as any).creatorProfileId === profileId;
    if (!isSuperuser && !isCreatorByUser && !isCreatorByProfile) {
      throw new Error("Only the map creator or a superuser can change editors");
    }

    await ctx.db.patch(map._id, { editors, updatedAt: Date.now() } as any);
  },
});

/** Delete a map and all its objects. Requires superuser or map creator. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
  },
  handler: async (ctx, { profileId, name }) => {
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!map) throw new Error(`Map "${name}" not found`);

    const isSuperuser = (profile as any).role === "superuser";
    const isCreatorByUser = map.createdBy && profile.userId && map.createdBy === profile.userId;
    const isCreatorByProfile = (map as any).creatorProfileId === profileId;
    if (!isSuperuser && !isCreatorByUser && !isCreatorByProfile) {
      throw new Error("Only the map creator or a superuser can delete maps");
    }

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

    // Delete world items on this map
    const worldItems = await ctx.db
      .query("worldItems")
      .withIndex("by_map", (q) => q.eq("mapName", name))
      .collect();
    for (const wi of worldItems) await ctx.db.delete(wi._id);

    // Delete chat messages scoped to this map
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_map_time", (q) => q.eq("mapName", name))
      .collect();
    for (const m of messages) await ctx.db.delete(m._id);

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
