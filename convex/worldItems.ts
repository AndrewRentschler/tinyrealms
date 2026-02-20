import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireSuperuser } from "./lib/requireSuperuser";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all world items on a map (including picked-up ones for respawn logic) */
export const listByMap = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    const items = await ctx.db
      .query("worldItems")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();

    // Also fetch the item definitions so clients can render icons
    const defNames = [...new Set(items.map((i) => i.itemDefName))];
    const allDefs = await ctx.db.query("itemDefs").collect();
    const defsMap: Record<string, any> = {};
    const iconSpriteDefNames = new Set<string>();
    for (const d of allDefs) {
      if (!defNames.includes(d.name)) continue;
      defsMap[d.name] = d;
      if (
        typeof (d as any).iconSpriteDefName === "string" &&
        (d as any).iconSpriteDefName.length > 0
      ) {
        iconSpriteDefNames.add((d as any).iconSpriteDefName);
      }
    }

    // Resolve optional sprite-def-based item icons (animated object sprites).
    if (iconSpriteDefNames.size > 0) {
      const spriteDefs = await ctx.db.query("spriteDefinitions").collect();
      const spriteByName = new Map(spriteDefs.map((d) => [d.name, d]));
      for (const def of Object.values(defsMap)) {
        const spriteName = (def as any).iconSpriteDefName;
        if (!spriteName) continue;
        const spriteDef = spriteByName.get(spriteName);
        if (!spriteDef) continue;
        // Only expose safe icon fields needed by the client renderer.
        (def as any).iconSpriteSheetUrl = spriteDef.spriteSheetUrl;
        (def as any).iconSpriteAnimation = spriteDef.defaultAnimation;
        (def as any).iconSpriteAnimationSpeed = spriteDef.animationSpeed;
        (def as any).iconSpriteScale = spriteDef.scale;
        (def as any).iconSpriteFrameWidth = spriteDef.frameWidth;
        (def as any).iconSpriteFrameHeight = spriteDef.frameHeight;
      }
    }

    return { items, defs: defsMap };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Place a world item on a map. Requires admin. */
export const place = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    itemDefName: v.string(),
    x: v.float64(),
    y: v.float64(),
    quantity: v.optional(v.number()),
    respawn: v.optional(v.boolean()),
    respawnMs: v.optional(v.number()),
  },
  handler: async (ctx, { profileId, ...args }) => {
    await requireSuperuser(ctx, profileId);
    return await ctx.db.insert("worldItems", {
      ...args,
      quantity: args.quantity ?? 1,
      updatedAt: Date.now(),
      placedBy: profileId,
    });
  },
});

/** Remove a world item. Requires admin. */
export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    id: v.id("worldItems"),
  },
  handler: async (ctx, { profileId, id }) => {
    await requireSuperuser(ctx, profileId);
    await ctx.db.delete(id);
  },
});

/** Bulk save: replace all world items for a map. Requires admin. */
export const bulkSave = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    items: v.array(
      v.object({
        sourceId: v.optional(v.id("worldItems")),
        itemDefName: v.string(),
        x: v.float64(),
        y: v.float64(),
        quantity: v.optional(v.number()),
        respawn: v.optional(v.boolean()),
        respawnMs: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { profileId, mapName, items }) => {
    await requireSuperuser(ctx, profileId);
    // Load existing rows for this map
    const existing = await ctx.db
      .query("worldItems")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();

    const existingById = new Map(existing.map((e) => [String(e._id), e]));
    const incomingIds = new Set(
      items
        .map((i) => (i.sourceId ? String(i.sourceId) : null))
        .filter((id): id is string => id !== null),
    );

    // Delete rows that were removed in the editor
    for (const obj of existing) {
      if (!incomingIds.has(String(obj._id))) {
        await ctx.db.delete(obj._id);
      }
    }

    // Upsert incoming rows. Preserve pickup/respawn state for existing rows.
    for (const item of items) {
      if (item.sourceId && existingById.has(String(item.sourceId))) {
        await ctx.db.patch(item.sourceId, {
          mapName,
          itemDefName: item.itemDefName,
          x: item.x,
          y: item.y,
          quantity: item.quantity ?? 1,
          respawn: item.respawn,
          respawnMs: item.respawnMs,
          updatedAt: Date.now(),
          placedBy: profileId,
        });
      } else {
        await ctx.db.insert("worldItems", {
          mapName,
          itemDefName: item.itemDefName,
          x: item.x,
          y: item.y,
          quantity: item.quantity ?? 1,
          respawn: item.respawn,
          respawnMs: item.respawnMs,
          updatedAt: Date.now(),
          placedBy: profileId,
        });
      }
    }
  },
});

/**
 * Pick up a world item. Any player can do this.
 * Adds the item to the player's inventory and marks it as picked up.
 */
export const pickup = mutation({
  args: {
    profileId: v.id("profiles"),
    worldItemId: v.id("worldItems"),
  },
  handler: async (ctx, { profileId, worldItemId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { success: false, reason: "Not authenticated" };

    const worldItem = await ctx.db.get(worldItemId);
    if (!worldItem) return { success: false, reason: "Item not found" };
    const itemDef = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", (q) => q.eq("name", worldItem.itemDefName))
      .first();

    // Check if already picked up (and not respawned)
    if (worldItem.pickedUpAt) {
      if (!worldItem.respawn) {
        return { success: false, reason: "Already picked up" };
      }
      // Check respawn timer (use same default as the scheduler)
      const respawnMs = worldItem.respawnMs ?? 300_000;
      if (Date.now() - worldItem.pickedUpAt < respawnMs) {
        return { success: false, reason: "Not yet respawned" };
      }
    }

    // Add to player inventory
    const profile = await ctx.db.get(profileId);
    if (!profile) return { success: false, reason: "Profile not found" };
    if (profile.userId !== userId) {
      return {
        success: false,
        reason: "Cannot pick up items for another profile",
      };
    }

    const items = [...profile.items];
    const existing = items.find((i) => i.name === worldItem.itemDefName);
    if (existing) {
      existing.quantity += worldItem.quantity;
    } else {
      items.push({ name: worldItem.itemDefName, quantity: worldItem.quantity });
    }
    await ctx.db.patch(profileId, { items });

    // Quest progress: item pickup/objective tracking.
    // TODO: Uncomment this when quests are implemented
    // await ctx.runMutation(internal.quests.recordItemProgress, {
    //   profileId,
    //   itemDefName: worldItem.itemDefName,
    //   quantity: worldItem.quantity,
    // });

    // Mark as picked up (or delete if non-respawning)
    if (worldItem.respawn) {
      await ctx.db.patch(worldItemId, {
        pickedUpAt: Date.now(),
        pickedUpBy: profileId,
      });
      // Schedule respawn: clear pickedUpAt after the delay
      const respawnMs = worldItem.respawnMs ?? 300_000; // default 5 minutes
      await ctx.scheduler.runAfter(respawnMs, internal.worldItems.respawn, {
        worldItemId,
      });
    } else {
      await ctx.db.delete(worldItemId);
    }

    return {
      success: true,
      itemName: worldItem.itemDefName,
      quantity: worldItem.quantity,
      respawns: !!worldItem.respawn,
      pickupSoundUrl: itemDef?.pickupSoundUrl,
    };
  },
});

/** Internal: clear pickedUpAt so the item reappears */
export const respawn = internalMutation({
  args: { worldItemId: v.id("worldItems") },
  handler: async (ctx, { worldItemId }) => {
    const item = await ctx.db.get(worldItemId);
    if (!item) return; // item was deleted
    await ctx.db.patch(worldItemId, {
      pickedUpAt: undefined,
      pickedUpBy: undefined,
    });
  },
});
