import type { CombatAction, Combatant, TurnResult } from "./types.ts";

/**
 * Resolve an item action. Placeholder — item logic not yet implemented.
 */
export function resolveItem(
  action: CombatAction,
  actor: Combatant,
): TurnResult {
  return {
    action,
    message: `${actor.name} uses an item.`,
    actorHp: actor.stats.hp,
  };
}
