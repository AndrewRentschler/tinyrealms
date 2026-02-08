/**
 * Admin mutations for managing game state.
 * Run via: npx convex run admin:clearChat
 *          npx convex run admin:clearProfiles
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Delete all chat messages */
export const clearChat = mutation({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db.query("messages").collect();
    let count = 0;
    for (const m of messages) {
      await ctx.db.delete(m._id);
      count++;
    }
    return { deleted: count };
  },
});

/** Delete all profiles and their associated presence rows */
export const clearProfiles = mutation({
  args: {},
  handler: async (ctx) => {
    // Remove all presence first
    const presence = await ctx.db.query("presence").collect();
    for (const p of presence) {
      await ctx.db.delete(p._id);
    }

    // Remove all profiles
    const profiles = await ctx.db.query("profiles").collect();
    let count = 0;
    for (const p of profiles) {
      await ctx.db.delete(p._id);
      count++;
    }
    return { deletedProfiles: count, deletedPresence: presence.length };
  },
});

/** Delete all presence rows (useful if ghosts are stuck) */
export const clearPresence = mutation({
  args: {},
  handler: async (ctx) => {
    const presence = await ctx.db.query("presence").collect();
    for (const p of presence) {
      await ctx.db.delete(p._id);
    }
    return { deleted: presence.length };
  },
});

/** Delete all placed map objects (reset a map to empty) */
export const clearMapObjects = mutation({
  args: {},
  handler: async (ctx) => {
    const objects = await ctx.db.query("mapObjects").collect();
    for (const o of objects) {
      await ctx.db.delete(o._id);
    }
    return { deleted: objects.length };
  },
});

/** Backfill role field on profiles that lack it */
export const backfillRoles = mutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    let patched = 0;
    for (const p of profiles) {
      if (!(p as any).role) {
        // First profile gets admin, rest get player
        const role = patched === 0 ? "admin" : "player";
        await ctx.db.patch(p._id, { role });
        patched++;
      }
    }
    return { patched };
  },
});

/** List all profiles (for admin inspection) */
export const listProfiles = query({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    return profiles.map((p) => ({
      _id: p._id,
      name: p.name,
      role: p.role,
      level: p.stats.level,
      createdAt: p.createdAt,
    }));
  },
});

/** Backfill multi-map fields on existing maps (portals, music, editors, etc.) */
export const backfillMaps = mutation({
  args: {},
  handler: async (ctx) => {
    const maps = await ctx.db.query("maps").collect();
    let patched = 0;
    for (const m of maps) {
      const updates: Record<string, any> = {};
      if (!(m as any).portals) updates.portals = [];
      if ((m as any).status === undefined) updates.status = "published";
      if ((m as any).combatEnabled === undefined) updates.combatEnabled = false;
      if ((m as any).isHub === undefined) updates.isHub = false;
      if ((m as any).editors === undefined) updates.editors = [];
      // Set musicUrl for cozy-cabin if not set
      if (m.name === "cozy-cabin" && !(m as any).musicUrl) {
        updates.musicUrl = "/assets/audio/cozy.m4a";
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(m._id, updates);
        patched++;
      }
    }
    return { total: maps.length, patched };
  },
});

/** Reset a profile's map by name — sends them back to cozy-cabin (or any map) */
export const resetProfileMap = mutation({
  args: {
    name: v.string(),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { name, mapName }) => {
    const target = mapName ?? "cozy-cabin";
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!profile) throw new Error(`Profile "${name}" not found`);

    // Destructure out _id, _creationTime, and the fields we want to clear
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, _creationTime, x: _x, y: _y, direction: _d, mapName: _m, ...rest } = profile;
    await ctx.db.replace(_id, { ...rest, mapName: target });
    return { name: profile.name, mapName: target };
  },
});

/** Reset ALL profiles to the default map */
export const resetAllProfileMaps = mutation({
  args: {
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { mapName }) => {
    const target = mapName ?? "cozy-cabin";
    const profiles = await ctx.db.query("profiles").collect();
    let count = 0;
    for (const p of profiles) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _id, _creationTime, x: _x, y: _y, direction: _d, mapName: _m, ...rest } = p;
      await ctx.db.replace(_id, { ...rest, mapName: target });
      count++;
    }
    return { reset: count, mapName: target };
  },
});

/** Dump all world state for debugging / backup */
export const dumpAll = query({
  args: {
    includeTiles: v.optional(v.boolean()), // include full tile data in maps (can be huge)
  },
  handler: async (ctx, { includeTiles }) => {
    const maps = await ctx.db.query("maps").collect();
    const spriteDefinitions = await ctx.db.query("spriteDefinitions").collect();
    const npcProfiles = await ctx.db.query("npcProfiles").collect();
    const mapObjects = await ctx.db.query("mapObjects").collect();
    const profiles = await ctx.db.query("profiles").collect();
    const presence = await ctx.db.query("presence").collect();
    const npcState = await ctx.db.query("npcState").collect();
    const itemDefs = await ctx.db.query("itemDefs").collect();
    const worldItems = await ctx.db.query("worldItems").collect();
    const messages = await ctx.db.query("messages").collect();
    const spriteSheets = await ctx.db.query("spriteSheets").collect();
    const quests = await ctx.db.query("quests").collect();
    const lore = await ctx.db.query("lore").collect();

    // Optionally strip bulky tile data from maps
    const mapsOut = maps.map((m) => {
      if (includeTiles) return m;
      return {
        ...m,
        layers: m.layers.map((l) => ({
          ...l,
          tiles: `<${l.tiles.length} chars>`, // placeholder
        })),
        collisionMask: `<${m.collisionMask.length} chars>`,
      };
    });

    return {
      _exportedAt: new Date().toISOString(),
      maps: mapsOut,
      spriteDefinitions,
      spriteSheets: spriteSheets.map((s) => ({
        ...s,
        // Don't dump full frame data (huge), just counts
        frames: typeof s.frames === "object" ? `<${Object.keys(s.frames).length} frames>` : s.frames,
      })),
      npcProfiles,
      mapObjects,
      profiles,
      presence,
      npcState,
      itemDefs,
      worldItems,
      messages: messages.slice(-50), // last 50 messages only
      quests,
      lore,
      _counts: {
        maps: maps.length,
        spriteDefinitions: spriteDefinitions.length,
        spriteSheets: spriteSheets.length,
        npcProfiles: npcProfiles.length,
        mapObjects: mapObjects.length,
        profiles: profiles.length,
        presence: presence.length,
        npcState: npcState.length,
        itemDefs: itemDefs.length,
        worldItems: worldItems.length,
        messages: messages.length,
        quests: quests.length,
        lore: lore.length,
      },
    };
  },
});

/** Set a profile's role by name (convenience for CLI) */
export const setRole = mutation({
  args: {
    name: v.string(),
    role: v.string(),
  },
  handler: async (ctx, { name, role }) => {
    if (role !== "admin" && role !== "player") {
      throw new Error(`Invalid role "${role}". Must be "admin" or "player".`);
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!profile) throw new Error(`Profile "${name}" not found`);
    await ctx.db.patch(profile._id, { role });
    return { name: profile.name, newRole: role };
  },
});
