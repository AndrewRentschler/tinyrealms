import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const visibilityTypeValidator = v.union(
  v.literal("public"),
  v.literal("private"),
  v.literal("system"),
);
const npcTypeValidator = v.union(v.literal("procedural"), v.literal("ai"));
const instanceTypeValidator = v.union(v.literal("animal"), v.literal("character"));
const aggressionValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
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
    }),
  ),
});

function getVisibilityType(profile: any): "public" | "private" | "system" {
  return (profile.visibilityType ?? "system") as "public" | "private" | "system";
}

function canReadNpcProfile(profile: any, userId: string | null): boolean {
  const visibility = getVisibilityType(profile);
  if (visibility === "system" || visibility === "public") return true;
  if (!userId) return false;
  return profile.createdByUser === userId;
}

async function isSuperuserUser(ctx: any, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const profiles = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  return profiles.some((p: any) => p.role === "superuser");
}

function slugifyInstanceName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

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

/**
 * List all NPC instances across all maps.
 * Returns mapObjects that have an NPC sprite def (category === "npc"),
 * joined with their npcProfile if one exists.
 */
export const listInstances = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const superuser = await isSuperuserUser(ctx, userId);

    // 1) Get all sprite defs with category "npc"
    const allDefs = await ctx.db.query("spriteDefinitions").collect();
    const npcDefNames = new Set(
      allDefs.filter((d) => d.category === "npc").map((d) => d.name)
    );

    // 2) Get all map objects
    const allObjects = await ctx.db.query("mapObjects").collect();
    const npcObjects = allObjects.filter((o) => npcDefNames.has(o.spriteDefName));

    // 3) Get all NPC profiles
    const profiles = await ctx.db.query("npcProfiles").collect();
    const visibleProfiles = superuser
      ? profiles
      : profiles.filter((p) => canReadNpcProfile(p, userId));
    const profilesByName = new Map(visibleProfiles.map((p) => [p.name, p]));

    // 4) Join: return each NPC instance with its profile (if any)
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

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

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
    const isSuperuser = (editorProfile as any).role === "superuser";

    const existing = await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      const existingOwner = (existing as any).createdByUser;
      const existingVisibility = getVisibilityType(existing);
      const isOwner = existingOwner === userId;
      if (!isSuperuser && !isOwner) {
        throw new Error(
          `Permission denied: you can only edit your own NPC profiles (or be superuser).`,
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

    const instanceType = args.instanceType ?? ((existing as any)?.instanceType ?? "character");
    const { profileId: _, visibilityType: __, ...fields } = args;
    const baseCapabilities = {
      ...(((existing as any)?.aiPolicy?.capabilities as any) ?? {}),
      ...(args.aiPolicy?.capabilities ?? {}),
    };
    const normalizedAiPolicy =
      instanceType === "animal"
        ? {
            capabilities: {
              ...baseCapabilities,
              canChat: false,
            },
          }
        : {
            capabilities: {
              ...baseCapabilities,
              canChat: true,
            },
          };
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

    // If this profile is bound to live NPC instances, push behavior tuning
    // directly into runtime npcState rows so changes apply immediately.
    if (typeof args.moveSpeed === "number" || typeof args.wanderRadius === "number") {
      const allStates = await ctx.db.query("npcState").collect();
      for (const state of allStates) {
        if (state.instanceName !== args.name) continue;
        const patch: Record<string, number> = {};
        if (typeof args.moveSpeed === "number" && state.speed !== args.moveSpeed) {
          patch.speed = args.moveSpeed;
        }
        if (
          typeof args.wanderRadius === "number" &&
          state.wanderRadius !== args.wanderRadius
        ) {
          patch.wanderRadius = args.wanderRadius;
        }
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(state._id, patch as any);
        }
      }
    }

    return savedId;
  },
});

/** Assign an instance name to a mapObject. Requires owner/superuser. */
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
    const isSuperuser = (editorProfile as any).role === "superuser";

    const obj = await ctx.db.get(mapObjectId);
    if (!obj) throw new Error("NPC map object not found");
    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", obj.mapName))
      .first();
    const ownsMap = !!(map && (map as any).createdBy === userId);
    if (!isSuperuser && !ownsMap) {
      throw new Error("Permission denied: only map owner or superuser can name this NPC instance.");
    }

    const currentName = obj.instanceName ?? "";
    const baseFromSprite = slugifyInstanceName(obj.spriteDefName || "npc");
    const requested = slugifyInstanceName(instanceName);
    const baseName = requested || currentName || baseFromSprite || "npc";

    // Ensure instance name is unique across mapObjects + npcProfiles.
    // If user left it blank, auto-generate with numeric suffixes.
    const allObjects = await ctx.db.query("mapObjects").collect();
    const usedObjectNames = new Set(
      allObjects
        .filter((o) => o._id !== mapObjectId && typeof o.instanceName === "string")
        .map((o) => String(o.instanceName)),
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

/** Delete an NPC profile. Requires owner or superuser. */
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
    const isSuperuser = (editorProfile as any).role === "superuser";

    const npcProfile = await ctx.db.get(id);
    if (!npcProfile) throw new Error("NPC profile not found");
    const visibility = getVisibilityType(npcProfile);
    const isOwner = (npcProfile as any).createdByUser === userId;
    if (!isSuperuser && !isOwner) {
      throw new Error(`Permission denied: only owner or superuser can delete this NPC profile.`);
    }
    if (!isSuperuser && visibility === "system") {
      throw new Error(`Permission denied: only superusers can delete system NPC profiles.`);
    }
    await ctx.db.delete(id);
  },
});

/** Clear AI conversation history + memory summary for one NPC profile. */
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
    const isSuperuser = (editorProfile as any).role === "superuser";

    const npcProfile = await ctx.db.get(npcProfileId);
    if (!npcProfile) throw new Error("NPC profile not found");
    const isOwner = (npcProfile as any).createdByUser === userId;
    if (!isSuperuser && !isOwner) {
      throw new Error("Permission denied: only owner or superuser can clear history.");
    }

    const npcName = String((npcProfile as any).name ?? "");
    if (!npcName) throw new Error("NPC profile has no name");

    const convRows = await ctx.db
      .query("npcConversations")
      .withIndex("by_npc", (q) => q.eq("npcProfileName", npcName))
      .collect();
    for (const row of convRows) {
      await ctx.db.delete(row._id);
    }

    const memRows = await ctx.db
      .query("npcMemories")
      .withIndex("by_npc", (q) => q.eq("npcProfileName", npcName))
      .collect();
    for (const row of memRows) {
      await ctx.db.delete(row._id);
    }

    return {
      npcProfileName: npcName,
      conversationsDeleted: convRows.length,
      memoriesDeleted: memRows.length,
    };
  },
});
