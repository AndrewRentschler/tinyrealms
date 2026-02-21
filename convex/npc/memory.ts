/**
 * NPC conversation memory: list and manage dialogue history.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";

const conversationMessageValidator = v.object({
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.string(),
  createdAt: v.optional(v.number()),
});

/** List recent conversation turns for an NPC (for editor UI) */
export const listConversation = query({
  args: {
    npcProfileName: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(conversationMessageValidator),
  handler: async (ctx, { npcProfileName, limit = 20 }) => {
    const rows = await ctx.db
      .query("npcConversations")
      .withIndex("by_npc_time", (q) => q.eq("npcProfileName", npcProfileName))
      .order("desc")
      .take(limit ?? 20);
    return rows
      .reverse()
      .map((r) => ({
        role: r.role,
        content: r.content,
        createdAt: r.createdAt,
      }));
  },
});

/** Internal: load conversation history for AI context */
export const getConversationHistoryInternal = internalQuery({
  args: {
    npcProfileName: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    })
  ),
  handler: async (ctx, { npcProfileName, limit = 30 }) => {
    const rows = await ctx.db
      .query("npcConversations")
      .withIndex("by_npc_time", (q) => q.eq("npcProfileName", npcProfileName))
      .order("desc")
      .take(limit ?? 30);
    return rows
      .reverse()
      .filter((r) => r.role === "user" || r.role === "assistant")
      .map((r) => ({
        role: r.role as "user" | "assistant",
        content: r.content,
      }));
  },
});

/** Internal: append user and assistant messages to conversation */
export const appendConversationInternal = internalMutation({
  args: {
    npcProfileName: v.string(),
    mapName: v.optional(v.string()),
    actorProfileId: v.optional(v.id("profiles")),
    userContent: v.string(),
    assistantContent: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("npcConversations", {
      npcProfileName: args.npcProfileName,
      mapName: args.mapName,
      actorProfileId: args.actorProfileId,
      role: "user",
      content: args.userContent,
      createdAt: now,
    });
    await ctx.db.insert("npcConversations", {
      npcProfileName: args.npcProfileName,
      mapName: args.mapName,
      actorProfileId: args.actorProfileId,
      role: "assistant",
      content: args.assistantContent,
      createdAt: now + 1,
    });
    return null;
  },
});
