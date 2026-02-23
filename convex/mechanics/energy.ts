import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "../_generated/server";

const DEFAULT_ENERGY = 100;

export const ensureInitialized = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    let profilesPatched = 0;
    const hasSuperuserProfile = profiles.some(
      (profile) => profile.role === "superuser",
    );

    for (const profile of profiles) {
      if (
        profile.energy !== undefined &&
        profile.maxEnergy !== undefined &&
        profile.lastEnergyTickAt !== undefined
      ) {
        continue;
      }

      await ctx.db.patch(profile._id, {
        energy: profile.energy ?? DEFAULT_ENERGY,
        maxEnergy: profile.maxEnergy ?? DEFAULT_ENERGY,
        lastEnergyTickAt: profile.lastEnergyTickAt ?? now,
      });
      profilesPatched += 1;
    }

    let npcPatched = 0;

    if (hasSuperuserProfile) {
      const npcRows = await ctx.db.query("npcState").collect();
      for (const npc of npcRows) {
        if (
          npc.energy !== undefined &&
          npc.maxEnergy !== undefined &&
          npc.lastEnergyTickAt !== undefined
        ) {
          continue;
        }

        await ctx.db.patch(npc._id, {
          energy: npc.energy ?? DEFAULT_ENERGY,
          maxEnergy: npc.maxEnergy ?? DEFAULT_ENERGY,
          lastEnergyTickAt: npc.lastEnergyTickAt ?? now,
        });
        npcPatched += 1;
      }
    }

    return {
      success: true,
      profilesPatched,
      npcPatched,
    };
  },
});

export const eat = mutation({
  args: {
    profileId: v.id("profiles"),
    itemDefName: v.string(),
  },
  handler: async (ctx, { profileId, itemDefName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { success: false, energyRestored: 0, newEnergy: 0, reason: "Not authenticated" as const };
    }

    const profile = await ctx.db.get(profileId);
    if (!profile) {
      return { success: false, energyRestored: 0, newEnergy: 0, reason: "Profile not found" as const };
    }
    if (profile.userId !== userId) {
      return {
        success: false,
        energyRestored: 0,
        newEnergy: 0,
        reason: "Cannot eat items for another profile" as const,
      };
    }

    const itemDef = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", (q) => q.eq("name", itemDefName))
      .first();
    if (!itemDef || (itemDef.energyRestore ?? 0) <= 0) {
      return {
        success: false,
        energyRestored: 0,
        newEnergy: profile.energy ?? profile.maxEnergy ?? DEFAULT_ENERGY,
        reason: "Item is not edible" as const,
      };
    }

    const items = [...profile.items];
    const idx = items.findIndex((item) => item.name === itemDefName);
    if (idx < 0 || items[idx].quantity <= 0) {
      return {
        success: false,
        energyRestored: 0,
        newEnergy: profile.energy ?? profile.maxEnergy ?? DEFAULT_ENERGY,
        reason: "Item not found in inventory" as const,
      };
    }

    if (items[idx].quantity === 1) {
      items.splice(idx, 1);
    } else {
      items[idx] = { ...items[idx], quantity: items[idx].quantity - 1 };
    }

    const restoreAmount = itemDef.energyRestore ?? 0;
    const now = Date.now();
    const maxEnergy = Math.max(1, profile.maxEnergy ?? DEFAULT_ENERGY);
    const currentEnergy = Math.max(0, Math.min(maxEnergy, profile.energy ?? maxEnergy));
    const nextEnergy = Math.min(maxEnergy, currentEnergy + restoreAmount);
    const energyRestored = nextEnergy - currentEnergy;

    const patch: {
      items: typeof items;
      energy: number;
      lastEnergyTickAt: number;
      maxEnergy?: number;
    } = {
      items,
      energy: nextEnergy,
      lastEnergyTickAt: now,
    };
    if (profile.maxEnergy === undefined) {
      patch.maxEnergy = maxEnergy;
    }

    await ctx.db.patch(profile._id, patch);

    return {
      success: true,
      energyRestored,
      newEnergy: nextEnergy,
    };
  },
});
