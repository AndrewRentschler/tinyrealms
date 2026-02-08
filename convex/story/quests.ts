import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("quests").collect();
  },
});

export const get = query({
  args: { questId: v.id("quests") },
  handler: async (ctx, { questId }) => {
    return await ctx.db.get(questId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    steps: v.any(),
    prerequisites: v.array(v.id("quests")),
    rewards: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("quests", args);
  },
});

export const getProgress = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    return await ctx.db
      .query("questProgress")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .collect();
  },
});

export const startQuest = mutation({
  args: {
    playerId: v.id("players"),
    questId: v.id("quests"),
  },
  handler: async (ctx, { playerId, questId }) => {
    const existing = await ctx.db
      .query("questProgress")
      .withIndex("by_player_quest", (q) =>
        q.eq("playerId", playerId).eq("questId", questId)
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("questProgress", {
      playerId,
      questId,
      currentStep: 0,
      status: "active",
      choices: {},
    });
  },
});

export const advanceQuest = mutation({
  args: {
    progressId: v.id("questProgress"),
    choice: v.optional(v.any()),
  },
  handler: async (ctx, { progressId, choice }) => {
    const progress = await ctx.db.get(progressId);
    if (!progress || progress.status !== "active") return;

    const quest = await ctx.db.get(progress.questId);
    if (!quest) return;

    const nextStep = progress.currentStep + 1;
    const steps = quest.steps as any[];

    const updates: any = { currentStep: nextStep };
    if (choice !== undefined) {
      updates.choices = {
        ...(progress.choices as any),
        [`step_${progress.currentStep}`]: choice,
      };
    }
    if (nextStep >= steps.length) {
      updates.status = "completed";
    }
    await ctx.db.patch(progressId, updates);
  },
});
