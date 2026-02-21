import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";

/** Sprite def shape expected by EntityLayer.updateNpcStates */
type SpriteDefForNpc = Map<string, { name: string; spriteSheetUrl: string; [key: string]: unknown }>;

/**
 * Subscribe to server-authoritative NPC state for a map.
 */
export function subscribeToNpcState(game: IGame, mapName: string): void {
  game.npcStateUnsub?.();

  const convex = getConvexClient();

  game.npcStateUnsub = convex.onUpdate(
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
        game.spriteDefCache as SpriteDefForNpc,
      );
    },
    (err) => {
      console.warn("NPC state subscription error:", err);
    },
  );
}
