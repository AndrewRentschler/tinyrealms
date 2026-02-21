import type { CombatAction, Combatant, TurnResult } from "./types.ts";
import { DEFEND_HEAL_FRACTION } from "./constants.ts";

/**
 * Resolve a defend action. Heals actor by fraction of max HP. Mutates actor.stats.hp.
 */
export function resolveDefend(
  action: CombatAction,
  actor: Combatant,
): TurnResult {
  const healing = Math.floor(actor.stats.maxHp * DEFEND_HEAL_FRACTION);
  actor.stats.hp = Math.min(actor.stats.maxHp, actor.stats.hp + healing);
  return {
    action,
    healing,
    message: `${actor.name} defends and recovers ${healing} HP.`,
    actorHp: actor.stats.hp,
  };
}
