// Combat configuration constants
export {
  COMBAT_ATTACK_KEY,
  COMBAT_ATTACK_KEY_ALT,
} from "../constants/keybindings.ts";
export const COMBAT_AGGRO_TICK_INTERVAL_MS = 1000;
export const COMBAT_ATTACK_RANGE_PX = 60;
export const COMBAT_ATTACK_RANGE_MIN_PX = 20;
export const COMBAT_ATTACK_RANGE_MAX_PX = 150;
export const COMBAT_CLIENT_MIN_INPUT_COOLDOWN_MS = 100;
export const COMBAT_NOTIFICATION_ANIMATION_SECONDS = 0.5;
export const COMBAT_NOTIFICATION_DURATION_MS = 1500;
export const COMBAT_NOTIFICATION_STACK_SPACING_PX = 24;
export const COMBAT_NOTIFICATION_TOP_PX = 100;
export const COMBAT_NPC_HIT_COOLDOWN_MS = 1000;
export const COMBAT_NPC_HIT_COOLDOWN_MIN_MS = 200;
export const COMBAT_NPC_HIT_COOLDOWN_MAX_MS = 3000;
export const COMBAT_PLAYER_ATTACK_COOLDOWN_MS = 500;
export const COMBAT_PLAYER_ATTACK_COOLDOWN_MIN_MS = 100;
export const COMBAT_PLAYER_ATTACK_COOLDOWN_MAX_MS = 2000;
export const COMBAT_DAMAGE_VARIANCE_PCT = 10;
export const COMBAT_DAMAGE_VARIANCE_MIN_PCT = 0;
export const COMBAT_DAMAGE_VARIANCE_MAX_PCT = 50;
export const COMBAT_DEBUG = false;

/** Defend action: heal this fraction of max HP */
export const DEFEND_HEAL_FRACTION = 0.1;

/** Flee action: success probability (0–1) */
export const FLEE_SUCCESS_CHANCE = 0.5;

// Hit feedback effects
export const HIT_SHAKE_DURATION_MS = 150;
export const HIT_SHAKE_MAGNITUDE_PX = 3;
export const HIT_FLASH_DURATION_MS = 100;
