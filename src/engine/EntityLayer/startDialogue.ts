import { splashManager } from "../../splash/SplashManager.ts";
import { createAiChatSplash } from "../../splash/screens/AiChatSplash.ts";
import { createDialogueSplash } from "../../splash/screens/DialogueSplash.ts";
import type { NPC } from "../NPC.ts";
import { SOUND_ONE_SHOT_VOLUME } from "./constants.ts";
import type { IEntityLayer } from "./types.ts";

export async function startDialogue(
  layer: IEntityLayer,
  npc: NPC,
): Promise<void> {
  if (npc.interactSoundUrl) {
    layer.game.audio.playOneShot(npc.interactSoundUrl, SOUND_ONE_SHOT_VOLUME);
  }

  npc.faceToward(layer.playerX, layer.playerY);

  const mode = await layer.npcDialogueController.resolveMode(npc);
  if (mode.kind === "disabled") return;

  (layer as { inDialogue: boolean; engagedNpcId: string | null }).inDialogue =
    true;
  (layer as { inDialogue: boolean; engagedNpcId: string | null }).engagedNpcId =
    npc.id;
  npc.setDialogueLocked(true);

  splashManager.push({
    id: `dialogue-${npc.id}`,
    create: (props) =>
      mode.kind === "ai"
        ? createAiChatSplash({
            ...props,
            npcName: mode.npcName,
            npcProfileName: mode.npcProfileName,
            onSend: (message: string) =>
              layer.npcDialogueController.sendAiMessage({
                npcProfileName: mode.npcProfileName,
                userMessage: message,
                mapName: layer.game.currentMapName,
              }),
          })
        : createDialogueSplash({
            ...props,
            nodes: mode.nodes,
            startNodeId: mode.nodes[0]?.id,
            npcName: mode.npcName,
          }),
    transparent: true,
    pausesGame: false,
    onClose: () => {
      npc.setDialogueLocked(false);
      (
        layer as { inDialogue: boolean; engagedNpcId: string | null }
      ).inDialogue = false;
      (
        layer as { inDialogue: boolean; engagedNpcId: string | null }
      ).engagedNpcId = null;
    },
  });
}
