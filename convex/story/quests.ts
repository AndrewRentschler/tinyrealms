import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ---------------------------------------------------------------------------
// Legacy API (quests / questProgress tables)
// ---------------------------------------------------------------------------

export const list = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await ctx.db.query("quests").collect();
  },
});

export const get = query({
  args: { questId: v.id("quests") },
  returns: v.union(v.any(), v.null()),
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
  returns: v.id("quests"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return await ctx.db.insert("quests", args);
  },
});

export const getProgress = query({
  args: { profileId: v.id("profiles") },
  returns: v.array(v.any()),
  handler: async (ctx, { profileId }) => {
    return await ctx.db
      .query("questProgress")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .collect();
  },
});

export const startQuest = mutation({
  args: {
    profileId: v.id("profiles"),
    questId: v.id("quests"),
  },
  returns: v.id("questProgress"),
  handler: async (ctx, { profileId, questId }) => {
    const existing = await ctx.db
      .query("questProgress")
      .withIndex("by_profile_quest", (q) =>
        q.eq("profileId", profileId).eq("questId", questId)
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("questProgress", {
      profileId,
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
  returns: v.null(),
  handler: async (ctx, { progressId, choice }) => {
    const progress = await ctx.db.get(progressId);
    if (!progress || progress.status !== "active") return null;

    const quest = await ctx.db.get(progress.questId);
    if (!quest) return null;

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
    return null;
  },
});

// ---------------------------------------------------------------------------
// Quest v2 API (questDefs / playerQuests)
// ---------------------------------------------------------------------------

const sourceValidator = v.object({
  type: v.union(v.literal("npc"), v.literal("hud")),
  npcInstanceName: v.optional(v.string()),
});

/** List active quests for a profile (active + completed, with questDef and progress) */
export const listActive = query({
  args: { profileId: v.id("profiles") },
  returns: v.array(
    v.object({
      _id: v.id("playerQuests"),
      profileId: v.id("profiles"),
      questDefKey: v.string(),
      status: v.union(
        v.literal("active"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("abandoned")
      ),
      acceptedAt: v.number(),
      deadlineAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      rewardClaimedAt: v.optional(v.number()),
      progress: v.optional(v.any()),
      questDef: v.optional(
        v.object({
          key: v.string(),
          title: v.string(),
          description: v.string(),
          objectives: v.any(),
          rewards: v.any(),
        })
      ),
    })
  ),
  handler: async (ctx, { profileId }) => {
    const rows = await ctx.db
      .query("playerQuests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profileId).eq("status", "active")
      )
      .collect();
    const completed = await ctx.db
      .query("playerQuests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profileId).eq("status", "completed")
      )
      .collect();
    const all = [...rows, ...completed];
    const uniqueKeys = [...new Set(all.map((pq) => pq.questDefKey))];
    const defMap = new Map<string, Doc<"questDefs">>();
    for (const key of uniqueKeys) {
      const def = await ctx.db
        .query("questDefs")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (def) defMap.set(key, def);
    }
    const result = [];
    for (const pq of all) {
      const def = defMap.get(pq.questDefKey);
      result.push({
        _id: pq._id,
        profileId: pq.profileId,
        questDefKey: pq.questDefKey,
        status: pq.status,
        acceptedAt: pq.acceptedAt,
        deadlineAt: pq.deadlineAt,
        completedAt: pq.completedAt,
        rewardClaimedAt: pq.rewardClaimedAt,
        progress: pq.progress,
        questDef: def
          ? {
              key: def.key,
              title: def.title,
              description: def.description,
              objectives: def.objectives,
              rewards: def.rewards,
            }
          : undefined,
      });
    }
    return result;
  },
});

/** List quest definitions available to accept (filtered by sourceType, mapScope, cooldown) */
export const listAvailable = query({
  args: {
    profileId: v.id("profiles"),
    sourceType: v.union(v.literal("npc"), v.literal("hud"), v.literal("system")),
    npcInstanceName: v.optional(v.string()),
    mapName: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      key: v.string(),
      title: v.string(),
      description: v.string(),
      objectives: v.any(),
      rewards: v.any(),
    })
  ),
  handler: async (ctx, { profileId, sourceType, npcInstanceName, mapName }) => {
    const defs = await ctx.db
      .query("questDefs")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    const bySource = defs.filter((d) => d.sourceType === sourceType);
    const byNpc =
      npcInstanceName !== undefined
        ? bySource.filter((d) => d.offeredByNpcInstanceName === npcInstanceName || !d.offeredByNpcInstanceName)
        : bySource;
    const byMap =
      mapName !== undefined
        ? byNpc.filter((d) => {
            const scope = d.mapScope ?? "any";
            return scope === "any" || scope === mapName;
          })
        : byNpc;

    const now = Date.now();
    const active = await ctx.db
      .query("playerQuests")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .collect();
    const activeKeys = new Set(active.filter((q) => q.status === "active").map((q) => q.questDefKey));
    const completedByKey = new Map(
      active.filter((q) => q.status === "completed").map((q) => [q.questDefKey, q])
    );

    const available = [];
    for (const def of byMap) {
      if (activeKeys.has(def.key)) continue;
      if (def.repeatable && def.cooldownMs != null) {
        const last = completedByKey.get(def.key);
        if (last?.rewardClaimedAt && now - last.rewardClaimedAt < def.cooldownMs) continue;
      } else if (completedByKey.has(def.key)) continue;
      available.push({
        key: def.key,
        title: def.title,
        description: def.description,
        objectives: def.objectives,
        rewards: def.rewards,
      });
    }
    return available;
  },
});

/** List completed/failed/abandoned quest history */
export const listHistory = query({
  args: {
    profileId: v.id("profiles"),
    status: v.optional(
      v.union(
        v.literal("completed"),
        v.literal("failed"),
        v.literal("abandoned")
      )
    ),
  },
  returns: v.array(v.any()),
  handler: async (ctx, { profileId, status }) => {
    if (status) {
      return await ctx.db
        .query("playerQuests")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", profileId).eq("status", status)
        )
        .collect();
    }
    const completed = await ctx.db
      .query("playerQuests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profileId).eq("status", "completed")
      )
      .collect();
    const failed = await ctx.db
      .query("playerQuests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profileId).eq("status", "failed")
      )
      .collect();
    const abandoned = await ctx.db
      .query("playerQuests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profileId).eq("status", "abandoned")
      )
      .collect();
    const all = [...completed, ...failed, ...abandoned];
    all.sort((a, b) => (b.completedAt ?? b.failedAt ?? b.acceptedAt) - (a.completedAt ?? a.failedAt ?? a.acceptedAt));
    return all;
  },
});

/** Accept a quest (create playerQuests row) */
export const accept = mutation({
  args: {
    profileId: v.id("profiles"),
    questDefKey: v.string(),
    source: sourceValidator,
    mapName: v.optional(v.string()),
  },
  returns: v.id("playerQuests"),
  handler: async (ctx, { profileId, questDefKey, source, mapName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) throw new Error("Profile not found or not yours");

    const def = await ctx.db
      .query("questDefs")
      .withIndex("by_key", (q) => q.eq("key", questDefKey))
      .first();
    if (!def) throw new Error(`Quest "${questDefKey}" not found`);
    if (!def.enabled) throw new Error("Quest is not available");
    if (def.sourceType !== source.type) throw new Error("Quest source type mismatch");
    if (mapName != null && def.mapScope != null && def.mapScope !== "any" && def.mapScope !== mapName) {
      throw new Error("Quest is not available on this map");
    }

    const existing = await ctx.db
      .query("playerQuests")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .collect();
    const alreadyActive = existing.some((q) => q.questDefKey === questDefKey && q.status === "active");
    if (alreadyActive) throw new Error("You already have this quest");
    const lastCompleted = existing.find((q) => q.questDefKey === questDefKey && q.status === "completed");
    if (!def.repeatable && lastCompleted) throw new Error("Quest already completed");
    if (def.repeatable && def.cooldownMs != null && lastCompleted?.rewardClaimedAt) {
      if (Date.now() - lastCompleted.rewardClaimedAt < def.cooldownMs) {
        throw new Error("Quest on cooldown");
      }
    }

    const progress = def.objectives.map((obj) => ({
      type: obj.type,
      targetType: obj.type === "kill_npc" ? (obj as { targetType?: "npc_instance" | "npc_class" }).targetType : undefined,
      targetKey:
        obj.type === "collect_item"
          ? (obj as { itemDefName: string }).itemDefName
          : (obj as { targetNpcProfileName?: string; targetNpcClassName?: string }).targetNpcProfileName ??
            (obj as { targetNpcClassName?: string }).targetNpcClassName ??
            "",
      currentCount: 0,
      requiredCount: obj.requiredCount,
    }));

    const acceptedAt = Date.now();
    const deadlineAt =
      def.timeLimitMs != null ? acceptedAt + def.timeLimitMs : undefined;

    return await ctx.db.insert("playerQuests", {
      profileId,
      questDefKey,
      status: "active",
      acceptedAt,
      deadlineAt,
      source,
      progress,
    });
  },
});

/** Abandon an active quest */
export const abandon = mutation({
  args: {
    profileId: v.id("profiles"),
    playerQuestId: v.id("playerQuests"),
  },
  returns: v.null(),
  handler: async (ctx, { profileId, playerQuestId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) throw new Error("Profile not found or not yours");

    const pq = await ctx.db.get(playerQuestId);
    if (!pq) throw new Error("Quest instance not found");
    if (pq.profileId !== profileId) throw new Error("Not your quest");
    if (pq.status !== "active") throw new Error("Quest is not active");
    await ctx.db.patch(playerQuestId, { status: "abandoned" });
    return null;
  },
});

/** Claim reward for a completed quest; applies gold, xp, items and sets rewardClaimedAt */
export const claimReward = mutation({
  args: {
    profileId: v.id("profiles"),
    playerQuestId: v.id("playerQuests"),
  },
  returns: v.object({
    rewards: v.object({
      gold: v.number(),
      xp: v.number(),
      hp: v.number(),
    }),
  }),
  handler: async (ctx, { profileId, playerQuestId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) throw new Error("Profile not found or not yours");

    const pq = await ctx.db.get(playerQuestId);
    if (!pq) throw new Error("Quest instance not found");
    if (pq.profileId !== profileId) throw new Error("Not your quest");
    if (pq.status !== "completed") throw new Error("Quest is not completed");
    if (pq.rewardClaimedAt) throw new Error("Reward already claimed");

    const def = await ctx.db
      .query("questDefs")
      .withIndex("by_key", (q) => q.eq("key", pq.questDefKey))
      .first();
    if (!def) throw new Error("Quest definition not found");

    const rewards = def.rewards;
    const applied = { gold: 0, xp: 0, hp: 0 };

    if (rewards.gold != null && rewards.gold > 0) {
      let wallet = await ctx.db
        .query("wallets")
        .withIndex("by_profile", (q) => q.eq("profileId", profileId))
        .first();
      if (!wallet) {
        await ctx.db.insert("wallets", {
          profileId,
          currencies: { gold: rewards.gold },
        });
      } else {
        const currencies = { ...(wallet.currencies as Record<string, number>) };
        currencies["gold"] = (currencies["gold"] ?? 0) + rewards.gold;
        await ctx.db.patch(wallet._id, { currencies });
      }
      applied.gold = rewards.gold;
    }

    if (rewards.xp != null && rewards.xp > 0) {
      const stats = { ...profile.stats };
      stats.xp = (stats.xp ?? 0) + rewards.xp;
      await ctx.db.patch(profileId, { stats });
      applied.xp = rewards.xp;
    }

    if (rewards.items != null && rewards.items.length > 0) {
      const items = [...profile.items];
      for (const r of rewards.items) {
        const existing = items.find((i) => i.name === r.itemDefName);
        if (existing) {
          existing.quantity += r.quantity;
        } else {
          items.push({ name: r.itemDefName, quantity: r.quantity });
        }
      }
      await ctx.db.patch(profileId, { items });
    }

    await ctx.db.patch(playerQuestId, { rewardClaimedAt: Date.now() });
    return { rewards: applied };
  },
});
