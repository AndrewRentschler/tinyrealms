import { calculateDamage, type Stats } from "./StatBlock.ts";

/**
 * Turn-based combat engine. Pure functions for resolution.
 * Can run on both client (preview) and server (authoritative).
 */

export interface Combatant {
  id: string;
  name: string;
  stats: Stats;
  isPlayer: boolean;
}

export interface CombatAction {
  type: "attack" | "defend" | "item" | "flee";
  actorId: string;
  targetId?: string;
  itemId?: string;
}

export interface TurnResult {
  action: CombatAction;
  damage?: number;
  healing?: number;
  message: string;
  actorHp: number;
  targetHp?: number;
}

/** Resolve a single combat turn */
export function resolveTurn(
  action: CombatAction,
  combatants: Map<string, Combatant>
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

    case "defend": {
      // Temporary defense boost (simplified: heal 10% of max)
      const healing = Math.floor(actor.stats.maxHp * 0.1);
      actor.stats.hp = Math.min(actor.stats.maxHp, actor.stats.hp + healing);
      return {
        action,
        healing,
        message: `${actor.name} defends and recovers ${healing} HP.`,
        actorHp: actor.stats.hp,
      };
    }

    case "flee": {
      const success = Math.random() < 0.5;
      return {
        action,
        message: success
          ? `${actor.name} fled successfully!`
          : `${actor.name} failed to flee!`,
        actorHp: actor.stats.hp,
      };
    }

    case "item": {
      return {
        action,
        message: `${actor.name} uses an item.`,
        actorHp: actor.stats.hp,
      };
    }

    default:
      return { action, message: "Unknown action", actorHp: actor.stats.hp };
  }
}

/** Check if combat is over */
export function isCombatOver(combatants: Map<string, Combatant>): {
  over: boolean;
  winner?: "player" | "enemy";
} {
  const players = Array.from(combatants.values()).filter((c) => c.isPlayer);
  const enemies = Array.from(combatants.values()).filter((c) => !c.isPlayer);

  const allPlayersDead = players.every((p) => p.stats.hp <= 0);
  const allEnemiesDead = enemies.every((e) => e.stats.hp <= 0);

  if (allPlayersDead) return { over: true, winner: "enemy" };
  if (allEnemiesDead) return { over: true, winner: "player" };
  return { over: false };
}
