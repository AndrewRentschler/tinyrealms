import { api } from "../../../convex/_generated/api";
import { getConvexClient } from "../../lib/convexClient.ts";
import type { NPC } from "../NPC.ts";
import type { IEntityLayer } from "./types.ts";

export function ensureNpcInteractionHintLoaded(
  layer: IEntityLayer,
  npc: NPC,
): void {
  const instanceName = npc.instanceName;
  if (!instanceName) return;
  if (layer.npcInteractionHintByInstanceName.has(instanceName)) return;
  if (layer.npcInteractionHintPending.has(instanceName)) return;
  layer.npcInteractionHintPending.add(instanceName);

  const convex = getConvexClient();
  void convex
    .query(api.npcProfiles.queries.getByName, { name: instanceName })
    .then((profile: { tags?: string[]; instanceType?: string } | null) => {
      const hostile =
        !!profile &&
        Array.isArray(profile.tags) &&
        profile.tags.includes("hostile");
      const isAnimal = profile?.instanceType === "animal";
      const canChat = !isAnimal;
      const combatEnabled = !!layer.game.currentMapData?.combatEnabled;
      const hint: "chat" | "attack" | "none" =
        hostile && combatEnabled ? "attack" : canChat ? "chat" : "none";
      layer.npcInteractionHintByInstanceName.set(instanceName, hint);
    })
    .catch(() => {
      layer.npcInteractionHintByInstanceName.set(instanceName, "chat");
    })
    .finally(() => {
      layer.npcInteractionHintPending.delete(instanceName);
    });
}
