import {
  GLOW_COLOR,
  PROMPT_FILL_COLOR,
  PROMPT_STROKE_COLOR,
} from "../../constants/colors.ts";
import { INTERACT_PROMPT_PREFIX } from "../../constants/keybindings.ts";

/** Pixels — range for doors & toggleables */
export const OBJ_INTERACT_RADIUS = 88;

export const OBJ_INTERACT_RADIUS_SQ = OBJ_INTERACT_RADIUS * OBJ_INTERACT_RADIUS;

/** Fraction inset on each edge for door collision bounds (slightly smaller than visual) */
export const DOOR_COLLISION_INSET = 0.2;
/** Door animation frame indices: first frame, last = totalFrames - DOOR_FRAME_LAST_OFFSET */
export const DOOR_FRAME_FIRST = 0;
export const DOOR_FRAME_LAST_OFFSET = 1;

/** Pixel boundary offset for tile exclusion in door collision (right/bottom edge) */
export const DOOR_COLLISION_TILE_BOUNDARY_OFFSET = 1;

/** Sprite anchor: center X, bottom Y — shared by placed objects and ghost preview */
export const SPRITE_ANCHOR_X = 0.5;
export const SPRITE_ANCHOR_Y = 1.0;

/** Default tile size (px) — overridden by Game from map data */
export const DEFAULT_TILE_WIDTH = 16;
export const DEFAULT_TILE_HEIGHT = 16;

/** Container labels for debugging / hierarchy */
export const CONTAINER_LABEL_BG = "objects-bg";
export const CONTAINER_LABEL_OBJ = "objects";
export const CONTAINER_LABEL_OVERLAY = "objects-overlay";

/** Container z-index ordering */
export const BG_CONTAINER_Z_INDEX = 4;
export const OBJ_CONTAINER_Z_INDEX = 50;
export const OVERLAY_CONTAINER_Z_INDEX = 55;
export const GHOST_Z_INDEX = 99999;

/** Layer index: 0-1 bg, 2-3 obj, 4 overlay */
export const DEFAULT_LAYER_INDEX = 2;
export const LAYER_BG_THRESHOLD = 1;
export const LAYER_OVERLAY_THRESHOLD = 4;

/** Glow circle for interactable objects */
export const GLOW_RADIUS = 18;
export { GLOW_COLOR };
export const GLOW_ALPHA = 0.3;
export const GLOW_BASE_ALPHA = 0.2;
export const GLOW_PULSE_AMPLITUDE = 0.15;
export const GLOW_PULSE_FREQUENCY = 3;

/** Prompt text above interactables */
export const PROMPT_FONT_SIZE = 9;
export { PROMPT_FILL_COLOR, PROMPT_STROKE_COLOR };
export const PROMPT_STROKE_WIDTH = 2;
export const PROMPT_Y_OFFSET = 8;
export const PROMPT_FONT_FAMILY = "Inter, sans-serif";

/** Prompt text for interactables */
export const PROMPT_OPEN = `${INTERACT_PROMPT_PREFIX}Open`;
export const PROMPT_CLOSE = `${INTERACT_PROMPT_PREFIX}Close`;
export const PROMPT_TURN_ON = `${INTERACT_PROMPT_PREFIX}Turn On`;
export const PROMPT_TURN_OFF = `${INTERACT_PROMPT_PREFIX}Turn Off`;
export const PROMPT_STORAGE = `${INTERACT_PROMPT_PREFIX}Open`;

/** Pixels — range for storage interaction */
export const STORAGE_INTERACT_RADIUS = 48;
export const STORAGE_INTERACT_RADIUS_SQ = STORAGE_INTERACT_RADIUS * STORAGE_INTERACT_RADIUS;

/** Prompt anchor (0.5 = center x, 1 = bottom y) */
export const PROMPT_ANCHOR_X = 0.5;
export const PROMPT_ANCHOR_Y = 1;

/** Animation frame index for stopped state */
export const ANIMATION_FIRST_FRAME = 0;

/** Glow circle position: x offset (center), y uses half sprite height */
export const GLOW_CENTER_X = 0;
export const GLOW_Y_HALF_HEIGHT_FACTOR = 0.5;

/** Audio volumes */
export const SOUND_ONE_SHOT_VOLUME = 0.7;
export const AMBIENT_INITIAL_VOLUME = 0;

/** Default ambient sound fallbacks */
export const DEFAULT_AMBIENT_RADIUS = 200;
export const DEFAULT_AMBIENT_VOLUME = 0.5;

/** Ghost preview sprite */
export const GHOST_ALPHA = 0.45;
