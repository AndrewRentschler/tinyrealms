import {
  INTERACT_KEY,
  INTERACT_KEY_ALT,
  INTERACT_PROMPT_PREFIX,
} from "../../constants/keybindings.ts";
import { COMBAT_ATTACK_KEY } from "../../config/combat-config.ts";
import { NPC_INTERACT_RADIUS_PX } from "../../config/multiplayer-config.ts";
import type { InputManager } from "../InputManager.ts";
import type { IEntityLayer } from "./types.ts";
import type { NPC } from "../NPC.ts";
import { ensureNpcInteractionHintLoaded } from "./ensureNpcInteractionHintLoaded.ts";

function getNpcInteractionHint(
  layer: IEntityLayer,
  npc: NPC,
): "chat" | "attack" | "none" {
  const instanceName = npc.instanceName;
  if (!instanceName) return "chat";
  return layer.npcInteractionHintByInstanceName.get(instanceName) ?? "none";
}

export function updateNPCInteraction(
  layer: IEntityLayer,
  input: InputManager,
  startDialogue: (npc: NPC) => Promise<void>,
): void {
  let nearest: NPC | null = null;
  let nearestDist = NPC_INTERACT_RADIUS_PX;

  for (const npc of layer.npcs) {
    const dist = npc.distanceTo(layer.playerX, layer.playerY);
    if (dist < nearestDist) {
      nearest = npc;
      nearestDist = dist;
    }
  }

  if (layer.nearestNPC && layer.nearestNPC !== nearest) {
    layer.nearestNPC.setPromptVisible(false);
  }
  (layer as { nearestNPC: NPC | null }).nearestNPC = nearest;
  if (nearest) {
    ensureNpcInteractionHintLoaded(layer, nearest);
    const hint = getNpcInteractionHint(layer, nearest);
    if (hint === "chat") {
      nearest.setPrompt(`${INTERACT_PROMPT_PREFIX}Talk`, true);
    } else if (hint === "attack") {
      const hp = nearest.currentHp;
      const maxHp = nearest.maxHp;
      const hpSuffix =
        typeof hp === "number" && typeof maxHp === "number" && maxHp > 0
          ? ` (${Math.max(0, Math.round(hp))}/${Math.max(1, Math.round(maxHp))})`
          : "";
      nearest.setPrompt(`[${COMBAT_ATTACK_KEY.toUpperCase()}] Attack${hpSuffix}`, true);
    } else {
      nearest.setPrompt(`${INTERACT_PROMPT_PREFIX}Interact`, true);
    }
  }

  if (
    nearest &&
    getNpcInteractionHint(layer, nearest) !== "attack" &&
    (input.wasJustPressed(INTERACT_KEY) || input.wasJustPressed(INTERACT_KEY_ALT))
  ) {
    void startDialogue(nearest);
  }
}
