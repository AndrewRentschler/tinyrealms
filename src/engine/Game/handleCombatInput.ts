import {
  COMBAT_DEFEATED,
  COMBAT_HIT,
  COMBAT_HP,
  COMBAT_LOOT,
  COMBAT_TOOK_DAMAGE,
  COMBAT_WARNING,
} from "../../constants/colors.ts";
import {
  COMBAT_ATTACK_KEY,
  COMBAT_ATTACK_KEY_ALT,
  COMBAT_ATTACK_RANGE_PX,
  COMBAT_CLIENT_MIN_INPUT_COOLDOWN_MS,
  COMBAT_DEBUG,
  COMBAT_NPC_HIT_COOLDOWN_MS,
  COMBAT_PLAYER_ATTACK_COOLDOWN_MS,
} from "../../config/combat-config.ts";
import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";
import { showCombatNotification, type CombatNotificationState } from "./showCombatNotification.ts";

/**
 * Handle attack key press to attack nearest hostile NPC.
 */
export async function handleCombatInput(game: IGame): Promise<void> {
  if (game.attacking) return;
  if (!game.currentMapData?.combatEnabled) return;
  if (game.entityLayer.inDialogue) return;

  const attackPressed =
    game.input.wasJustPressed(COMBAT_ATTACK_KEY) ||
    game.input.wasJustPressed(COMBAT_ATTACK_KEY_ALT);
  if (!attackPressed) return;

  if (COMBAT_DEBUG) {
    console.log("[CombatDebug:client] F pressed", {
      mapName: game.currentMapName,
      combatEnabled: !!game.currentMapData?.combatEnabled,
      playerX: Math.round(game.entityLayer.playerX),
      playerY: Math.round(game.entityLayer.playerY),
      inDialogue: game.entityLayer.inDialogue,
      isGuest: game.isGuest,
      settings: game.currentMapData?.combatSettings ?? null,
    });
  }

  const now = Date.now();
  const playerCooldownMs =
    game.currentMapData?.combatSettings?.playerAttackCooldownMs ??
    COMBAT_PLAYER_ATTACK_COOLDOWN_MS;
  const npcHitCooldownMs =
    game.currentMapData?.combatSettings?.npcHitCooldownMs ??
    COMBAT_NPC_HIT_COOLDOWN_MS;
  const effectiveCooldownMs = Math.max(
    COMBAT_CLIENT_MIN_INPUT_COOLDOWN_MS,
    Math.round(playerCooldownMs),
    Math.round(npcHitCooldownMs),
  );
  if (now - game.lastAttackAt < effectiveCooldownMs) {
    if (COMBAT_DEBUG) {
      console.log("[CombatDebug:client] blocked by local cooldown", {
        elapsedMs: now - game.lastAttackAt,
        cooldownMs: effectiveCooldownMs,
      });
    }
    return;
  }
  game.lastAttackAt = now;
  game.attacking = true;
  const state: CombatNotificationState = {
    activeCombatNotifications: game.activeCombatNotifications,
  };

  try {
    const convex = getConvexClient();
    const result = await convex.mutation(api.mechanics.combat.playerAttack.attackNearestHostile, {
        profileId: game.profile._id as import("../../../convex/_generated/dataModel").Id<"profiles">,
        mapName: game.currentMapName,
        x: game.entityLayer.playerX,
        y: game.entityLayer.playerY,
      },
    );

    if (!result?.success) {
      if (COMBAT_DEBUG) console.log("[CombatDebug:client] attack rejected", result);
      showCombatNotification(state, result?.reason ?? "No target in range.", COMBAT_WARNING);
      return;
    }
    if (COMBAT_DEBUG) console.log("[CombatDebug:client] attack accepted", result);

    const dealt = Number(result.dealt ?? 0);
    const took = Number(result.took ?? 0);
    const targetName = String(result.targetName ?? "Enemy");
    showCombatNotification(state, `You hit ${targetName} for ${dealt}`, COMBAT_HIT);

    if (result.targetInstanceName) {
      const hitNpc = game.entityLayer.getNpcByInstanceName(String(result.targetInstanceName));
      hitNpc?.playHitEffect();
      game.audio.playOneShot("/assets/audio/hit.mp3", 0.7);
    }

    if (took > 0) {
      showCombatNotification(state, `${targetName} hits you for ${took}`, COMBAT_TOOK_DAMAGE);
      game.entityLayer.playPlayerHitEffect();
    }
    if (result.defeated) {
      const xp = Number(result.xpGained ?? 0);
      showCombatNotification(state, `${targetName} defeated! +${xp} XP`, COMBAT_DEFEATED);
    } else {
      const hp = Number(result.targetHp ?? 0);
      const max = Number(result.targetMaxHp ?? 0);
      showCombatNotification(state, `${targetName} HP ${hp}/${max}`, COMBAT_HP);
    }
    if (Array.isArray(result.droppedLoot) && result.droppedLoot.length > 0) {
      const first = result.droppedLoot[0];
      showCombatNotification(state, `Loot dropped: ${first.itemDefName}`, COMBAT_LOOT);
    }
    if (typeof took === "number" && took >= 0) {
      game.profile.stats.hp = Math.max(0, game.profile.stats.hp - took);
    }
    if (result.defeated && typeof result.xpGained === "number") {
      game.profile.stats.xp += result.xpGained;
    }
  } catch (err) {
    console.warn("Combat attack failed:", err);
    if (COMBAT_DEBUG) {
      console.log("[CombatDebug:client] attack exception", {
        message: (err as Error)?.message ?? String(err),
      });
    }
    const range = game.currentMapData?.combatSettings?.attackRangePx ?? COMBAT_ATTACK_RANGE_PX;
    showCombatNotification(state, `Attack failed (range ${range}px)`, COMBAT_WARNING);
  } finally {
    game.attacking = false;
  }
}
