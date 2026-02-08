import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/requireAdmin";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all NPC profiles */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("npcProfiles").collect();
  },
});

/** Get an NPC profile by unique instance name */
export const getByName = query({
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
    const profilesByName = new Map(profiles.map((p) => [p.name, p]));

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

/** Save (upsert) an NPC profile by instance name. Requires admin. */
export const save = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.string(),
    spriteDefName: v.string(),
    mapName: v.optional(v.string()),
    displayName: v.string(),
    title: v.optional(v.string()),
    backstory: v.optional(v.string()),
    personality: v.optional(v.string()),
    dialogueStyle: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.profileId);

    const existing = await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    const { profileId: _, ...fields } = args;
    const data = { ...fields, updatedAt: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("npcProfiles", data);
    }
  },
});

/** Assign an instance name to a mapObject. Requires admin. */
export const assignInstanceName = mutation({
  args: {
    profileId: v.id("profiles"),
    mapObjectId: v.id("mapObjects"),
    instanceName: v.string(),
  },
  handler: async (ctx, { profileId, mapObjectId, instanceName }) => {
    await requireAdmin(ctx, profileId);

    // Ensure instance name is unique across all mapObjects
    const allObjects = await ctx.db.query("mapObjects").collect();
    const conflict = allObjects.find(
      (o) => o.instanceName === instanceName && o._id !== mapObjectId
    );
    if (conflict) {
      throw new Error(`Instance name "${instanceName}" is already in use on map "${conflict.mapName}"`);
    }

    await ctx.db.patch(mapObjectId, {
      instanceName,
      updatedAt: Date.now(),
    });
  },
});

/** Delete an NPC profile. Requires admin. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    id: v.id("npcProfiles"),
  },
  handler: async (ctx, { profileId, id }) => {
    await requireAdmin(ctx, profileId);
    await ctx.db.delete(id);
  },
});
