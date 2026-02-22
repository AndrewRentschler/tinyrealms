/**
 * migrations.ts — Reusable migration utilities for safe schema evolution.
 *
 * Usage:
 *   npx convex run migrations:backfillField '{"adminKey":"<ADMIN_API_KEY>","table":"profiles","field":"schemaVersion","defaultValue":1}'
 *   npx convex run migrations:removeField '{"adminKey":"<ADMIN_API_KEY>","table":"profiles","field":"legacyField"}'
 *   npx convex run migrations:listMissing '{"adminKey":"<ADMIN_API_KEY>","table":"maps","field":"schemaVersion"}'
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdminKey } from "./lib/requireAdminKey";

// ---------------------------------------------------------------------------
// Generic backfill: set a default value for records missing a field
// ---------------------------------------------------------------------------

export const backfillField = mutation({
  args: {
    adminKey: v.string(),
    table: v.string(),
    field: v.string(),
    defaultValue: v.any(),
  },
  handler: async (ctx, { adminKey, table, field, defaultValue }) => {
    requireAdminKey(adminKey);
    const records = await (ctx.db.query(table as any) as any).collect();
    let updated = 0;
    for (const r of records) {
      if ((r as any)[field] === undefined) {
        await ctx.db.patch(r._id, { [field]: defaultValue } as any);
        updated++;
      }
    }
    return { total: records.length, updated };
  },
});

// ---------------------------------------------------------------------------
// Remove a legacy field from all records in a table
// ---------------------------------------------------------------------------

export const removeField = mutation({
  args: {
    adminKey: v.string(),
    table: v.string(),
    field: v.string(),
  },
  handler: async (ctx, { adminKey, table, field }) => {
    requireAdminKey(adminKey);
    const records = await (ctx.db.query(table as any) as any).collect();
    let cleaned = 0;
    for (const r of records) {
      if ((r as any)[field] !== undefined) {
        // Replace the entire document without the field
        const { _id, _creationTime, [field]: _removed, ...rest } = r as any;
        await ctx.db.replace(_id, rest);
        cleaned++;
      }
    }
    return { total: records.length, cleaned };
  },
});

// ---------------------------------------------------------------------------
// List records missing a field (dry-run / audit)
// ---------------------------------------------------------------------------

export const listMissing = query({
  args: {
    adminKey: v.string(),
    table: v.string(),
    field: v.string(),
  },
  handler: async (ctx, { adminKey, table, field }) => {
    requireAdminKey(adminKey);
    const records = await (ctx.db.query(table as any) as any).collect();
    const missing = records.filter((r: any) => r[field] === undefined);
    return {
      total: records.length,
      missing: missing.length,
      sampleIds: missing.slice(0, 10).map((r: any) => r._id),
    };
  },
});

// ---------------------------------------------------------------------------
// Bump schemaVersion for all records in a table
// ---------------------------------------------------------------------------

export const bumpSchemaVersion = mutation({
  args: {
    adminKey: v.string(),
    table: v.string(),
    version: v.number(),
  },
  handler: async (ctx, { adminKey, table, version }) => {
    requireAdminKey(adminKey);
    const records = await (ctx.db.query(table as any) as any).collect();
    let updated = 0;
    for (const r of records) {
      if ((r as any).schemaVersion !== version) {
        await ctx.db.patch(r._id, { schemaVersion: version } as any);
        updated++;
      }
    }
    return { total: records.length, updated };
  },
});

// ---------------------------------------------------------------------------
// Map size audit: check document sizes for maps approaching limits
// ---------------------------------------------------------------------------

export const auditMapSizes = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const maps = await ctx.db.query("maps").collect();
    const results = maps.map((m) => {
      // Rough size estimate: JSON-stringify the layers + collisionMask
      let layerBytes = 0;
      for (const layer of m.layers) {
        layerBytes += layer.tiles.length; // already JSON strings
      }
      const collisionBytes = m.collisionMask.length;
      const totalEstimate = layerBytes + collisionBytes;
      const totalKB = Math.round(totalEstimate / 1024);

      return {
        name: m.name,
        width: m.width,
        height: m.height,
        layers: m.layers.length,
        layerKB: Math.round(layerBytes / 1024),
        collisionKB: Math.round(collisionBytes / 1024),
        totalKB,
        warning:
          totalKB > 500 ? "APPROACHING LIMIT" : totalKB > 250 ? "LARGE" : "OK",
      };
    });

    // Sort by size descending
    results.sort((a, b) => b.totalKB - a.totalKB);
    return results;
  },
});

// ---------------------------------------------------------------------------
// Legacy players -> profiles reference migration
// ---------------------------------------------------------------------------

function pickProfileForPlayer(player: any, profiles: any[]): any | null {
  if (!profiles || profiles.length === 0) return null;
  const exactName = profiles.find((p) => p.name === player.name);
  if (exactName) return exactName;
  // Fallback to oldest profile for that user.
  const sorted = [...profiles].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
  );
  return sorted[0] ?? null;
}

/**
 * Backfill legacy playerId references to profileId across tables that moved
 * from players->profiles ownership.
 */
export const migratePlayerRefsToProfiles = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);

    const players = await ctx.db.query("players").collect();
    const profiles = await ctx.db.query("profiles").collect();
    const profilesByUser = new Map<string, any[]>();
    for (const p of profiles) {
      if (!p.userId) continue;
      const key = String(p.userId);
      const arr = profilesByUser.get(key) ?? [];
      arr.push(p);
      profilesByUser.set(key, arr);
    }

    const playerToProfile = new Map<string, string>();
    for (const player of players) {
      const userProfiles = player.userId
        ? (profilesByUser.get(String(player.userId)) ?? [])
        : [];
      const chosen = pickProfileForPlayer(player, userProfiles);
      if (chosen?._id) {
        playerToProfile.set(String(player._id), String(chosen._id));
      }
    }

    let questProgressPatched = 0;
    let inventoriesPatched = 0;
    let walletsPatched = 0;
    let combatLogPatched = 0;
    let lorePatched = 0;
    const unresolvedPlayerIds = new Set<string>();

    const questProgressRows = await ctx.db.query("questProgress").collect();
    for (const row of questProgressRows) {
      if ((row as any).profileId !== undefined) continue;
      const legacy = (row as any).playerId;
      if (!legacy) continue;
      const mapped = playerToProfile.get(String(legacy));
      if (!mapped) {
        unresolvedPlayerIds.add(String(legacy));
        continue;
      }
      await ctx.db.patch(row._id, { profileId: mapped } as any);
      questProgressPatched++;
    }

    const inventories = await ctx.db.query("inventories").collect();
    for (const row of inventories) {
      if ((row as any).profileId !== undefined) continue;
      const legacy = (row as any).playerId;
      if (!legacy) continue;
      const mapped = playerToProfile.get(String(legacy));
      if (!mapped) {
        unresolvedPlayerIds.add(String(legacy));
        continue;
      }
      await ctx.db.patch(row._id, { profileId: mapped } as any);
      inventoriesPatched++;
    }

    const wallets = await ctx.db.query("wallets").collect();
    for (const row of wallets) {
      if ((row as any).profileId !== undefined) continue;
      const legacy = (row as any).playerId;
      if (!legacy) continue;
      const mapped = playerToProfile.get(String(legacy));
      if (!mapped) {
        unresolvedPlayerIds.add(String(legacy));
        continue;
      }
      await ctx.db.patch(row._id, { profileId: mapped } as any);
      walletsPatched++;
    }

    const combatLogs = await ctx.db.query("combatLog").collect();
    for (const row of combatLogs) {
      if ((row as any).profileId !== undefined) continue;
      const legacy = (row as any).playerId;
      if (!legacy) continue;
      const mapped = playerToProfile.get(String(legacy));
      if (!mapped) {
        unresolvedPlayerIds.add(String(legacy));
        continue;
      }
      await ctx.db.patch(row._id, { profileId: mapped } as any);
      combatLogPatched++;
    }

    const loreRows = await ctx.db.query("lore").collect();
    for (const row of loreRows) {
      const discovered = Array.isArray((row as any).discoveredBy)
        ? (row as any).discoveredBy
        : [];
      if (discovered.length === 0) continue;
      const converted: string[] = [];
      let changed = false;
      for (const id of discovered) {
        const mapped = playerToProfile.get(String(id));
        if (mapped) {
          converted.push(mapped);
          if (mapped !== String(id)) changed = true;
        } else {
          // Already a profile ID or unknown legacy ID; keep it as-is.
          converted.push(String(id));
        }
      }
      const deduped = Array.from(new Set(converted));
      if (changed || deduped.length !== discovered.length) {
        await ctx.db.patch(row._id, { discoveredBy: deduped } as any);
        lorePatched++;
      }
    }

    return {
      playersSeen: players.length,
      profilesSeen: profiles.length,
      mappedPlayers: playerToProfile.size,
      questProgressPatched,
      inventoriesPatched,
      walletsPatched,
      combatLogPatched,
      lorePatched,
      unresolvedPlayerIds: Array.from(unresolvedPlayerIds).slice(0, 50),
    };
  },
});

/**
 * Finalize cleanup after migratePlayerRefsToProfiles:
 * - removes legacy playerId fields from migrated rows
 * - normalizes lore.discoveredBy to profile IDs only where possible
 */
export const cleanupLegacyPlayerRefs = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);

    let questProgressCleaned = 0;
    let inventoriesCleaned = 0;
    let walletsCleaned = 0;
    let combatLogCleaned = 0;
    let loreCleaned = 0;

    const clearLegacyField = async (table: string, hasProfileField = true) => {
      const rows = await (ctx.db.query(table as any) as any).collect();
      let cleaned = 0;
      for (const row of rows) {
        if ((row as any).playerId === undefined) continue;
        if (hasProfileField && (row as any).profileId === undefined) continue;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _id, _creationTime, playerId: _legacy, ...rest } = row as any;
        await ctx.db.replace(_id, rest);
        cleaned++;
      }
      return cleaned;
    };

    questProgressCleaned = await clearLegacyField("questProgress", true);
    inventoriesCleaned = await clearLegacyField("inventories", true);
    walletsCleaned = await clearLegacyField("wallets", true);
    combatLogCleaned = await clearLegacyField("combatLog", true);

    const loreRows = await ctx.db.query("lore").collect();
    const profileIds = new Set(
      (await ctx.db.query("profiles").collect()).map((p) => String(p._id)),
    );
    for (const row of loreRows) {
      const discovered = Array.isArray((row as any).discoveredBy)
        ? (row as any).discoveredBy
        : [];
      // Keep only IDs that currently exist in profiles.
      const filtered = discovered.filter((id: any) =>
        profileIds.has(String(id)),
      );
      if (filtered.length !== discovered.length) {
        await ctx.db.patch(row._id, { discoveredBy: filtered } as any);
        loreCleaned++;
      }
    }

    return {
      questProgressCleaned,
      inventoriesCleaned,
      walletsCleaned,
      combatLogCleaned,
      loreCleaned,
    };
  },
});

/**
 * Backfill AI NPC defaults for existing npcProfiles.
 */
export const backfillNpcAiDefaults = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);

    const all = await ctx.db.query("npcProfiles").collect();
    let patched = 0;
    for (const npc of all) {
      const patch: Record<string, any> = {};
      if ((npc as any).npcType === undefined) patch.npcType = "procedural";
      if ((npc as any).aiEnabled === undefined) patch.aiEnabled = false;
      if ((npc as any).aiPolicy === undefined) {
        patch.aiPolicy = { capabilities: { canChat: true } };
      } else if ((npc as any).aiPolicy?.capabilities?.canChat === undefined) {
        patch.aiPolicy = {
          ...(npc as any).aiPolicy,
          capabilities: {
            ...((npc as any).aiPolicy?.capabilities ?? {}),
            canChat: true,
          },
        };
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(npc._id, patch as any);
        patched++;
      }
    }
    return { total: all.length, patched };
  },
});

/**
 * Enable AI chat for character NPC profiles.
 * Use after backfillNpcAiDefaults if you want E-interaction to use AI instead of procedural dialogue.
 */
export const enableAiForCharacterProfiles = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);

    const all = await ctx.db.query("npcProfiles").collect();
    let patched = 0;
    for (const npc of all) {
      const instanceType = (npc as { instanceType?: "animal" | "character" })
        .instanceType;
      if (instanceType === "animal") continue;

      const patch: Record<string, unknown> = {};
      if ((npc as { npcType?: string }).npcType !== "ai") patch.npcType = "ai";
      if ((npc as { aiEnabled?: boolean }).aiEnabled !== true)
        patch.aiEnabled = true;

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(npc._id, patch);
        patched++;
      }
    }
    return { total: all.length, patched };
  },
});
