export { CombatEngine } from "./CombatEngine.ts";
export { resolveTurn } from "./resolveTurn.ts";
export { isCombatOver } from "./isCombatOver.ts";
export { DEFEND_HEAL_FRACTION, FLEE_SUCCESS_CHANCE } from "../../config/combat-config.ts";
export type {
  Combatant,
  CombatAction,
  TurnResult,
  CombatOverResult,
} from "./types.ts";
