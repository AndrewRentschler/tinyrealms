import { COMBAT_AGGRO } from "../../constants/colors.ts";
import { COMBAT_AGGRO_TICK_INTERVAL_MS } from "../../config/combat-config.ts";
import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";
import { showCombatNotification, type CombatNotificationState } from "./showCombatNotification.ts";

/**
 * Periodically resolve hostile NPC aggro attacks.
 */
export async function handleHostileAggroTick(game: IGame): Promise<void> {
  if (game.aggroResolving) return;
  if (!game.currentMapData?.combatEnabled) return;
  if (game.entityLayer.inDialogue) return;

  const now = Date.now();
  if (now - game.lastAggroTickAt < COMBAT_AGGRO_TICK_INTERVAL_MS) return;
  game.lastAggroTickAt = now;
  game.aggroResolving = true;
  const state: CombatNotificationState = {
    activeCombatNotifications: game.activeCombatNotifications,
  };

  try {
    const convex = getConvexClient();
    const result = await convex.mutation(api["mechanics/combat"].resolveAggroAttack, {
        profileId: game.profile._id as import("../../../convex/_generated/dataModel").Id<"profiles">,
        mapName: game.currentMapName,
        x: game.entityLayer.playerX,
        y: game.entityLayer.playerY,
      },
    );
    if (!result?.success) return;
    const attacker = String(result.attackerName ?? "Hostile");
    const took = Number(result.took ?? 0);
    if (took > 0) {
      showCombatNotification(state, `${attacker} attacks you for ${took}`, COMBAT_AGGRO);
      game.entityLayer.playPlayerHitEffect();
    }
    if (typeof result.playerHp === "number") {
      game.profile.stats.hp = Math.max(0, Number(result.playerHp));
    }
  } catch (err) {
    console.warn("Aggro combat tick failed:", err);
  } finally {
    game.aggroResolving = false;
  }
}
