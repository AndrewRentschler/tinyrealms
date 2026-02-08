import { v } from "convex/values";
import { action } from "../_generated/server";

// Braintrust AI Proxy for LLM-assisted narrative generation
// Uses the Braintrust proxy endpoint for chat completions

export const generateDialogue = action({
  args: {
    systemPrompt: v.string(),
    userMessage: v.string(),
    conversationHistory: v.optional(v.any()),
  },
  handler: async (_ctx, { systemPrompt, userMessage, conversationHistory }) => {
    const apiKey = process.env.BRAINTRUST_API_KEY;
    if (!apiKey) throw new Error("BRAINTRUST_API_KEY not configured");

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (conversationHistory) {
      messages.push(...(conversationHistory as any[]));
    }
    messages.push({ role: "user", content: userMessage });

    const response = await fetch(
      "https://api.braintrust.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages,
          max_tokens: 500,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Braintrust API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  },
});

export const expandNarrative = action({
  args: {
    prompt: v.string(),
    context: v.optional(v.string()),
    type: v.union(
      v.literal("quest"),
      v.literal("dialogue"),
      v.literal("lore"),
      v.literal("backstory")
    ),
  },
  handler: async (_ctx, { prompt, context, type }) => {
    const apiKey = process.env.BRAINTRUST_API_KEY;
    if (!apiKey) throw new Error("BRAINTRUST_API_KEY not configured");

    const systemPrompts: Record<string, string> = {
      quest:
        "You are a game narrative designer. Expand the following quest outline into detailed quest steps with conditions and dialogue. Output valid JSON.",
      dialogue:
        "You are a game narrative designer. Create dialogue tree nodes from the given outline. Each node should have an id, text, and optional responses array. Output valid JSON.",
      lore: "You are a world-builder for a 2D RPG. Write rich lore entries based on the keywords provided. Keep entries concise (2-3 paragraphs).",
      backstory:
        "You are a character writer for a 2D RPG. Flesh out the NPC backstory from the bullet points provided. Keep it concise but evocative.",
    };

    const messages = [
      { role: "system", content: systemPrompts[type] },
      ...(context ? [{ role: "user", content: `Context: ${context}` }] : []),
      { role: "user", content: prompt },
    ];

    const response = await fetch(
      "https://api.braintrust.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages,
          max_tokens: 1000,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Braintrust API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  },
});
