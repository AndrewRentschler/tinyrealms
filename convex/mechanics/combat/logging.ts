/**
 * Combat encounter and log mutations.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "../../_generated/server";

export const createEncounter = mutation({
  args: {
    enemies: v.any(),
    rewards: v.any(),
    mapId: v.optional(v.id("maps")),
    triggerLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return await ctx.db.insert("combatEncounters", args);
  },
});

export const submitAction = mutation({
  args: {
    encounterId: v.id("combatEncounters"),
    profileId: v.id("profiles"),
    action: v.any(),
  },
  handler: async (ctx, { encounterId, profileId, action: playerAction }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.userId !== userId) throw new Error("Unauthorized");
    const encounter = await ctx.db.get(encounterId);
    if (!encounter) throw new Error("Encounter not found");
    return {
      action: playerAction,
      result: "pending",
      message: "Combat engine pending implementation",
    };
  },
});

export const logCombat = mutation({
  args: {
    encounterId: v.id("combatEncounters"),
    profileId: v.id("profiles"),
    turns: v.any(),
    outcome: v.union(
      v.literal("victory"),
      v.literal("defeat"),
      v.literal("flee")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.userId !== userId) throw new Error("Unauthorized");
    return await ctx.db.insert("combatLog", {
      ...args,
      timestamp: Date.now(),
    });
  },
});
