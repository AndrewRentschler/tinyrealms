/**
 * Admin mutations for managing game state.
 * Run via: npx convex run admin:clearChat
 *          npx convex run admin:clearProfiles
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdminKey } from "./lib/requireAdminKey";
import { DEFAULT_START_MAP } from "./maps";

const RESTORE_ALLOWED_TABLES = new Set([
  "maps",
  "spriteDefinitions",
  "npcProfiles",
  "mapObjects",
  "itemDefs",
  "worldItems",
  "messages",
]);

/** Delete all chat messages */
export const clearChat = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
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
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
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
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const presence = await ctx.db.query("presence").collect();
    for (const p of presence) {
      await ctx.db.delete(p._id);
    }
    return { deleted: presence.length };
  },
});

/** Delete all maps and their associated objects, NPCs, world items, and messages */
export const clearMaps = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const maps = await ctx.db.query("maps").collect();
    let deleted = 0;
    for (const map of maps) {
      // Delete map objects
      const objs = await ctx.db
        .query("mapObjects")
        .withIndex("by_map", (q) => q.eq("mapName", map.name))
        .collect();
      for (const o of objs) await ctx.db.delete(o._id);

      // Delete NPC state
      const npcs = await ctx.db
        .query("npcState")
        .withIndex("by_map", (q) => q.eq("mapName", map.name))
        .collect();
      for (const n of npcs) await ctx.db.delete(n._id);

      // Delete world items
      const worldItems = await ctx.db
        .query("worldItems")
        .withIndex("by_map", (q) => q.eq("mapName", map.name))
        .collect();
      for (const wi of worldItems) await ctx.db.delete(wi._id);

      // Delete chat messages
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_map_time", (q) => q.eq("mapName", map.name))
        .collect();
      for (const m of messages) await ctx.db.delete(m._id);

      await ctx.db.delete(map._id);
      deleted++;
    }
    return { deleted };
  },
});

/** Delete all placed map objects (reset a map to empty) */
export const clearMapObjects = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const objects = await ctx.db.query("mapObjects").collect();
    for (const o of objects) {
      await ctx.db.delete(o._id);
    }
    return { deleted: objects.length };
  },
});

/** Backfill role field on profiles that lack it */
export const backfillRoles = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const profiles = await ctx.db.query("profiles").collect();
    let patched = 0;
    for (const p of profiles) {
      if (!(p as any).role) {
        await ctx.db.patch(p._id, { role: "player" });
        patched++;
      }
    }
    return { patched };
  },
});

/** List all profiles (for admin inspection) */
export const listProfiles = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
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
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const maps = await ctx.db.query("maps").collect();
    let patched = 0;
    for (const m of maps) {
      const updates: Record<string, any> = {};
      if (!(m as any).portals) updates.portals = [];
      if ((m as any).status === undefined) updates.status = "published";
      if ((m as any).combatEnabled === undefined) updates.combatEnabled = false;
      if ((m as any).mapType === undefined) updates.mapType = "private";
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

/** Reset a profile's map by name — sends them back to the default starting map (or any map) */
export const resetProfileMap = mutation({
  args: {
    adminKey: v.string(),
    name: v.string(),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { adminKey, name, mapName }) => {
    requireAdminKey(adminKey);
    const target = mapName ?? DEFAULT_START_MAP;
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
    adminKey: v.string(),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { adminKey, mapName }) => {
    requireAdminKey(adminKey);
    const target = mapName ?? DEFAULT_START_MAP;
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
    adminKey: v.string(),
    includeTiles: v.optional(v.boolean()), // include full tile data in maps (can be huge)
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

/** Set a profile's role by owner email + profile name (convenience for CLI).
 *  This avoids ambiguity when multiple users have similar profile names. */
export const setRole = mutation({
  args: {
    adminKey: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.string(),
  },
  handler: async (ctx, { adminKey, email, name, role }) => {
    requireAdminKey(adminKey);
    if (role !== "superuser" && role !== "player") {
      throw new Error(`Invalid role "${role}". Must be "superuser" or "player".`);
    }

    // Resolve user by email
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", email))
      .first();
    if (!user) throw new Error(`No user found with email "${email}"`);

    // Find the profile owned by this user with the given name
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const profile = profiles.find((p) => p.name === name);
    if (!profile) {
      const available = profiles.map((p) => `"${p.name}"`).join(", ") || "(none)";
      throw new Error(
        `No profile "${name}" found for user "${email}". Available: ${available}`
      );
    }

    await ctx.db.patch(profile._id, { role });
    return { email, name: profile.name, newRole: role };
  },
});

/** Remove a profile by owner email + profile name (for management script) */
export const removeProfile = mutation({
  args: {
    adminKey: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { adminKey, email, name }) => {
    requireAdminKey(adminKey);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", email))
      .first();
    if (!user) throw new Error(`No user found with email "${email}"`);

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("name"), name))
      .first();
    if (!profile) throw new Error(`No profile "${name}" found for "${email}"`);

    const presenceRows = await ctx.db
      .query("presence")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    for (const p of presenceRows) await ctx.db.delete(p._id);
    await ctx.db.delete(profile._id);
    return { deleted: true, email, name };
  },
});

// ---------------------------------------------------------------------------
// User management (auth)
// ---------------------------------------------------------------------------

/** List all authenticated users (for admin inspection) */
export const listUsers = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      name: (u as any).name ?? null,
      email: (u as any).email ?? null,
      isAnonymous: (u as any).isAnonymous ?? false,
    }));
  },
});

/** Remove all anonymous users and their linked profiles/presence/auth rows. */
export const removeAnonymousUsers = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const users = await ctx.db.query("users").collect();
    const anonymousUsers = users.filter((u) => (u as any).isAnonymous === true);

    let usersDeleted = 0;
    let profilesDeleted = 0;
    let presenceDeleted = 0;

    for (const user of anonymousUsers) {
      const profiles = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const p of profiles) {
        const presenceRows = await ctx.db
          .query("presence")
          .withIndex("by_profile", (q) => q.eq("profileId", p._id))
          .collect();
        for (const row of presenceRows) await ctx.db.delete(row._id);
        presenceDeleted += presenceRows.length;
        await ctx.db.delete(p._id);
        profilesDeleted += 1;
      }

      await deleteUserAuthData(ctx, user._id);
      await ctx.db.delete(user._id);
      usersDeleted += 1;
    }

    return { usersDeleted, profilesDeleted, presenceDeleted };
  },
});

/** Remove legacy inUse fields from profiles after schema change */
export const cleanupProfileInUse = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const profiles = await ctx.db.query("profiles").collect();
    let cleaned = 0;
    for (const p of profiles) {
      if ((p as any).inUse !== undefined || (p as any).inUseSince !== undefined) {
        const { inUse: _inUse, inUseSince: _inUseSince, ...rest } = p as any;
        await ctx.db.replace(p._id, rest);
        cleaned += 1;
      }
    }
    return { cleaned };
  },
});

/** Get the currently authenticated user (for frontend) */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      _id: user._id,
      name: (user as any).name ?? null,
      email: (user as any).email ?? null,
      isAnonymous: (user as any).isAnonymous ?? false,
    };
  },
});

/** Get detailed account info for the authenticated user (account page) */
export const myAccountInfo = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    // Auth accounts (to show auth providers)
    const accounts = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
    const providers = accounts.map((a) => (a as any).provider as string);

    // Profiles
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Maps created by this user
    const allMaps = await ctx.db.query("maps").collect();
    const myMaps = allMaps.filter((m) => m.createdBy === userId);

    return {
      _id: user._id,
      email: (user as any).email ?? null,
      name: (user as any).name ?? null,
      isAnonymous: (user as any).isAnonymous ?? false,
      providers,
      profileCount: profiles.length,
      profiles: profiles.map((p) => ({
        name: p.name,
        role: p.role ?? "player",
        level: p.stats.level,
      })),
      mapsCreated: myMaps.map((m) => ({
        name: m.name,
        status: (m as any).status ?? "published",
        mapType: (m as any).mapType ?? "private",
      })),
      createdAt: (user as any)._creationTime,
    };
  },
});

/** Assign all unlinked profiles to a specific user (migration helper) */
export const assignUnlinkedProfiles = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profiles = await ctx.db.query("profiles").collect();
    let count = 0;
    for (const p of profiles) {
      if (!(p as any).userId) {
        await ctx.db.patch(p._id, { userId } as any);
        count++;
      }
    }
    return { assigned: count };
  },
});

/** Grant a user superuser role on all their profiles */
export const grantSuperuser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const p of profiles) {
      await ctx.db.patch(p._id, { role: "superuser" });
    }
    return { updated: profiles.length };
  },
});

/** Helper: delete all auth data for a given user ID */
async function deleteUserAuthData(ctx: any, userId: any) {
  // Delete auth sessions + their refresh tokens
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q: any) => q.eq("userId", userId))
    .collect();
  for (const s of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q: any) => q.eq("sessionId", s._id))
      .collect();
    for (const t of tokens) await ctx.db.delete(t._id);
    await ctx.db.delete(s._id);
  }

  // Delete auth accounts (use filter since index is userIdAndProvider, not just userId)
  const accounts = await ctx.db
    .query("authAccounts")
    .filter((q: any) => q.eq(q.field("userId"), userId))
    .collect();
  for (const a of accounts) await ctx.db.delete(a._id);

  return { sessions: sessions.length, accounts: accounts.length };
}

/** Remove a user and all associated auth data (sessions, accounts, refresh tokens).
 *  Does NOT remove profiles — those are separate entities. */
export const removeUser = mutation({
  args: { adminKey: v.string(), userId: v.id("users") },
  handler: async (ctx, { adminKey, userId }) => {
    requireAdminKey(adminKey);
    const stats = await deleteUserAuthData(ctx, userId);
    await ctx.db.delete(userId);
    return { deleted: true, ...stats };
  },
});

/** Remove a user by email (convenience for CLI) */
export const removeUserByEmail = mutation({
  args: { adminKey: v.string(), email: v.string() },
  handler: async (ctx, { adminKey, email }) => {
    requireAdminKey(adminKey);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", email))
      .first();
    if (!user) throw new Error(`No user found with email "${email}"`);

    const stats = await deleteUserAuthData(ctx, user._id);
    await ctx.db.delete(user._id);
    return { email, deleted: true, ...stats };
  },
});

/** List users with their linked profiles (for the management script) */
export const listUsersWithProfiles = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const users = await ctx.db.query("users").collect();
    const result = [];
    for (const u of users) {
      const profiles = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect();
      result.push({
        _id: u._id,
        email: (u as any).email ?? null,
        isAnonymous: (u as any).isAnonymous ?? false,
        profiles: profiles.map((p) => ({
          _id: p._id,
          name: p.name,
          role: p.role ?? "player",
          level: p.stats.level,
        })),
      });
    }
    return result;
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
    const rows = await (ctx.db.query(table as any) as any).collect();
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

      const editors = new Set(((map as any).editors ?? []).map(String));
      for (const pid of profileIds) {
        editors.add(String(pid));
      }
      await ctx.db.patch(map._id, {
        editors: [...editors],
      } as any);
      mapsUpdated++;
    }
    return { profilesFound: profiles.length, mapsUpdated };
  },
});

/** Lightweight NPC list for CLI */
export const listNpcs = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);

    // All sprite defs with category "npc"
    const allDefs = await ctx.db.query("spriteDefinitions").collect();
    const npcDefNames = new Set(
      allDefs.filter((d) => d.category === "npc").map((d) => d.name),
    );

    // All map objects that use an NPC sprite
    const allObjects = await ctx.db.query("mapObjects").collect();
    const npcObjects = allObjects.filter((o) => npcDefNames.has(o.spriteDefName));

    // NPC profiles (for display name)
    const profiles = await ctx.db.query("npcProfiles").collect();
    const profilesByName = new Map(profiles.map((p) => [p.name, p]));

    // Users for creator lookup
    const users = await ctx.db.query("users").collect();
    const emailById = new Map<string, string>();
    for (const u of users) {
      emailById.set(String(u._id), (u as any).email ?? "(no-email)");
    }

    // Maps for creator lookup
    const maps = await ctx.db.query("maps").collect();
    const mapCreatorById = new Map<string, string>();
    for (const m of maps) {
      const creator = m.createdBy ? (emailById.get(String(m.createdBy)) ?? "(unknown)") : "(none)";
      mapCreatorById.set(m.name, creator);
    }

    return npcObjects.map((obj) => {
      const profile = obj.instanceName ? profilesByName.get(obj.instanceName) ?? null : null;
      return {
        name: (profile as any)?.displayName ?? obj.instanceName ?? obj.spriteDefName,
        instanceName: obj.instanceName ?? "(unnamed)",
        spriteDefName: obj.spriteDefName,
        mapName: obj.mapName,
        mapCreator: mapCreatorById.get(obj.mapName) ?? "(unknown)",
      };
    });
  },
});

/** Lightweight map list for CLI (no tile data, no heavy fields) */
export const listMaps = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const maps = await ctx.db.query("maps").collect();
    const users = await ctx.db.query("users").collect();

    const emailById = new Map<string, string>();
    for (const u of users) {
      emailById.set(String(u._id), (u as any).email ?? "(no-email)");
    }

    return maps.map((m) => ({
      name: m.name,
      width: m.width,
      height: m.height,
      mapType: (m as any).mapType ?? "private",
      owner: m.createdBy ? (emailById.get(String(m.createdBy)) ?? String(m.createdBy)) : "(none)",
    }));
  },
});

/** Admin: update a map's type and/or owner. CLI-only. */
export const adminUpdateMap = mutation({
  args: {
    adminKey: v.string(),
    mapName: v.string(),
    mapType: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
  },
  handler: async (ctx, { adminKey, mapName, mapType, ownerEmail }) => {
    requireAdminKey(adminKey);

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", mapName))
      .first();
    if (!map) throw new Error(`Map "${mapName}" not found`);

    const patch: Record<string, any> = { updatedAt: Date.now() };

    if (mapType !== undefined) {
      if (!["public", "private", "system"].includes(mapType)) {
        throw new Error(`Invalid mapType "${mapType}". Must be "public", "private", or "system".`);
      }
      patch.mapType = mapType;
    }

    if (ownerEmail !== undefined) {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", ownerEmail),
        )
        .first();
      if (!account) throw new Error(`No user found with email "${ownerEmail}"`);
      patch.createdBy = account.userId;
    }

    await ctx.db.patch(map._id, patch);
    return { ok: true, mapName, patched: Object.keys(patch).filter((k) => k !== "updatedAt") };
  },
});

// ---------------------------------------------------------------------------
// One-shot migration: rewrite spriteSheetUrl paths in spriteDefinitions
// e.g. /assets/sprites/villager2.json → /assets/characters/villager2.json
// ---------------------------------------------------------------------------

/** NPC sprite filenames that moved from sprites/ to characters/ */
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

export const migrateSpriteSheetUrls = mutation({
  args: { adminKey: v.optional(v.string()) },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const allDefs = await ctx.db.query("spriteDefinitions").collect();
    let patched = 0;
    const details: string[] = [];
    for (const def of allDefs) {
      const url: string = (def as any).spriteSheetUrl ?? "";
      const filename = url.split("/").pop() ?? "";
      if (url.startsWith("/assets/sprites/") && MOVED_NPC_FILES.includes(filename)) {
        const newUrl = `/assets/characters/${filename}`;
        await ctx.db.patch(def._id, { spriteSheetUrl: newUrl } as any);
        details.push(`${def.name}: ${url} → ${newUrl}`);
        patched++;
      }
    }
    return { total: allDefs.length, patched, details };
  },
});
