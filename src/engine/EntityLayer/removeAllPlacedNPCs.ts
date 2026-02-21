import type { IEntityLayer } from "./types.ts";
import { PLACED_NPC_ID_MIN_LENGTH } from "./constants.ts";

export function removeAllPlacedNPCs(layer: IEntityLayer): void {
  const toRemove = layer.npcs.filter((n) => n.id.length > PLACED_NPC_ID_MIN_LENGTH);
  for (const npc of toRemove) {
    layer.removeNPC(npc.id);
  }
}
