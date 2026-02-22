/**
 * NPC AI dialogue via Vercel AI SDK + OpenAI (gpt-5-mini / gpt-5-nano).
 *
 * Replaces the Braintrust stub with generateText using NPC profile context,
 * conversation history, and OpenAI models.
 */
"use node";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";

const MODEL_MINI = "gpt-5-mini";
const MODEL_NANO = "gpt-5-nano";
const DEFAULT_MODEL = MODEL_MINI;
const FALLBACK_MODEL = MODEL_NANO;
const MAX_HISTORY_TURNS = 30;
const MAX_OUTPUT_TOKENS = 512;

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env.local and run: npx convex env set OPENAI_API_KEY "$(grep OPENAI_API_KEY .env.local | cut -d= -f2-)"',
    );
  }
  return createOpenAI({ apiKey });
}

type NpcProfile = {
  name?: string;
  displayName?: string;
  title?: string;
  backstory?: string;
  personality?: string;
  dialogueStyle?: string;
  greeting?: string;
  systemPrompt?: string;
  knowledge?: string;
  secrets?: string;
  faction?: string;
  relationships?: Array<{ npcName: string; relation: string; notes?: string }>;
};

function buildSystemPrompt(profile: NpcProfile | null): string {
  if (!profile) {
    return "You are a friendly NPC in a fantasy game. Keep responses brief and in-character.";
  }

  const parts: string[] = [];

  parts.push(
    `You are ${profile.displayName ?? profile.name ?? "an NPC"}${profile.title ? `, ${profile.title}` : ""}, a character in a fantasy game.`,
  );

  if (profile.backstory) {
    parts.push(`\nBackstory: ${profile.backstory}`);
  }
  if (profile.personality) {
    parts.push(`\nPersonality: ${profile.personality}`);
  }
  if (profile.dialogueStyle) {
    parts.push(`\nDialogue style: ${profile.dialogueStyle}`);
  }
  if (profile.faction) {
    parts.push(`\nFaction: ${profile.faction}`);
  }
  if (profile.knowledge) {
    parts.push(`\nKnowledge: ${profile.knowledge}`);
  }
  if (profile.secrets) {
    parts.push(
      `\n(Internal - things you know but may not reveal freely): ${profile.secrets}`,
    );
  }
  if (profile.relationships?.length) {
    parts.push(
      "\nRelationships: " +
        profile.relationships
          .map(
            (r) =>
              `${r.npcName} (${r.relation})${r.notes ? `: ${r.notes}` : ""}`,
          )
          .join("; "),
    );
  }
  if (profile.greeting) {
    parts.push(`\nYour default greeting: "${profile.greeting}"`);
  }
  if (profile.systemPrompt) {
    parts.push(`\nAdditional instructions: ${profile.systemPrompt}`);
  }

  parts.push(
    "\nKeep responses concise (1-3 sentences typically). Stay in character. Do not break the fourth wall.",
  );

  return parts.join("");
}

export const generateResponse = action({
  args: {
    npcProfileName: v.string(),
    playerMessage: v.string(),
    mapName: v.optional(v.string()),
    actorProfileId: v.optional(v.id("profiles")),
  },
  returns: v.object({
    response: v.string(),
    actions: v.array(
      v.object({
        type: v.string(),
        payload: v.optional(
          v.record(
            v.string(),
            v.union(v.string(), v.number(), v.boolean(), v.null()),
          ),
        ),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { npcProfileName, playerMessage, mapName, actorProfileId } = args;

    const internalApi = internal as unknown as Record<
      string,
      Record<
        string,
        | FunctionReference<"query", "internal">
        | FunctionReference<"mutation", "internal">
      >
    >;
    const [profile, history] = await Promise.all([
      ctx.runQuery(
        internalApi["npcProfiles/queries"]
          .getByNameInternal as FunctionReference<"query", "internal">,
        {
          name: npcProfileName,
        },
      ),
      ctx.runQuery(
        internalApi["npc/memory"]
          .getConversationHistoryInternal as FunctionReference<
          "query",
          "internal"
        >,
        {
          npcProfileName,
          limit: MAX_HISTORY_TURNS,
        },
      ),
    ]);

    const systemPrompt = buildSystemPrompt(profile as NpcProfile | null);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.map((m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: playerMessage },
    ];

    let text: string;
    let modelUsed = DEFAULT_MODEL;

    const openai = getOpenAI();
    try {
      const result = await generateText({
        model: openai.chat(DEFAULT_MODEL),
        system: systemPrompt,
        messages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
      text = result.text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("model") ||
        msg.includes("not found") ||
        msg.includes("404")
      ) {
        try {
          const fallback = await generateText({
            model: openai.chat(FALLBACK_MODEL),
            system: systemPrompt,
            messages,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          });
          text = fallback.text;
          modelUsed = FALLBACK_MODEL;
        } catch (fallbackErr) {
          text =
            "I'm having trouble thinking right now. Please try again in a moment.";
          console.error("[NPC AI] Fallback model failed:", fallbackErr);
        }
      } else {
        text = "Something went wrong. Please try again.";
        console.error("[NPC AI] generateText failed:", err);
      }
    }

    await ctx.runMutation(
      internalApi["npc/memory"].appendConversationInternal as FunctionReference<
        "mutation",
        "internal"
      >,
      {
        npcProfileName,
        mapName,
        actorProfileId,
        userContent: playerMessage,
        assistantContent: text,
      },
    );

    return {
      response: text,
      actions: [],
    };
  },
});
