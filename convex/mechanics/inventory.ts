import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";

export const getByPlayer = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    return await ctx.db
      .query("inventories")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .first();
  },
});

export const addItem = mutation({
  args: {
    profileId: v.id("profiles"),
    itemDefName: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, { profileId, itemDefName, quantity }) => {
    let inv = await ctx.db
      .query("inventories")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .first();

    if (!inv) {
      const id = await ctx.db.insert("inventories", {
        profileId,
        slots: [{ itemDefName, quantity, metadata: {} }],
      });
      // TODO: Uncomment this when quests are implemented
      // await ctx.runMutation(internal.quests.recordItemProgress, {
      //   profileId,
      //   itemDefName,
      //   quantity,
      // });
      return id;
    }

    const slots = [...(inv.slots as any[])];
    const itemDef = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", (q) => q.eq("name", itemDefName))
      .first();
    const existing = slots.findIndex(
      (s: any) => s.itemDefName === itemDefName && itemDef?.stackable
    );

    if (existing >= 0) {
      slots[existing] = {
        ...slots[existing],
        quantity: slots[existing].quantity + quantity,
      };
    } else {
      slots.push({ itemDefName, quantity, metadata: {} });
    }

    await ctx.db.patch(inv._id, { slots });
    // TODO: Uncomment this when quests are implemented
    // await ctx.runMutation(internal.quests.recordItemProgress, {
    //   profileId,
    //   itemDefName,
    //   quantity,
    // });
    return inv._id;
  },
});

export const removeItem = mutation({
  args: {
    profileId: v.id("profiles"),
    itemDefName: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, { profileId, itemDefName, quantity }) => {
    const inv = await ctx.db
      .query("inventories")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .first();

    if (!inv) throw new Error("No inventory");

    const slots = [...(inv.slots as any[])];
    const idx = slots.findIndex((s: any) => s.itemDefName === itemDefName);
    if (idx < 0) throw new Error("Item not found");

    slots[idx].quantity -= quantity;
    if (slots[idx].quantity <= 0) {
      slots.splice(idx, 1);
    }

    await ctx.db.patch(inv._id, { slots });
  },
});
