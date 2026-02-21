import type { CombatAction, Combatant, TurnResult } from "./types.ts";
import { resolveAttack } from "./resolveAttack.ts";
import { resolveDefend } from "./resolveDefend.ts";
import { resolveFlee } from "./resolveFlee.ts";
import { resolveItem } from "./resolveItem.ts";

/**
 * Resolve a single combat turn. Delegates to action-specific resolvers.
 */
export function resolveTurn(
  action: CombatAction,
  combatants: Map<string, Combatant>,
): TurnResult {
  const actor = combatants.get(action.actorId);
  if (!actor) {
    return { action, message: "Unknown actor", actorHp: 0 };
  }

  switch (action.type) {
    case "attack": {
      const target = action.targetId
        ? combatants.get(action.targetId)
        : undefined;
      return resolveAttack(action, actor, target);
    }
    case "defend":
      return resolveDefend(action, actor);
    case "flee":
      return resolveFlee(action, actor);
    case "item":
      return resolveItem(action, actor);
    default: {
      const _exhaustive: never = action.type;
      return { action, message: "Unknown action", actorHp: actor.stats.hp };
    }
  }
}
