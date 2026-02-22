/**
 * Admin: export a single map with full detail for AI context.
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAdminKey } from "../lib/requireAdminKey";

export const exportMapContext = query({
  args: {
    adminKey: v.string(),
    mapName: v.string(),
  },
  handler: async (ctx, { adminKey, mapName }) => {
    requireAdminKey(adminKey);

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", mapName))
      .first();

    if (!map) {
      throw new Error(`Map "${mapName}" not found`);
    }

    // Get all objects on this map
    const objects = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();

    // Get all world items on this map
    const worldItems = await ctx.db
      .query("worldItems")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();

    // Get all NPC profiles mentioned in objects
    const npcNames = new Set(
      objects
        .map((o) => o.instanceName)
        .filter((n): n is string => !!n)
    );
    const npcProfiles = [];
    for (const name of npcNames) {
      const profile = await ctx.db
        .query("npcProfiles")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (profile) npcProfiles.push(profile);
    }

    // Get all sprite definitions used by objects
    const spriteDefNames = new Set(objects.map((o) => o.spriteDefName));
    const spriteDefinitions = [];
    for (const name of spriteDefNames) {
      const def = await ctx.db
        .query("spriteDefinitions")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (def) spriteDefinitions.push(def);
    }

    // Get all sprite sheets used by sprite definitions
    const spriteSheets = [];
    const spriteSheetNames = new Set<string>();
    for (const def of spriteDefinitions) {
      const parts = def.spriteSheetUrl.split("/");
      const filename = parts[parts.length - 1];
      const name = filename.replace(".json", "");
      spriteSheetNames.add(name);
    }

    for (const name of spriteSheetNames) {
      const sheet = await ctx.db
        .query("spriteSheets")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (sheet) {
        const imageUrl = await ctx.storage.getUrl(sheet.imageId);
        spriteSheets.push({ ...sheet, imageUrl });
      }
    }

    // Get tileset URLs for map and layers
    const tilesetUrls: Record<string, string | null> = {};
    if (map.tilesetId) {
      tilesetUrls[map.tilesetId] = await ctx.storage.getUrl(map.tilesetId);
    }
    for (const layer of map.layers) {
      // In this schema, tilesetUrl is a string path, but if we had tilesetId we'd use it
      // If the schema had tilesetId per layer, we'd resolve it here.
    }

    return {
      _exportedAt: new Date().toISOString(),
      map,
      tilesetUrls,
      objects,
      worldItems,
      npcProfiles,
      spriteDefinitions,
      spriteSheets,
    };
  },
});
