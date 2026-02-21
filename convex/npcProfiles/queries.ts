/**
 * NPC profile queries.
 */
import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { canReadNpcProfile, isSuperuserUser } from "./helpers.ts";

/** List all NPC profiles */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const superuser = await isSuperuserUser(ctx, userId);
    const all = await ctx.db.query("npcProfiles").collect();
    if (superuser) return all;
    return all.filter((p) => canReadNpcProfile(p, userId));
  },
});

/** Get an NPC profile by unique instance name */
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    const superuser = await isSuperuserUser(ctx, userId);
    const profile = await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!profile) return null;
    if (superuser) return profile;
    if (!canReadNpcProfile(profile, userId)) return null;
    return profile;
  },
});

/** Internal lookup (no auth visibility filter) for server-side NPC pipelines. */
export const getByNameInternal = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
  },
});

/** List all NPC instances across all maps with profile join */
export const listInstances = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const superuser = await isSuperuserUser(ctx, userId);
    const allDefs = await ctx.db.query("spriteDefinitions").collect();
    const npcDefNames = new Set(
      allDefs.filter((d) => d.category === "npc").map((d) => d.name)
    );
    const allObjects = await ctx.db.query("mapObjects").collect();
    const npcObjects = allObjects.filter((o) => npcDefNames.has(o.spriteDefName));
    const profiles = await ctx.db.query("npcProfiles").collect();
    const visibleProfiles = superuser
      ? profiles
      : profiles.filter((p) => canReadNpcProfile(p, userId));
    const profilesByName = new Map(visibleProfiles.map((p) => [p.name, p]));
    return npcObjects.map((obj) => ({
      mapObjectId: obj._id,
      mapName: obj.mapName,
      spriteDefName: obj.spriteDefName,
      instanceName: obj.instanceName,
      x: obj.x,
      y: obj.y,
      profile: obj.instanceName ? profilesByName.get(obj.instanceName) ?? null : null,
      spriteDef: allDefs.find((d) => d.name === obj.spriteDefName) ?? null,
    }));
  },
});
