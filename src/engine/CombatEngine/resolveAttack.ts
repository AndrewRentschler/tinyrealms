import { calculateDamage } from "../../mechanics/StatBlock.ts";
import type { CombatAction, Combatant, TurnResult } from "./types.ts";

/**
 * Resolve an attack action. Mutates target.stats.hp.
 */
export function resolveAttack(
  action: CombatAction,
  actor: Combatant,
  target: Combatant | undefined,
): TurnResult {
  if (!target) {
    return {
      action,
      message: `${actor.name} attacks nothing!`,
      actorHp: actor.stats.hp,
    };
  }
  const damage = calculateDamage(actor.stats.atk, target.stats.def);
  target.stats.hp = Math.max(0, target.stats.hp - damage);
  return {
    action,
    damage,
    message: `${actor.name} attacks ${target.name} for ${damage} damage!`,
    actorHp: actor.stats.hp,
    targetHp: target.stats.hp,
  };
}
