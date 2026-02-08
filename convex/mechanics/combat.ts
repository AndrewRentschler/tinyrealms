import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const getEncounter = query({
  args: { id: v.id("combatEncounters") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const createEncounter = mutation({
  args: {
    enemies: v.any(),
    rewards: v.any(),
    mapId: v.optional(v.id("maps")),
    triggerLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("combatEncounters", args);
  },
});

export const submitAction = mutation({
  args: {
    encounterId: v.id("combatEncounters"),
    playerId: v.id("players"),
    action: v.any(),
  },
  handler: async (ctx, { encounterId, playerId, action: playerAction }) => {
    // Server-authoritative combat resolution
    // For now, return the action as a turn log entry
    // Full combat engine will be implemented in Phase 7
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
    playerId: v.id("players"),
    turns: v.any(),
    outcome: v.union(
      v.literal("victory"),
      v.literal("defeat"),
      v.literal("flee")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("combatLog", {
      ...args,
      timestamp: Date.now(),
    });
  },
});
