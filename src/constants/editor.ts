/**
 * Map editor–specific constants.
 * Used by MapEditorPanel for panel sizing, hit tests, and radii.
 */

// ---------------------------------------------------------------------------
// Panel resize
// ---------------------------------------------------------------------------

/** Minimum editor panel height (px). */
export const EDITOR_PANEL_RESIZE_MIN = 120;

/** Maximum editor panel height (px). */
export const EDITOR_PANEL_RESIZE_MAX = 600;

// ---------------------------------------------------------------------------
// Item placement / removal
// ---------------------------------------------------------------------------

/** Hit radius for removeItemAt (items bob above anchor). */
export const EDITOR_ITEM_REMOVE_RADIUS = 64;

/** Hit radius for inspectItemAt. */
export const EDITOR_ITEM_INSPECT_RADIUS = 40;

// ---------------------------------------------------------------------------
// NPC find radius
// ---------------------------------------------------------------------------

/** Radius for findNearestNPCAt when moving/removing NPCs. */
export const EDITOR_NPC_FIND_RADIUS = 320;

// ---------------------------------------------------------------------------
// Default respawn
// ---------------------------------------------------------------------------

/** Default respawn time in minutes. */
export const EDITOR_DEFAULT_RESPAWN_MIN = 5;

/** Default respawn time in ms (5 min). */
export const EDITOR_DEFAULT_RESPAWN_MS =
  EDITOR_DEFAULT_RESPAWN_MIN * 60 * 1000;

// ---------------------------------------------------------------------------
// Object/NPC hit test (fallback when no sprite def)
// ---------------------------------------------------------------------------

/** Hit test: pixels above anchor. */
export const EDITOR_HIT_TEST_ABOVE = 384;

/** Hit test: half-width (pixels to each side). */
export const EDITOR_HIT_TEST_SIDE = 192;

/** Hit test: pixels below anchor. */
export const EDITOR_HIT_TEST_BELOW = 16;
