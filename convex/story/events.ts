import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const listByMap = query({
  args: { mapId: v.optional(v.id("maps")) },
  handler: async (ctx, { mapId }) => {
    return await ctx.db
      .query("storyEvents")
      .withIndex("by_map", (q) => q.eq("mapId", mapId))
      .collect();
  },
});

const storyEventConditionsValidator = v.optional(
  v.object({
    requiredQuest: v.optional(v.string()),
    requiredItem: v.optional(v.string()),
    minLevel: v.optional(v.number()),
    flag: v.optional(v.string()),
  }),
);
const storyEventScriptValidator = v.array(
  v.object({
    action: v.string(),
    args: v.optional(v.record(v.string(), v.string())),
  }),
);

export const create = mutation({
  args: {
    mapId: v.optional(v.id("maps")),
    triggerId: v.string(),
    type: v.string(),
    conditions: storyEventConditionsValidator,
    script: storyEventScriptValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("storyEvents", args);
  },
});
