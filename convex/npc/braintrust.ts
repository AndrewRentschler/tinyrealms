// Stub NPC Braintrust module for local development
import { action } from "../_generated/server";
import { v } from "convex/values";

// Stub action for Braintrust AI calls
export const generateResponse = action({
  args: {
    npcProfileName: v.string(),
    playerMessage: v.string(),
    conversationHistory: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    console.warn("Braintrust AI not configured - returning stub response");
    return {
      response: "I'm just a placeholder NPC. Configure Braintrust AI to make me smart!",
      actions: [],
    };
  },
});
