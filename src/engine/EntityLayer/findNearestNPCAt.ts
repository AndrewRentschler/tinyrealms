import type { IEntityLayer, FindNearestResult } from "./types.ts";
import { distance } from "./math.ts";

export function findNearestNPCAt(
  layer: IEntityLayer,
  worldX: number,
  worldY: number,
  maxRadius: number,
): FindNearestResult | null {
  let best: FindNearestResult | null = null;
  for (const npc of layer.npcs) {
    const dist = distance(worldX, worldY, npc.x, npc.y);
    if (dist < maxRadius && (!best || dist < best.dist)) {
      best = { id: npc.id, dist };
    }
  }
  return best;
}
