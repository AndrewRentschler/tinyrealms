/**
 * Combat encounter and log mutations.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "../../_generated/server";

const enemyValidator = v.object({
  npcName: v.optional(v.string()),
  level: v.number(),
  stats: v.object({
    hp: v.number(),
    maxHp: v.number(),
    atk: v.number(),
    def: v.number(),
    spd: v.number(),
  }),
});

const combatRewardsValidator = v.object({
  items: v.optional(
    v.array(v.object({ name: v.string(), quantity: v.number() })),
  ),
  xp: v.optional(v.number()),
  currency: v.optional(v.record(v.string(), v.number())),
});

const combatTurnValidator = v.object({
  actor: v.string(),
  action: v.string(),
  target: v.optional(v.string()),
  damage: v.optional(v.number()),
  heal: v.optional(v.number()),
});

const combatActionValidator = v.object({
  type: v.union(
    v.literal("attack"),
    v.literal("defend"),
    v.literal("skill"),
    v.literal("item"),
    v.literal("flee"),
  ),
  target: v.optional(v.string()),
  skillId: v.optional(v.string()),
  itemDefName: v.optional(v.string()),
});

export const createEncounter = mutation({
  args: {
    enemies: v.array(enemyValidator),
    rewards: combatRewardsValidator,
    mapId: v.optional(v.id("maps")),
    triggerLabel: v.optional(v.string()),
  },
  returns: v.id("combatEncounters"),
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
    action: combatActionValidator,
  },
  returns: v.object({
    action: combatActionValidator,
    result: v.string(),
    message: v.string(),
  }),
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
    turns: v.array(combatTurnValidator),
    outcome: v.union(
      v.literal("victory"),
      v.literal("defeat"),
      v.literal("flee")
    ),
  },
  returns: v.id("combatLog"),
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
