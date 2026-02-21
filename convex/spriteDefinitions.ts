import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getVisibilityType, visibilityTypeValidator } from "./lib/visibility.ts";

function canReadDef(def: any, userId: string | null): boolean {
  const visibility = getVisibilityType(def);
  if (visibility === "system" || visibility === "public") return true;
  if (!userId) return false;
  return def.createdByUser === userId;
}

async function isSuperuserUser(ctx: any, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const profiles = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  return profiles.some((p: any) => p.role === "superuser");
}

/** List all saved sprite definitions */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const superuser = await isSuperuserUser(ctx, userId);
    const all = await ctx.db.query("spriteDefinitions").collect();
    if (superuser) return all;
    return all.filter((def) => canReadDef(def, userId));
  },
});

/** Get a single sprite definition by name */
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    const superuser = await isSuperuserUser(ctx, userId);
    const def = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!def) return null;
    if (superuser) return def;
    if (!canReadDef(def, userId)) return null;
    return def;
  },
});

/** Save (upsert) a sprite definition with visibility scoping. */
export const save = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    spriteSheetUrl: v.string(),
    defaultAnimation: v.string(),
    animationSpeed: v.number(),
    anchorX: v.number(),
    anchorY: v.number(),
    scale: v.number(),
    isCollidable: v.boolean(),
    category: v.string(),
    frameWidth: v.number(),
    frameHeight: v.number(),
    // NPC-specific (optional)
    npcSpeed: v.optional(v.number()),
    npcWanderRadius: v.optional(v.number()),
    npcDirDown: v.optional(v.string()),
    npcDirUp: v.optional(v.string()),
    npcDirLeft: v.optional(v.string()),
    npcDirRight: v.optional(v.string()),
    npcGreeting: v.optional(v.string()),
    // Sound fields
    ambientSoundUrl: v.optional(v.string()),
    ambientSoundRadius: v.optional(v.number()),
    ambientSoundVolume: v.optional(v.number()),
    interactSoundUrl: v.optional(v.string()),
    // Toggleable on/off
    toggleable: v.optional(v.boolean()),
    onAnimation: v.optional(v.string()),
    offAnimation: v.optional(v.string()),
    onSoundUrl: v.optional(v.string()),
    // Door
    isDoor: v.optional(v.boolean()),
    doorClosedAnimation: v.optional(v.string()),
    doorOpeningAnimation: v.optional(v.string()),
    doorOpenAnimation: v.optional(v.string()),
    doorClosingAnimation: v.optional(v.string()),
    doorOpenSoundUrl: v.optional(v.string()),
    doorCloseSoundUrl: v.optional(v.string()),
    visibilityType: v.optional(visibilityTypeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.userId !== userId) throw new Error("Not your profile");
    const isSuperuser = (profile as any).role === "superuser";

    const existing = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      const existingOwner = (existing as any).createdByUser;
      const existingVisibility = getVisibilityType(existing);
      const isOwner = existingOwner === userId;
      if (!isSuperuser && !isOwner) {
        throw new Error(
          `Permission denied: you can only edit your own sprite definitions (or be superuser).`,
        );
      }
      if (!isSuperuser && existingVisibility === "system") {
        throw new Error(`Permission denied: only superusers can edit system sprite definitions.`);
      }
    }

    let visibilityType = args.visibilityType ?? (existing ? getVisibilityType(existing) : "private");
    if (visibilityType === "system" && !isSuperuser) {
      throw new Error(`Only superusers can set sprite visibility to "system".`);
    }

    // Strip profileId from the data before storing
    const { profileId: _, visibilityType: __, ...fields } = args;
    const data = {
      ...fields,
      visibilityType,
      createdByUser: existing?.createdByUser ?? userId,
      updatedAt: Date.now(),
    };

    if (existing) {
      // Use replace (not patch) so that cleared optional fields are actually removed
      await ctx.db.replace(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("spriteDefinitions", data);
    }
  },
});

/** Delete a sprite definition by ID. Requires owner or superuser. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    id: v.id("spriteDefinitions"),
  },
  handler: async (ctx, { profileId, id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.userId !== userId) throw new Error("Not your profile");
    const isSuperuser = (profile as any).role === "superuser";

    const def = await ctx.db.get(id);
    if (!def) throw new Error("Sprite definition not found");
    const visibility = getVisibilityType(def);
    const isOwner = (def as any).createdByUser === userId;
    if (!isSuperuser && !isOwner) {
      throw new Error(`Permission denied: only owner or superuser can delete this sprite definition.`);
    }
    if (!isSuperuser && visibility === "system") {
      throw new Error(`Permission denied: only superusers can delete system sprite definitions.`);
    }
    await ctx.db.delete(id);
  },
});
