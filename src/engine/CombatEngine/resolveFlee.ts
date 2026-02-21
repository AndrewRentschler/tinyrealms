import type { CombatAction, Combatant, TurnResult } from "./types.ts";
import { FLEE_SUCCESS_CHANCE } from "./constants.ts";

/**
 * Resolve a flee action. Success based on FLEE_SUCCESS_CHANCE.
 */
export function resolveFlee(
  action: CombatAction,
  actor: Combatant,
): TurnResult {
  const success = Math.random() < FLEE_SUCCESS_CHANCE;
  return {
    action,
    message: success
      ? `${actor.name} fled successfully!`
      : `${actor.name} failed to flee!`,
    actorHp: actor.stats.hp,
  };
}
