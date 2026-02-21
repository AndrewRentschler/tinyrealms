import type { Stats } from "../../mechanics/StatBlock.ts";

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

export interface CombatOverResult {
  over: boolean;
  winner?: "player" | "enemy";
}
