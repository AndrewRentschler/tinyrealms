/**
 * Admin: user and profile management, auth cleanup.
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdminKey } from "../lib/requireAdminKey";
import { getMapType } from "../lib/visibility.ts";

/** Helper: delete all auth data for a given user ID */
async function deleteUserAuthData(
  ctx: MutationCtx,
  userId: import("../_generated/dataModel").Id<"users">
) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const s of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", s._id))
      .collect();
    for (const t of tokens) await ctx.db.delete(t._id);
    await ctx.db.delete(s._id);
  }
  const accounts = await ctx.db
    .query("authAccounts")
    .filter((q) => q.eq(q.field("userId"), userId))
    .collect();
  for (const a of accounts) await ctx.db.delete(a._id);
  return { sessions: sessions.length, accounts: accounts.length };
}

/** Backfill role field on profiles that lack it */
export const backfillRoles = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const profiles = await ctx.db.query("profiles").collect();
    let patched = 0;
    for (const p of profiles) {
      if (!(p as { role?: string }).role) {
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

/** Set a profile's role by owner email + profile name */
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
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user) throw new Error(`No user found with email "${email}"`);
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

/** Remove a profile by owner email + profile name */
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
      .withIndex("email", (q) => q.eq("email", email))
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

/** List all authenticated users */
export const listUsers = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      name: (u as { name?: string | null }).name ?? null,
      email: (u as { email?: string | null }).email ?? null,
      isAnonymous: (u as { isAnonymous?: boolean }).isAnonymous ?? false,
    }));
  },
});

/** Remove all anonymous users and their linked profiles/presence/auth rows */
export const removeAnonymousUsers = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const users = await ctx.db.query("users").collect();
    const anonymousUsers = users.filter(
      (u) => (u as { isAnonymous?: boolean }).isAnonymous === true
    );
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
      const doc = p as { inUse?: unknown; inUseSince?: unknown };
      if (doc.inUse !== undefined || doc.inUseSince !== undefined) {
        const { inUse: _inUse, inUseSince: _inUseSince, ...rest } = doc;
        await ctx.db.replace(p._id, rest as typeof p);
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
      name: (user as { name?: string | null }).name ?? null,
      email: (user as { email?: string | null }).email ?? null,
      isAnonymous: (user as { isAnonymous?: boolean }).isAnonymous ?? false,
    };
  },
});

/** Get detailed account info for the authenticated user */
export const myAccountInfo = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const accounts = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
    const providers = accounts.map((a) => (a as { provider: string }).provider);
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const allMaps = await ctx.db.query("maps").collect();
    const myMaps = allMaps.filter((m) => m.createdBy === userId);
    return {
      _id: user._id,
      email: (user as { email?: string | null }).email ?? null,
      name: (user as { name?: string | null }).name ?? null,
      isAnonymous: (user as { isAnonymous?: boolean }).isAnonymous ?? false,
      providers,
      profileCount: profiles.length,
      profiles: profiles.map((p) => ({
        name: p.name,
        role: p.role ?? "player",
        level: p.stats.level,
      })),
      mapsCreated: myMaps.map((m) => ({
        name: m.name,
        status: (m as { status?: string }).status ?? "published",
        mapType: getMapType(m),
      })),
      createdAt: (user as { _creationTime?: number })._creationTime,
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
      if (!(p as { userId?: unknown }).userId) {
        await ctx.db.patch(p._id, { userId });
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

/** Remove a user and all associated auth data */
export const removeUser = mutation({
  args: { adminKey: v.string(), userId: v.id("users") },
  handler: async (ctx, { adminKey, userId }) => {
    requireAdminKey(adminKey);
    const stats = await deleteUserAuthData(ctx, userId);
    await ctx.db.delete(userId);
    return { deleted: true, ...stats };
  },
});

/** Remove a user by email */
export const removeUserByEmail = mutation({
  args: { adminKey: v.string(), email: v.string() },
  handler: async (ctx, { adminKey, email }) => {
    requireAdminKey(adminKey);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user) throw new Error(`No user found with email "${email}"`);
    const stats = await deleteUserAuthData(ctx, user._id);
    await ctx.db.delete(user._id);
    return { email, deleted: true, ...stats };
  },
});

/** List users with their linked profiles */
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
        email: (u as { email?: string | null }).email ?? null,
        isAnonymous: (u as { isAnonymous?: boolean }).isAnonymous ?? false,
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
