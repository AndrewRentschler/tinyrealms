/**
 * Central keybinding constants for the game.
 * Used for input detection and prompt display (e.g. "[E] Pick up").
 */

// ---------------------------------------------------------------------------
// Interact key (pick up, talk, toggle objects)
// ---------------------------------------------------------------------------

/** Key for interact — lowercase for input detection. */
export const INTERACT_KEY = "e";

/** Key for interact — uppercase (e.g. Shift+E). Both e and E are accepted. */
export const INTERACT_KEY_ALT = "E";

/** Display form of interact key for prompts (e.g. "[E] Pick up"). */
export const INTERACT_KEY_DISPLAY = "E";

/** Prompt prefix for interact actions: "[E] ". */
export const INTERACT_PROMPT_PREFIX = `[${INTERACT_KEY_DISPLAY}] `;

// ---------------------------------------------------------------------------
// Combat keys
// ---------------------------------------------------------------------------

/** Primary attack key. */
export const COMBAT_ATTACK_KEY = "x";

/** Alternate attack key (spacebar). */
export const COMBAT_ATTACK_KEY_ALT = " ";

// ---------------------------------------------------------------------------
// UI keys
// ---------------------------------------------------------------------------

/** Mute/unmute audio. */
export const MUTE_KEY = "m";

/** Mute key uppercase (Shift+M). */
export const MUTE_KEY_ALT = "M";

// ---------------------------------------------------------------------------
// Map editor keys
// ---------------------------------------------------------------------------

/** Cancel move in build mode (object/move, npc-move). */
export const EDITOR_CANCEL_MOVE_KEY = "Escape";

/** Toggle grid in build mode (lowercase for input detection). */
export const EDITOR_GRID_TOGGLE_KEY = "g";

/** Alternate grid toggle key (uppercase, Shift+G). */
export const EDITOR_GRID_TOGGLE_KEY_ALT = "G";
