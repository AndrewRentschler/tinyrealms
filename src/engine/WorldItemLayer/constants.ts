/**
 * WorldItemLayer — named constants for layout, animation, text, and visuals.
 * Keeps magic numbers and repeated strings in one place.
 */

import {
  FALLBACK_STROKE_COLOR,
  PROMPT_FILL_COLOR,
  PROMPT_STROKE_COLOR,
  RARITY_COLORS,
  RESPAWN_LABEL_COLOR,
} from "../../constants/colors.ts";

// Re-export colors for consumers
export {
  FALLBACK_STROKE_COLOR,
  PROMPT_FILL_COLOR,
  PROMPT_STROKE_COLOR,
  RARITY_COLORS,
  RESPAWN_LABEL_COLOR,
};

// ---------------------------------------------------------------------------
// Interaction / layout
// ---------------------------------------------------------------------------

/** Pixels — range within which the player can interact with a world item (pick up). */
export const ITEM_INTERACT_RADIUS = 48;

/** Squared interact radius for distance checks without sqrt. */
export const ITEM_INTERACT_RADIUS_SQ = ITEM_INTERACT_RADIUS * ITEM_INTERACT_RADIUS;

/** Default radius (px) for findItemAt when inspecting in build mode. */
export const FIND_ITEM_AT_DEFAULT_RADIUS = 24;

/** Vertical offset (px) of the "[E] Pick up" prompt above the item (added to item height). */
export const PROMPT_OFFSET_ABOVE_ITEM = 6;

/** Vertical offset (px) of the "respawning" label below the item center. */
export const RESPAWN_LABEL_OFFSET_Y = 2;

/** zIndex of the world items container (e.g. just below objects layer). */
export const CONTAINER_Z_INDEX = 45;

/** Container label for debugging / hierarchy. */
export const CONTAINER_LABEL = "worldItems";

/** Label used to find the respawn text child in build mode. */
export const RESPAWN_LABEL_NAME = "respawn-label";

/** Default icon height (px) when def has no iconTileH or iconSpriteFrameHeight. */
export const DEFAULT_ICON_HEIGHT = 16;

/** Default animation speed for sprite-def icons when not specified on def. */
export const DEFAULT_ICON_ANIMATION_SPEED = 0.12;

// ---------------------------------------------------------------------------
// Bob animation
// ---------------------------------------------------------------------------

/** Vertical bob amplitude (px). */
export const BOB_AMPLITUDE = 3;

/** Bob animation speed (radians per second). */
export const BOB_SPEED = 2.5;

// ---------------------------------------------------------------------------
// Glow
// ---------------------------------------------------------------------------

/** Glow circle radius (px) around the item. */
export const GLOW_RADIUS = 12;

/** Base alpha of the glow fill when not pulsing. */
export const GLOW_ALPHA = 0.35;

/** Base alpha in the pulse formula: base + amplitude * sin(elapsed * speed). */
export const GLOW_PULSE_BASE_ALPHA = 0.2;

/** Pulse amplitude in the glow alpha formula. */
export const GLOW_PULSE_AMPLITUDE = 0.15;

/** Pulse speed (radians per second) in the glow alpha formula. */
export const GLOW_PULSE_SPEED = 3;

// ---------------------------------------------------------------------------
// Text (prompt and respawn label)
// ---------------------------------------------------------------------------

/** Prompt "[E] Pick up" font size. */
export const PROMPT_FONT_SIZE = 9;

/** Prompt text stroke width. */
export const PROMPT_STROKE_WIDTH = 2;

/** Prompt and respawn label font family. */
export const FONT_FAMILY = "Inter, sans-serif";

/** Respawn label font size. */
export const RESPAWN_LABEL_FONT_SIZE = 8;

// ---------------------------------------------------------------------------
// Alpha (picked-up items and ghost)
// ---------------------------------------------------------------------------

/** Alpha of a picked-up item in play mode. */
export const PICKED_UP_ALPHA_PLAY_MODE = 0.3;

/** Alpha of a picked-up item in build mode. */
export const PICKED_UP_ALPHA_BUILD_MODE = 0.6;

/** Alpha of the ghost preview sprite. */
export const GHOST_ALPHA = 0.45;

// ---------------------------------------------------------------------------
// Fallback visual (when no tileset/sprite icon)
// ---------------------------------------------------------------------------

/** Fallback roundRect x (center-aligned). */
export const FALLBACK_RECT_X = -8;

/** Fallback roundRect y (above anchor). */
export const FALLBACK_RECT_Y = -20;

/** Fallback roundRect width. */
export const FALLBACK_RECT_WIDTH = 16;

/** Fallback roundRect height. */
export const FALLBACK_RECT_HEIGHT = 16;

/** Fallback roundRect corner radius. */
export const FALLBACK_RECT_RADIUS = 3;

/** Fallback fill alpha. */
export const FALLBACK_FILL_ALPHA = 0.9;

/** Fallback stroke width. */
export const FALLBACK_STROKE_WIDTH = 1;

// ---------------------------------------------------------------------------
// Ghost preview
// ---------------------------------------------------------------------------

/** zIndex of the ghost preview so it draws on top. */
export const GHOST_Z_INDEX = 99999;

// ---------------------------------------------------------------------------
// Type lookups (shared data)
// ---------------------------------------------------------------------------

/** Type → fallback emoji for items without tileset icons. */
export const TYPE_EMOJI: Record<string, string> = {
  weapon: "⚔️",
  armor: "🛡",
  accessory: "💍",
  consumable: "🧪",
  material: "🪵",
  key: "🔑",
  currency: "🪙",
  quest: "📜",
  misc: "📦",
};
