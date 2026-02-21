/**
 * Admin: one-shot backfills and migration helpers.
 */
import { v } from "convex/values";
import { DEFAULT_MAP_TYPE, DEFAULT_VISIBILITY_TYPE } from "../lib/visibility.ts";
import type { Id } from "../_generated/dataModel";
import { mutation, internalMutation } from "../_generated/server";
import { requireAdminKey } from "../lib/requireAdminKey";

/** Backfill multi-map fields on existing maps */
export const backfillMaps = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const maps = await ctx.db.query("maps").collect();
    let patched = 0;
    for (const m of maps) {
      const updates: Record<string, unknown> = {};
      const doc = m as { portals?: unknown; status?: string; combatEnabled?: boolean; mapType?: string; editors?: unknown; musicUrl?: string };
      if (!doc.portals) updates.portals = [];
      if (doc.status === undefined) updates.status = "published";
      if (doc.combatEnabled === undefined) updates.combatEnabled = false;
      if (doc.mapType === undefined) updates.mapType = DEFAULT_MAP_TYPE;
      if (doc.editors === undefined) updates.editors = [];
      if (m.name === "cozy-cabin" && !doc.musicUrl) {
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

const MOVED_NPC_FILES = [
  "villager2.json",
  "villager3.json",
  "villager4.json",
  "villager5.json",
  "villager-jane.json",
  "woman-med.json",
  "chicken.json",
  "goat.json",
];

/** One-shot migration: rewrite spriteSheetUrl paths */
export const migrateSpriteSheetUrls = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const details: string[] = [];
    const allDefs = await ctx.db.query("spriteDefinitions").collect();
    let patchedDefs = 0;
    for (const def of allDefs) {
      const url: string = (def as { spriteSheetUrl?: string }).spriteSheetUrl ?? "";
      const filename = url.split("/").pop() ?? "";
      if (url.startsWith("/assets/sprites/") && MOVED_NPC_FILES.includes(filename)) {
        const newUrl = `/assets/characters/${filename}`;
        await ctx.db.patch(def._id, { spriteSheetUrl: newUrl });
        details.push(`spriteDefinition "${def.name}": ${url} → ${newUrl}`);
        patchedDefs++;
      }
    }
    const allProfiles = await ctx.db.query("profiles").collect();
    let patchedProfiles = 0;
    for (const profile of allProfiles) {
      const url: string = (profile as { spriteUrl?: string }).spriteUrl ?? "";
      const filename = url.split("/").pop() ?? "";
      if (url.startsWith("/assets/sprites/") && MOVED_NPC_FILES.includes(filename)) {
        const newUrl = `/assets/characters/${filename}`;
        await ctx.db.patch(profile._id, { spriteUrl: newUrl });
        details.push(`profile "${profile.name}": ${url} → ${newUrl}`);
        patchedProfiles++;
      }
    }
    const allPresence = await ctx.db.query("presence").collect();
    let patchedPresence = 0;
    for (const p of allPresence) {
      const url: string = (p as { spriteUrl?: string }).spriteUrl ?? "";
      const filename = url.split("/").pop() ?? "";
      if (url.startsWith("/assets/sprites/") && MOVED_NPC_FILES.includes(filename)) {
        const newUrl = `/assets/characters/${filename}`;
        await ctx.db.patch(p._id, { spriteUrl: newUrl });
        details.push(`presence: ${url} → ${newUrl}`);
        patchedPresence++;
      }
    }
    return { patchedDefs, patchedProfiles, patchedPresence, details };
  },
});

/** One-shot backfill: make legacy assets explicitly system-visible */
export const backfillAssetVisibilityTypes = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    let spriteDefsPatched = 0;
    let itemDefsPatched = 0;
    let npcProfilesPatched = 0;
    const spriteDefs = await ctx.db.query("spriteDefinitions").collect();
    for (const def of spriteDefs) {
      if ((def as { visibilityType?: string }).visibilityType === undefined) {
        await ctx.db.patch(def._id, { visibilityType: DEFAULT_VISIBILITY_TYPE });
        spriteDefsPatched++;
      }
    }
    const itemDefs = await ctx.db.query("itemDefs").collect();
    for (const item of itemDefs) {
      if ((item as { visibilityType?: string }).visibilityType === undefined) {
        await ctx.db.patch(item._id, { visibilityType: DEFAULT_VISIBILITY_TYPE });
        itemDefsPatched++;
      }
    }
    const npcProfiles = await ctx.db.query("npcProfiles").collect();
    for (const npc of npcProfiles) {
      if ((npc as { visibilityType?: string }).visibilityType === undefined) {
        await ctx.db.patch(npc._id, { visibilityType: DEFAULT_VISIBILITY_TYPE });
        npcProfilesPatched++;
      }
    }
    return { spriteDefsPatched, itemDefsPatched, npcProfilesPatched };
  },
});

/** Grant a user editor access to specific maps (by map name) */
export const grantMapEditor = internalMutation({
  args: {
    userId: v.id("users"),
    mapNames: v.array(v.string()),
  },
  handler: async (ctx, { userId, mapNames }) => {
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const profileIds = profiles.map((p) => p._id);
    let mapsUpdated = 0;
    for (const mapName of mapNames) {
      const map = await ctx.db
        .query("maps")
        .withIndex("by_name", (q) => q.eq("name", mapName))
        .first();
      if (!map) continue;
      const existingEditors = (map as { editors?: Id<"profiles">[] }).editors ?? [];
      const editors = new Set<Id<"profiles">>(existingEditors);
      for (const pid of profileIds) {
        editors.add(pid);
      }
      await ctx.db.patch(map._id, { editors: [...editors] });
      mapsUpdated++;
    }
    return { profilesFound: profiles.length, mapsUpdated };
  },
});
