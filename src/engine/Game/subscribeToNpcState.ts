import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";

export type Unsubscriber = () => void;

/**
 * Subscribe to server-authoritative NPC state for a map.
 */
export function subscribeToNpcState(
  game: IGame & { npcStateUnsub: Unsubscriber | null },
  mapName: string,
): void {
  game.npcStateUnsub?.();

  const convex = getConvexClient();

  (game as { npcStateUnsub: Unsubscriber }).npcStateUnsub = convex.onUpdate(
    api.npcEngine.listByMap,
    { mapName },
    (states) => {
      game.entityLayer.updateNpcStates(
        states.map((s) => ({
          _id: s._id,
          mapObjectId: s.mapObjectId as string,
          spriteDefName: s.spriteDefName,
          instanceName:
            s.instanceName ??
            game.mapObjectInstanceNameById.get(String(s.mapObjectId)) ??
            undefined,
          currentHp: (s as { currentHp?: number }).currentHp,
          maxHp: (s as { maxHp?: number }).maxHp,
          x: s.x,
          y: s.y,
          vx: s.vx,
          vy: s.vy,
          direction: s.direction,
          speed: s.speed,
          wanderRadius: s.wanderRadius,
        })),
        // Sprite defs from Convex match EntityLayer's expected shape
        game.spriteDefCache as Map<string, { name: string; spriteSheetUrl: string; [key: string]: unknown }>,
      );
    },
    (err) => {
      console.warn("NPC state subscription error:", err);
    },
  );
}
