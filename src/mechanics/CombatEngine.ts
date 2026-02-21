/**
 * Re-export from engine. CombatEngine moved from mechanics to engine.
 * @deprecated Import from "../engine/CombatEngine.ts" instead.
 */
export {
  CombatEngine,
  resolveTurn,
  isCombatOver,
  DEFEND_HEAL_FRACTION,
  FLEE_SUCCESS_CHANCE,
} from "../engine/CombatEngine.ts";
export type {
  Combatant,
  CombatAction,
  TurnResult,
  CombatOverResult,
} from "../engine/CombatEngine.ts";
