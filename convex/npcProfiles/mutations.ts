/**
 * NPC profile mutations.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getVisibilityType, isSuperuserUser, slugifyInstanceName } from "./helpers.ts";

const visibilityTypeValidator = v.union(
  v.literal("public"),
  v.literal("private"),
  v.literal("system")
);
const npcTypeValidator = v.union(v.literal("procedural"), v.literal("ai"));
const instanceTypeValidator = v.union(v.literal("animal"), v.literal("character"));
const aggressionValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
);
const aiPolicyValidator = v.object({
  capabilities: v.optional(
    v.object({
      canChat: v.optional(v.boolean()),
      canNavigate: v.optional(v.boolean()),
      canPickupItems: v.optional(v.boolean()),
      canUseShops: v.optional(v.boolean()),
      canCombat: v.optional(v.boolean()),
      canAffectQuests: v.optional(v.boolean()),
      canUsePortals: v.optional(v.boolean()),
    })
  ),
});

/** Save (upsert) an NPC profile by instance name with visibility scoping. */
export const save = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    instanceType: v.optional(instanceTypeValidator),
    spriteDefName: v.string(),
    mapName: v.optional(v.string()),
    displayName: v.string(),
    title: v.optional(v.string()),
    backstory: v.optional(v.string()),
    personality: v.optional(v.string()),
    dialogueStyle: v.optional(v.string()),
    moveSpeed: v.optional(v.number()),
    wanderRadius: v.optional(v.number()),
    greeting: v.optional(v.string()),
    logicKey: v.optional(v.string()),
    logicConfig: v.optional(v.any()),
    systemPrompt: v.optional(v.string()),
    faction: v.optional(v.string()),
    knowledge: v.optional(v.string()),
    secrets: v.optional(v.string()),
    relationships: v.optional(
      v.array(
        v.object({
          npcName: v.string(),
          relation: v.string(),
          notes: v.optional(v.string()),
        })
      )
    ),
    stats: v.optional(
      v.object({
        hp: v.number(),
        maxHp: v.number(),
        atk: v.number(),
        def: v.number(),
        spd: v.number(),
        level: v.number(),
      })
    ),
    items: v.optional(
      v.array(
        v.object({
          name: v.string(),
          quantity: v.number(),
        })
      )
    ),
    tags: v.optional(v.array(v.string())),
    aggression: v.optional(aggressionValidator),
    npcType: v.optional(npcTypeValidator),
    aiEnabled: v.optional(v.boolean()),
    braintrustSlug: v.optional(v.string()),
    aiPolicy: v.optional(aiPolicyValidator),
    visibilityType: v.optional(visibilityTypeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const editorProfile = await ctx.db.get(args.profileId);
    if (!editorProfile) throw new Error("Profile not found");
    if (editorProfile.userId !== userId) throw new Error("Not your profile");
    const isSuperuser = (editorProfile as { role?: string }).role === "superuser";

    const existing = await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      const existingOwner = (existing as { createdByUser?: string }).createdByUser;
      const existingVisibility = getVisibilityType(existing);
      const isOwner = existingOwner === userId;
      if (!isSuperuser && !isOwner) {
        throw new Error(
          `Permission denied: you can only edit your own NPC profiles (or be superuser).`
        );
      }
      if (!isSuperuser && existingVisibility === "system") {
        throw new Error(`Permission denied: only superusers can edit system NPC profiles.`);
      }
    }

    let visibilityType = args.visibilityType ?? (existing ? getVisibilityType(existing) : "private");
    if (visibilityType === "system" && !isSuperuser) {
      throw new Error(`Only superusers can set NPC visibility to "system".`);
    }

    const instanceType = args.instanceType ?? (existing as { instanceType?: string })?.instanceType ?? "character";
    const { profileId: _p, visibilityType: _v, ...fields } = args;
    const baseCapabilities = {
      ...((existing as { aiPolicy?: { capabilities?: Record<string, boolean> } })?.aiPolicy?.capabilities ?? {}),
      ...(args.aiPolicy?.capabilities ?? {}),
    };
    const normalizedAiPolicy =
      instanceType === "animal"
        ? { capabilities: { ...baseCapabilities, canChat: false } }
        : { capabilities: { ...baseCapabilities, canChat: true } };
    const data = {
      ...fields,
      instanceType,
      npcType: instanceType === "animal" ? "procedural" : args.npcType,
      aiEnabled: instanceType === "animal" ? false : args.aiEnabled,
      aiPolicy: normalizedAiPolicy,
      visibilityType,
      createdByUser: existing?.createdByUser ?? userId,
      updatedAt: Date.now(),
    };

    let savedId;
    if (existing) {
      await ctx.db.patch(existing._id, data);
      savedId = existing._id;
    } else {
      savedId = await ctx.db.insert("npcProfiles", data);
    }

    if (typeof args.moveSpeed === "number" || typeof args.wanderRadius === "number") {
      const allStates = await ctx.db.query("npcState").collect();
      for (const state of allStates) {
        if (state.instanceName !== args.name) continue;
        const patch: Record<string, number> = {};
        if (typeof args.moveSpeed === "number" && state.speed !== args.moveSpeed) {
          patch.speed = args.moveSpeed;
        }
        if (typeof args.wanderRadius === "number" && state.wanderRadius !== args.wanderRadius) {
          patch.wanderRadius = args.wanderRadius;
        }
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(state._id, patch);
        }
      }
    }

    return savedId;
  },
});

/** Assign an instance name to a mapObject. */
export const assignInstanceName = mutation({
  args: {
    profileId: v.id("profiles"),
    mapObjectId: v.id("mapObjects"),
    instanceName: v.string(),
  },
  handler: async (ctx, { profileId, mapObjectId, instanceName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const editorProfile = await ctx.db.get(profileId);
    if (!editorProfile) throw new Error("Profile not found");
    if (editorProfile.userId !== userId) throw new Error("Not your profile");
    const isSuperuser = (editorProfile as { role?: string }).role === "superuser";

    const obj = await ctx.db.get(mapObjectId);
    if (!obj) throw new Error("NPC map object not found");
    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", obj.mapName))
      .first();
    const ownsMap = !!(map && (map as { createdBy?: string }).createdBy === userId);
    if (!isSuperuser && !ownsMap) {
      throw new Error("Permission denied: only map owner or superuser can name this NPC instance.");
    }

    const currentName = obj.instanceName ?? "";
    const baseFromSprite = slugifyInstanceName(obj.spriteDefName || "npc");
    const requested = slugifyInstanceName(instanceName);
    const baseName = requested || currentName || baseFromSprite || "npc";

    const allObjects = await ctx.db.query("mapObjects").collect();
    const usedObjectNames = new Set(
      allObjects
        .filter((o) => o._id !== mapObjectId && typeof o.instanceName === "string")
        .map((o) => String(o.instanceName))
    );

    let resolvedName = baseName;
    let suffix = 2;
    while (true) {
      const objectConflict = usedObjectNames.has(resolvedName);
      const profileConflict = await ctx.db
        .query("npcProfiles")
        .withIndex("by_name", (q) => q.eq("name", resolvedName))
        .first();
      const conflictsWithDifferentProfile =
        !!profileConflict && resolvedName !== currentName;
      if (!objectConflict && !conflictsWithDifferentProfile) break;
      resolvedName = `${baseName}-${suffix++}`;
    }

    await ctx.db.patch(mapObjectId, {
      instanceName: resolvedName,
      updatedAt: Date.now(),
    });
    return { instanceName: resolvedName };
  },
});

/** Delete an NPC profile. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    id: v.id("npcProfiles"),
  },
  handler: async (ctx, { profileId, id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const editorProfile = await ctx.db.get(profileId);
    if (!editorProfile) throw new Error("Profile not found");
    if (editorProfile.userId !== userId) throw new Error("Not your profile");
    const isSuperuser = (editorProfile as { role?: string }).role === "superuser";

    const npcProfile = await ctx.db.get(id);
    if (!npcProfile) throw new Error("NPC profile not found");
    const visibility = getVisibilityType(npcProfile);
    const isOwner = (npcProfile as { createdByUser?: string }).createdByUser === userId;
    if (!isSuperuser && !isOwner) {
      throw new Error(`Permission denied: only owner or superuser can delete this NPC profile.`);
    }
    if (!isSuperuser && visibility === "system") {
      throw new Error(`Permission denied: only superusers can delete system NPC profiles.`);
    }
    await ctx.db.delete(id);
  },
});

/** Clear AI conversation history + memory for one NPC profile. */
export const clearConversationHistory = mutation({
  args: {
    profileId: v.id("profiles"),
    npcProfileId: v.id("npcProfiles"),
  },
  handler: async (ctx, { profileId, npcProfileId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const editorProfile = await ctx.db.get(profileId);
    if (!editorProfile) throw new Error("Profile not found");
    if (editorProfile.userId !== userId) throw new Error("Not your profile");
    const isSuperuser = (editorProfile as { role?: string }).role === "superuser";

    const npcProfile = await ctx.db.get(npcProfileId);
    if (!npcProfile) throw new Error("NPC profile not found");
    const isOwner = (npcProfile as { createdByUser?: string }).createdByUser === userId;
    if (!isSuperuser && !isOwner) {
      throw new Error("Permission denied: only owner or superuser can clear history.");
    }

    const npcName = String((npcProfile as { name?: string }).name ?? "");
    if (!npcName) throw new Error("NPC profile has no name");

    const convRows = await ctx.db
      .query("npcConversations")
      .withIndex("by_npc", (q) => q.eq("npcProfileName", npcName))
      .collect();
    for (const row of convRows) await ctx.db.delete(row._id);

    const memRows = await ctx.db
      .query("npcMemories")
      .withIndex("by_npc", (q) => q.eq("npcProfileName", npcName))
      .collect();
    for (const row of memRows) await ctx.db.delete(row._id);

    return {
      npcProfileName: npcName,
      conversationsDeleted: convRows.length,
      memoriesDeleted: memRows.length,
    };
  },
});
