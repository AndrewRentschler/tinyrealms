/**
 * Turn-based combat engine. Holds combatants and delegates resolution to extracted modules.
 * Can run on both client (preview) and server (authoritative).
 */
import type { Combatant, CombatAction, TurnResult, CombatOverResult } from "./types.ts";
import { resolveTurn as resolveTurnFn } from "./resolveTurn.ts";
import { isCombatOver as isCombatOverFn } from "./isCombatOver.ts";

export class CombatEngine {
  private combatants = new Map<string, Combatant>();

  /** Get all combatants */
  getCombatants(): Map<string, Combatant> {
    return this.combatants;
  }

  /** Set combatants (replaces existing) */
  setCombatants(combatants: Map<string, Combatant>): void {
    this.combatants = combatants;
  }

  /** Add or update a combatant */
  setCombatant(id: string, combatant: Combatant): void {
    this.combatants.set(id, combatant);
  }

  /** Remove a combatant */
  removeCombatant(id: string): void {
    this.combatants.delete(id);
  }

  /** Clear all combatants */
  clear(): void {
    this.combatants.clear();
  }

  /** Resolve a single combat turn */
  resolveTurn(action: CombatAction): TurnResult {
    return resolveTurnFn(action, this.combatants);
  }

  /** Check if combat is over */
  isCombatOver(): CombatOverResult {
    return isCombatOverFn(this.combatants);
  }
}
