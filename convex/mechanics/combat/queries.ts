/**
 * Combat queries.
 */
import { v } from "convex/values";
import { query } from "../../_generated/server";

export const getEncounter = query({
  args: { id: v.id("combatEncounters") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});
