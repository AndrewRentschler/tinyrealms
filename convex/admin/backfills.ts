/**
 * Admin: one-shot backfills and migration helpers.
 */
import { v } from "convex/values";
import { DEFAULT_MAP_TYPE, DEFAULT_VISIBILITY_TYPE } from "../lib/visibility.ts";
import type { Id } from "../_generated/dataModel";
import { mutation, internalMutation } from "../_generated/server";
import { computeChunkXY } from "../lib/globalSpatial.ts";
import { requireAdminKey } from "../lib/requireAdminKey";

const PROFILE_ENTITY_TYPE = "profile" as const;
const NPC_STATE_ENTITY_TYPE = "npcState" as const;
const GLOBAL_WORLD_KEY = "global";

type MapPortal = {
  name: string;
  portalId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetMap: string;
  targetSpawn: string;
  direction?: string;
  transition?: string;
};

function isDryRunMode(dryRun: boolean | undefined): boolean {
  return dryRun !== false;
}

function requireConfirmedApply(dryRun: boolean | undefined, confirm: boolean | undefined): void {
  if (isDryRunMode(dryRun)) {
    return;
  }
  if (confirm !== true) {
    throw new Error("confirm=true is required when dryRun=false");
  }
}

function slugToken(value: string): string {
  const token = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || "na";
}

function buildStablePortalId(mapName: string, portal: MapPortal): string {
  return [
    "portal",
    slugToken(mapName),
    slugToken(portal.name),
    String(Math.floor(portal.x)),
    String(Math.floor(portal.y)),
    slugToken(portal.targetMap),
    slugToken(portal.targetSpawn),
  ].join(":");
}

function dedupePortalId(basePortalId: string, usedPortalIds: Set<string>): string {
  if (!usedPortalIds.has(basePortalId)) {
    return basePortalId;
  }
  let index = 2;
  while (usedPortalIds.has(`${basePortalId}:${index}`)) {
    index += 1;
  }
  return `${basePortalId}:${index}`;
}

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

/** Backfill missing portalId values on map portals. */
export const backfillPortalIds = mutation({
  args: {
    adminKey: v.string(),
    dryRun: v.optional(v.boolean()),
    confirm: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminKey, dryRun, confirm }) => {
    requireAdminKey(adminKey);
    requireConfirmedApply(dryRun, confirm);

    const shouldDryRun = isDryRunMode(dryRun);
    const maps = await ctx.db.query("maps").collect();

    let totalMaps = 0;
    let mapsWithPortals = 0;
    let affectedMaps = 0;
    let totalPortals = 0;
    let missingPortalIds = 0;
    let assignedPortalIds = 0;

    for (const map of maps) {
      totalMaps += 1;
      const portals = ((map as { portals?: MapPortal[] }).portals ?? []).map(
        (portal) => ({ ...portal }),
      );

      if (portals.length === 0) {
        continue;
      }

      mapsWithPortals += 1;
      totalPortals += portals.length;

      const usedPortalIds = new Set(
        portals
          .map((portal) => portal.portalId?.trim())
          .filter((portalId): portalId is string => Boolean(portalId)),
      );

      let mapChanged = false;
      const nextPortals = portals.map((portal) => {
        if (portal.portalId && portal.portalId.trim().length > 0) {
          return portal;
        }

        missingPortalIds += 1;
        mapChanged = true;

        const basePortalId = buildStablePortalId(map.name, portal);
        const portalId = dedupePortalId(basePortalId, usedPortalIds);
        usedPortalIds.add(portalId);
        assignedPortalIds += 1;

        return {
          ...portal,
          portalId,
        };
      });

      if (!mapChanged) {
        continue;
      }

      affectedMaps += 1;
      if (!shouldDryRun) {
        await ctx.db.patch(map._id, { portals: nextPortals });
      }
    }

    return {
      dryRun: shouldDryRun,
      totalMaps,
      mapsWithPortals,
      affectedMaps,
      totalPortals,
      missingPortalIds,
      assignedPortalIds,
      wroteMaps: shouldDryRun ? 0 : affectedMaps,
    };
  },
});

/** Backfill missing canonical location rows for profiles and npcState entities. */
export const backfillEntityLocations = mutation({
  args: {
    adminKey: v.string(),
    dryRun: v.optional(v.boolean()),
    confirm: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminKey, dryRun, confirm }) => {
    requireAdminKey(adminKey);
    requireConfirmedApply(dryRun, confirm);

    const shouldDryRun = isDryRunMode(dryRun);
    const now = Date.now();

    const [profiles, npcStates, existingRows] = await Promise.all([
      ctx.db.query("profiles").collect(),
      ctx.db.query("npcState").collect(),
      ctx.db.query("entityLocations").collect(),
    ]);

    const existingByEntity = new Set(
      existingRows.map((row) => `${row.entityType}:${row.entityId}`),
    );

    let createdProfiles = 0;
    let createdNpcState = 0;
    let skippedExisting = 0;

    for (const profile of profiles) {
      const entityId = String(profile._id);
      const entityKey = `${PROFILE_ENTITY_TYPE}:${entityId}`;
      if (existingByEntity.has(entityKey)) {
        skippedExisting += 1;
        continue;
      }

      createdProfiles += 1;
      existingByEntity.add(entityKey);
      if (!shouldDryRun) {
        await ctx.db.insert("entityLocations", {
          entityType: PROFILE_ENTITY_TYPE,
          entityId,
          dimensionType: "instance",
          worldKey: GLOBAL_WORLD_KEY,
          mapName: profile.mapName,
          updatedAt: now,
        });
      }
    }

    for (const npcState of npcStates) {
      const entityId = String(npcState._id);
      const entityKey = `${NPC_STATE_ENTITY_TYPE}:${entityId}`;
      if (existingByEntity.has(entityKey)) {
        skippedExisting += 1;
        continue;
      }

      createdNpcState += 1;
      existingByEntity.add(entityKey);
      if (!shouldDryRun) {
        await ctx.db.insert("entityLocations", {
          entityType: NPC_STATE_ENTITY_TYPE,
          entityId,
          dimensionType: "instance",
          worldKey: GLOBAL_WORLD_KEY,
          mapName: npcState.mapName,
          updatedAt: now,
        });
      }
    }

    return {
      dryRun: shouldDryRun,
      scannedProfiles: profiles.length,
      scannedNpcState: npcStates.length,
      scannedEntityLocations: existingRows.length,
      createdProfiles,
      createdNpcState,
      createdTotal: createdProfiles + createdNpcState,
      skippedExisting,
      wroteRows: shouldDryRun ? 0 : createdProfiles + createdNpcState,
    };
  },
});

/** Reconcile globalSpatial rows from canonical global entity locations. */
export const reconcileGlobalSpatial = mutation({
  args: {
    adminKey: v.string(),
    dryRun: v.optional(v.boolean()),
    confirm: v.optional(v.boolean()),
    chunkWorldWidth: v.number(),
    chunkWorldHeight: v.number(),
  },
  handler: async (
    ctx,
    { adminKey, dryRun, confirm, chunkWorldWidth, chunkWorldHeight },
  ) => {
    requireAdminKey(adminKey);
    requireConfirmedApply(dryRun, confirm);

    if (!Number.isFinite(chunkWorldWidth) || chunkWorldWidth <= 0) {
      throw new Error("chunkWorldWidth must be > 0");
    }
    if (!Number.isFinite(chunkWorldHeight) || chunkWorldHeight <= 0) {
      throw new Error("chunkWorldHeight must be > 0");
    }

    const shouldDryRun = isDryRunMode(dryRun);
    const now = Date.now();

    const locations = await ctx.db.query("entityLocations").collect();

    let scannedLocations = 0;
    let candidateLocations = 0;
    let inserted = 0;
    let patched = 0;
    let unchanged = 0;
    let skippedMissingSource = 0;
    let skippedMissingCoords = 0;

    for (const location of locations) {
      scannedLocations += 1;
      if (location.dimensionType !== "global") {
        continue;
      }
      if (
        location.entityType !== PROFILE_ENTITY_TYPE &&
        location.entityType !== NPC_STATE_ENTITY_TYPE
      ) {
        continue;
      }
      candidateLocations += 1;

      let sourceX: number | undefined;
      let sourceY: number | undefined;
      let sourceDx = 0;
      let sourceDy = 0;

      if (location.entityType === PROFILE_ENTITY_TYPE) {
        const profile = await ctx.db.get(location.entityId as Id<"profiles">);
        if (!profile) {
          skippedMissingSource += 1;
          continue;
        }
        sourceX = profile.x;
        sourceY = profile.y;
      } else {
        const npcState = await ctx.db.get(location.entityId as Id<"npcState">);
        if (!npcState) {
          skippedMissingSource += 1;
          continue;
        }
        sourceX = npcState.x;
        sourceY = npcState.y;
        sourceDx = npcState.vx;
        sourceDy = npcState.vy;
      }

      if (sourceX === undefined || sourceY === undefined) {
        skippedMissingCoords += 1;
        continue;
      }

      const { chunkX, chunkY } = computeChunkXY(
        sourceX,
        sourceY,
        chunkWorldWidth,
        chunkWorldHeight,
      );

      const existing = await ctx.db
        .query("globalSpatial")
        .withIndex("by_entity", (q) =>
          q
            .eq("entityType", location.entityType)
            .eq("entityId", location.entityId),
        )
        .first();

      const nextRow = {
        worldKey: location.worldKey,
        entityType: location.entityType,
        entityId: location.entityId,
        x: sourceX,
        y: sourceY,
        dx: existing?.dx ?? sourceDx,
        dy: existing?.dy ?? sourceDy,
        chunkX,
        chunkY,
        animation: existing?.animation ?? "idle",
        updatedAt: now,
      };

      if (!existing) {
        inserted += 1;
        if (!shouldDryRun) {
          await ctx.db.insert("globalSpatial", nextRow);
        }
        continue;
      }

      const isUnchanged =
        existing.worldKey === nextRow.worldKey &&
        existing.x === nextRow.x &&
        existing.y === nextRow.y &&
        existing.dx === nextRow.dx &&
        existing.dy === nextRow.dy &&
        existing.chunkX === nextRow.chunkX &&
        existing.chunkY === nextRow.chunkY &&
        existing.animation === nextRow.animation;

      if (isUnchanged) {
        unchanged += 1;
        continue;
      }

      patched += 1;
      if (!shouldDryRun) {
        await ctx.db.patch(existing._id, nextRow);
      }
    }

    return {
      dryRun: shouldDryRun,
      scannedLocations,
      candidateLocations,
      inserted,
      patched,
      upserted: inserted + patched,
      unchanged,
      skippedMissingSource,
      skippedMissingCoords,
      wroteRows: shouldDryRun ? 0 : inserted + patched,
    };
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
