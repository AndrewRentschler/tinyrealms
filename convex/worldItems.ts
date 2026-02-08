import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/requireAdmin";

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
    for (const d of allDefs) {
      if (defNames.includes(d.name)) defsMap[d.name] = d;
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
    await requireAdmin(ctx, profileId);
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
    await requireAdmin(ctx, profileId);
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
        itemDefName: v.string(),
        x: v.float64(),
        y: v.float64(),
        quantity: v.optional(v.number()),
        respawn: v.optional(v.boolean()),
        respawnMs: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, { profileId, mapName, items }) => {
    await requireAdmin(ctx, profileId);
    // Delete existing
    const existing = await ctx.db
      .query("worldItems")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    for (const obj of existing) {
      await ctx.db.delete(obj._id);
    }
    // Insert new
    for (const item of items) {
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
    const worldItem = await ctx.db.get(worldItemId);
    if (!worldItem) return { success: false, reason: "Item not found" };

    // Check if already picked up (and not respawned)
    if (worldItem.pickedUpAt) {
      if (!worldItem.respawn) {
        return { success: false, reason: "Already picked up" };
      }
      // Check respawn timer
      const respawnMs = worldItem.respawnMs ?? 30_000;
      if (Date.now() - worldItem.pickedUpAt < respawnMs) {
        return { success: false, reason: "Not yet respawned" };
      }
    }

    // Add to player inventory
    const profile = await ctx.db.get(profileId);
    if (!profile) return { success: false, reason: "Profile not found" };

    const items = [...profile.items];
    const existing = items.find((i) => i.name === worldItem.itemDefName);
    if (existing) {
      existing.quantity += worldItem.quantity;
    } else {
      items.push({ name: worldItem.itemDefName, quantity: worldItem.quantity });
    }
    await ctx.db.patch(profileId, { items });

    // Mark as picked up (or delete if non-respawning)
    if (worldItem.respawn) {
      await ctx.db.patch(worldItemId, {
        pickedUpAt: Date.now(),
        pickedUpBy: profileId,
      });
    } else {
      await ctx.db.delete(worldItemId);
    }

    return {
      success: true,
      itemName: worldItem.itemDefName,
      quantity: worldItem.quantity,
    };
  },
});
