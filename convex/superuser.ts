import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { getMapType, isValidVisibilityType } from "./lib/visibility.ts";
import { isSuperuserProfile, getProfileRole } from "./lib/profileRole.ts";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Auth user shape (from @convex-dev/auth) may include email, isAnonymous. */
type AuthUserWithEmail = { _id: Id<"users">; email?: string; isAnonymous?: boolean };

async function requireOwnedSuperuserProfile(
  ctx: QueryCtx,
  profileId: Id<"profiles">,
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Profile not found");
  if (profile.userId !== userId) throw new Error("Profile does not belong to current user");
  if (!isSuperuserProfile(profile)) throw new Error("Superuser role required");
  return profile;
}

/** Superuser dashboard data: users/profiles + maps/editors */
export const dashboard = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    await requireOwnedSuperuserProfile(ctx, profileId);

    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("profiles").collect();
    const maps = await ctx.db.query("maps").collect();

    const userById = new Map(users.map((u) => [String(u._id), u]));
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));

    const usersOut = users.map((u) => {
      const authUser = u as AuthUserWithEmail;
      const p = profiles.filter((x) => x.userId === u._id);
      return {
        _id: u._id,
        email: authUser.email ?? null,
        isAnonymous: authUser.isAnonymous ?? false,
        profiles: p.map((pp) => ({
          _id: pp._id,
          name: pp.name,
          role: getProfileRole(pp),
          level: pp.stats.level,
        })),
      };
    });

    const mapsOut = maps.map((m) => {
      const mapEditors = m.editors ?? [];
      const createdByUser = m.createdBy
        ? (userById.get(String(m.createdBy)) as AuthUserWithEmail | undefined)
        : undefined;
      return {
        _id: m._id,
        name: m.name,
        status: m.status ?? "published",
        mapType: getMapType(m),
        createdByEmail: createdByUser?.email ?? null,
        editors: mapEditors.map((id: Id<"profiles">) => {
          const p = profileById.get(String(id));
          if (!p) return { profileId: String(id), label: `(missing:${String(id)})` };
          const owner = p.userId
            ? (userById.get(String(p.userId)) as AuthUserWithEmail | undefined)
            : undefined;
          const email = owner?.email ?? "(no-email)";
          return { profileId: String(p._id), label: `${email}:${p.name}` };
        }),
      };
    });

    return { users: usersOut, maps: mapsOut };
  },
});

/** Set a profile's role by target profile ID */
export const setRole = mutation({
  args: {
    profileId: v.id("profiles"),
    targetProfileId: v.id("profiles"),
    role: v.string(),
  },
  handler: async (ctx, { profileId, targetProfileId, role }) => {
    await requireOwnedSuperuserProfile(ctx, profileId);
    if (role !== "superuser" && role !== "player") {
      throw new Error(`Invalid role "${role}". Must be "superuser" or "player".`);
    }

    const target = await ctx.db.get(targetProfileId);
    if (!target) throw new Error("Target profile not found");

    await ctx.db.patch(target._id, { role });
    return { ok: true };
  },
});

/** Remove a user account and all of their profiles */
export const removeUser = mutation({
  args: {
    profileId: v.id("profiles"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, { profileId, targetUserId }) => {
    await requireOwnedSuperuserProfile(ctx, profileId);

    const user = await ctx.db.get(targetUserId);
    if (!user) throw new Error("User not found");

    const userProfiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Remove presence + profiles
    for (const p of userProfiles) {
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_profile", (q) => q.eq("profileId", p._id))
        .collect();
      for (const row of presence) await ctx.db.delete(row._id);
      await ctx.db.delete(p._id);
    }

    // Remove auth sessions + tokens
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q: any) => q.eq("userId", user._id))
      .collect();
    for (const s of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q: any) => q.eq("sessionId", s._id))
        .collect();
      for (const t of tokens) await ctx.db.delete(t._id);
      await ctx.db.delete(s._id);
    }

    // Remove auth accounts
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
      .collect();
    for (const a of accounts) await ctx.db.delete(a._id);

    // Finally remove user
    await ctx.db.delete(user._id);
    return { ok: true, deletedProfiles: userProfiles.length };
  },
});

/** Delete map by name (superuser only) */
export const removeMap = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
  },
  handler: async (ctx, { profileId, name }) => {
    await requireOwnedSuperuserProfile(ctx, profileId);
    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!map) throw new Error(`Map "${name}" not found`);

    // Cascade cleanup mirrors maps.remove
    const objs = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", name))
      .collect();
    for (const o of objs) await ctx.db.delete(o._id);

    const npcs = await ctx.db
      .query("npcState")
      .withIndex("by_map", (q) => q.eq("mapName", name))
      .collect();
    for (const n of npcs) await ctx.db.delete(n._id);

    const worldItems = await ctx.db
      .query("worldItems")
      .withIndex("by_map", (q) => q.eq("mapName", name))
      .collect();
    for (const wi of worldItems) await ctx.db.delete(wi._id);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_map_time", (q) => q.eq("mapName", name))
      .collect();
    for (const m of messages) await ctx.db.delete(m._id);

    await ctx.db.delete(map._id);
    return { ok: true };
  },
});

/** Set map editors via email:name specs */
export const setMapEditors = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    editorSpecs: v.array(v.object({ email: v.string(), name: v.string() })),
  },
  handler: async (ctx, { profileId, mapName, editorSpecs }) => {
    await requireOwnedSuperuserProfile(ctx, profileId);
    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", mapName))
      .first();
    if (!map) throw new Error(`Map "${mapName}" not found`);

    const editorIds: Id<"profiles">[] = [];
    for (const spec of editorSpecs) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", spec.email))
        .first();
      if (!user) continue;
      const p = await ctx.db
        .query("profiles")
        .withIndex("by_user_and_name", (q) =>
          q.eq("userId", user._id).eq("name", spec.name)
        )
        .first();
      if (p) editorIds.push(p._id);
    }

    await ctx.db.patch(map._id, { editors: editorIds, updatedAt: Date.now() });
    return { ok: true, editorCount: editorIds.length };
  },
});

/** Set a map's type (public / private / system). Superuser only. */
export const setMapType = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    mapType: v.string(),
  },
  handler: async (ctx, { profileId, mapName, mapType }) => {
    if (!isValidVisibilityType(mapType)) {
      throw new Error(`Invalid mapType "${mapType}". Must be "public", "private", or "system".`);
    }
    await requireOwnedSuperuserProfile(ctx, profileId);

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", mapName))
      .first();
    if (!map) throw new Error(`Map "${mapName}" not found`);

    await ctx.db.patch(map._id, { mapType, updatedAt: Date.now() });
    return { ok: true };
  },
});
