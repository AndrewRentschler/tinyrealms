/**
 * Combat constants and shared helpers.
 */
import type { Doc } from "../../_generated/dataModel";

export const DEFAULT_ATTACK_RANGE_PX = 64;
export const DEFAULT_PLAYER_ATTACK_COOLDOWN_MS = 350;
export const DEFAULT_NPC_RESPAWN_MS = 15_000;
export const DEFAULT_NPC_HIT_COOLDOWN_MS = 550;
export const DEFAULT_DAMAGE_VARIANCE_PCT = 20;
export const DEFAULT_AGGRO_MEMORY_MS = 15_000;
export const DEFAULT_FLEE_DISTANCE_PX = 140;
export const HIGH_AGGRESSION = "high";
export const MEDIUM_AGGRESSION = "medium";
export const LOW_AGGRESSION = "low";
export const ENEMY_TAG = "hostile";

const COMBAT_DEBUG = false;

export function combatLog(...args: unknown[]) {
  if (COMBAT_DEBUG) console.log(...args);
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function resolveAggression(profile: Doc<"npcProfiles"> | undefined): "high" | "medium" | "low" {
  const raw = (profile as { aggression?: string })?.aggression;
  if (raw === HIGH_AGGRESSION || raw === LOW_AGGRESSION || raw === MEDIUM_AGGRESSION) return raw;
  return MEDIUM_AGGRESSION;
}
