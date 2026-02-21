/**
 * Resolves NPC dialogue mode (AI vs static) and sends AI messages.
 */
import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { NPC } from "../../engine/NPC.ts";
import type { DialogueLine } from "../../engine/NPC.ts";

export type DialogueNode = {
  id: string;
  text: string;
  speaker?: string;
  responses?: { text: string; nextNodeId: string; effect?: string }[];
  nextNodeId?: string;
};

export type ResolveModeResult =
  | { kind: "disabled" }
  | { kind: "ai"; npcName: string; npcProfileName: string }
  | { kind: "static"; nodes: DialogueNode[]; npcName: string };

function dialogueLinesToNodes(lines: DialogueLine[]): DialogueNode[] {
  return lines.map((line) => ({
    id: line.id,
    text: line.text,
    responses: line.responses?.map((r) => ({
      text: r.text,
      nextNodeId: r.nextId,
    })),
    nextNodeId: line.nextId,
  }));
}

export class NpcDialogueController {
  /**
   * Resolve whether this NPC uses AI chat or static dialogue.
   */
  async resolveMode(npc: NPC): Promise<ResolveModeResult> {
    const instanceName = npc.instanceName;
    const displayName = npc.name;

    if (!instanceName) {
      // No profile link – use static dialogue from NPC config if any
      if (npc.dialogue?.length > 0) {
        return {
          kind: "static",
          nodes: dialogueLinesToNodes(npc.dialogue),
          npcName: displayName,
        };
      }
      return { kind: "disabled" };
    }

    const convex = getConvexClient();
    const profile = await convex.query(api.npcProfiles.getByName, {
      name: instanceName,
    });

    if (!profile) {
      if (npc.dialogue?.length > 0) {
        return {
          kind: "static",
          nodes: dialogueLinesToNodes(npc.dialogue),
          npcName: displayName,
        };
      }
      return { kind: "disabled" };
    }

    const npcType = (profile as { npcType?: string }).npcType;
    const aiEnabled = (profile as { aiEnabled?: boolean }).aiEnabled;
    const canChat = (profile as { aiPolicy?: { capabilities?: { canChat?: boolean } } })
      ?.aiPolicy?.capabilities?.canChat;

    const useAi =
      (npcType === "ai" || aiEnabled === true) &&
      (canChat !== false);

    if (useAi) {
      return {
        kind: "ai",
        npcName: (profile as { displayName?: string }).displayName ?? displayName,
        npcProfileName: (profile as { name: string }).name,
      };
    }

    // Static: use NPC's dialogue from level config
    if (npc.dialogue?.length > 0) {
      return {
        kind: "static",
        nodes: dialogueLinesToNodes(npc.dialogue),
        npcName: (profile as { displayName?: string }).displayName ?? displayName,
      };
    }

    return { kind: "disabled" };
  }

  /**
   * Send a message to an AI NPC and return the reply text.
   */
  async sendAiMessage(args: {
    npcProfileName: string;
    userMessage: string;
    mapName: string;
  }): Promise<string> {
    const convex = getConvexClient();
    const result = await convex.action(api.npc.braintrust.generateResponse, {
      npcProfileName: args.npcProfileName,
      playerMessage: args.userMessage,
    });
    return (result as { response?: string }).response ?? "";
  }
}
