/**
 * Admin: dump world state and restore helpers.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireAdminKey } from "../lib/requireAdminKey";

export const RESTORE_ALLOWED_TABLES = new Set([
  "maps",
  "spriteDefinitions",
  "npcProfiles",
  "mapObjects",
  "itemDefs",
  "worldItems",
  "messages",
]);

/** Dump all world state for debugging / backup */
export const dumpAll = query({
  args: {
    adminKey: v.string(),
    includeTiles: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminKey, includeTiles }) => {
    requireAdminKey(adminKey);
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

    const mapsOut = maps.map((m) => {
      if (includeTiles) return m;
      return {
        ...m,
        layers: m.layers.map((l) => ({
          ...l,
          tiles: `<${l.tiles.length} chars>`,
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
        frames:
          typeof s.frames === "object"
            ? `<${Object.keys(s.frames).length} frames>`
            : s.frames,
      })),
      npcProfiles,
      mapObjects,
      profiles,
      presence,
      npcState,
      itemDefs,
      worldItems,
      messages: messages.slice(-50),
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

/** Restore helper: clear one allowed table before selective restore */
export const restoreClearTable = mutation({
  args: {
    adminKey: v.string(),
    table: v.string(),
  },
  handler: async (ctx, { adminKey, table }) => {
    requireAdminKey(adminKey);
    if (!RESTORE_ALLOWED_TABLES.has(table)) {
      throw new Error(`Table "${table}" is not allowed for selective restore`);
    }
    const rows = await (ctx.db.query(table as "maps") as any).collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return { table, cleared: rows.length };
  },
});

/** Restore helper: insert one chunk into an allowed table */
export const restoreInsertChunk = mutation({
  args: {
    adminKey: v.string(),
    table: v.string(),
    rows: v.array(v.any()),
  },
  handler: async (ctx, { adminKey, table, rows }) => {
    requireAdminKey(adminKey);
    if (!RESTORE_ALLOWED_TABLES.has(table)) {
      throw new Error(`Table "${table}" is not allowed for selective restore`);
    }
    if (rows.length > 50) {
      throw new Error("Chunk too large: max 50 rows per call");
    }
    let inserted = 0;
    for (const row of rows) {
      await ctx.db.insert(table as any, row as any);
      inserted++;
    }
    return { table, inserted };
  },
});
