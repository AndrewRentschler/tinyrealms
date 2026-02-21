// Stub AI module for local development
import { action, httpAction } from "./_generated/server";
import { v } from "convex/values";

// HTTP handlers for AI endpoints
export const options = httpAction(async (_ctx, _request) => {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
});

export const invoke = httpAction(async (_ctx, _request) => {
  return new Response(
    JSON.stringify({ error: "AI not configured for local development" }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
});

export const invokeStream = httpAction(async (_ctx, _request) => {
  return new Response(
    JSON.stringify({ error: "AI streaming not configured for local development" }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
});

// Stub actions that AI functionality expects
export const generateNpcResponse = action({
  args: { npcId: v.id("npcProfiles"), message: v.string(), context: v.optional(v.any()) },
  returns: v.object({
    response: v.string(),
    actions: v.array(v.any()),
  }),
  handler: async (ctx, args) => {
    console.warn("AI not configured - returning stub response");
    return {
      response: "I'm just a placeholder NPC. Configure AI to make me smart!",
      actions: [],
    };
  },
});

export const generateStoryBranch = action({
  args: { questId: v.id("quests"), context: v.optional(v.any()) },
  returns: v.object({ content: v.string() }),
  handler: async (ctx, args) => {
    console.warn("AI not configured - returning stub response");
    return {
      content: "Story generation not configured for local development.",
    };
  },
});
