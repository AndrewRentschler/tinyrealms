import type { Combatant, CombatOverResult } from "./types.ts";

/**
 * Check if combat is over (all players or all enemies dead).
 */
export function isCombatOver(
  combatants: Map<string, Combatant>,
): CombatOverResult {
  const players = Array.from(combatants.values()).filter((c) => c.isPlayer);
  const enemies = Array.from(combatants.values()).filter((c) => !c.isPlayer);

  const allPlayersDead = players.every((p) => p.stats.hp <= 0);
  const allEnemiesDead = enemies.every((e) => e.stats.hp <= 0);

  if (allPlayersDead) return { over: true, winner: "enemy" };
  if (allEnemiesDead) return { over: true, winner: "player" };
  return { over: false };
}
