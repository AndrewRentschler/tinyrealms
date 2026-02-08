import type { DialogueTreeDef, DialogueNode } from "./StoryTypes.ts";
import { splashManager } from "../splash/SplashManager.ts";
import { createDialogueSplash } from "../splash/screens/DialogueSplash.ts";

/**
 * Walks a dialogue tree and renders it via the splash system.
 */
export class DialogueRunner {
  /** Start a dialogue tree by pushing a DialogueSplash */
  start(
    tree: DialogueTreeDef,
    onChoice?: (nodeId: string, responseIndex: number) => void,
    onClose?: () => void
  ) {
    const nodes = tree.nodes.map((n) => ({
      id: n.id,
      text: n.text,
      speaker: n.speaker,
      responses: n.responses?.map((r) => ({
        text: r.text,
        nextNodeId: r.nextNodeId,
        effect: r.effect,
      })),
      nextNodeId: n.nextNodeId,
    }));

    splashManager.push({
      id: `dialogue-${tree.triggerId ?? tree.npcName ?? Date.now()}`,
      create: (props) =>
        createDialogueSplash({
          ...props,
          nodes,
          startNodeId: tree.startNodeId,
          npcName: tree.npcName,
          onChoice,
        }),
      transparent: true,
      pausesGame: true,
      onClose,
    });
  }

  /** Get a node by ID from a tree */
  getNode(tree: DialogueTreeDef, nodeId: string): DialogueNode | undefined {
    return tree.nodes.find((n) => n.id === nodeId);
  }
}

export const dialogueRunner = new DialogueRunner();
