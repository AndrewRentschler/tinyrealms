import {
  FALLBACK_FILL,
  PLAYER_LABEL_FILL,
  REMOTE_FALLBACK_FILL,
} from "../../constants/colors.ts";
import type { Direction } from "../types.ts";

// ---------------------------------------------------------------------------
// Collision box
// ---------------------------------------------------------------------------
export const COL_HALF_W = 6;
export const COL_TOP = -12;
export const COL_BOT = 0;

// ---------------------------------------------------------------------------
// Spawn & container
// ---------------------------------------------------------------------------
export const PLAYER_SPAWN_X = 64;
export const PLAYER_SPAWN_Y = 64;
export const ENTITY_CONTAINER_Z_INDEX = 50;

// ---------------------------------------------------------------------------
// Player label
// ---------------------------------------------------------------------------
export const PLAYER_LABEL_FONT_SIZE = 10;
export { PLAYER_LABEL_FILL };
export const PLAYER_LABEL_FONT_FAMILY = "Inter, sans-serif";
export const PLAYER_LABEL_ANCHOR_X = 0.5;
export const PLAYER_LABEL_ANCHOR_Y = 1;

// ---------------------------------------------------------------------------
// Fallback (player placeholder before sprite loads)
// ---------------------------------------------------------------------------
export const FALLBACK_SIZE = 16;
export { FALLBACK_FILL };
export const FALLBACK_LABEL_GAP = 2;

// ---------------------------------------------------------------------------
// Label Y offset below sprite (sprite height + gap)
// ---------------------------------------------------------------------------
export const SPRITE_LABEL_Y_OFFSET = 50;

// ---------------------------------------------------------------------------
// Remote player fallback
// ---------------------------------------------------------------------------
export const REMOTE_FALLBACK_X = -8;
export const REMOTE_FALLBACK_Y = -16;
export const REMOTE_FALLBACK_W = 16;
export const REMOTE_FALLBACK_H = 16;
export { REMOTE_FALLBACK_FILL };

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------
export const AMBIENT_INITIAL_VOLUME = 0;
export const DEFAULT_AMBIENT_RADIUS = 200;
export const DEFAULT_AMBIENT_VOLUME = 0.5;
export const SOUND_ONE_SHOT_VOLUME = 0.7;

// ---------------------------------------------------------------------------
// NPC defaults
// ---------------------------------------------------------------------------
export const DEFAULT_NPC_SPEED = 30;
export const DEFAULT_NPC_WANDER_RADIUS = 60;

// ---------------------------------------------------------------------------
// Sprite frame indices
// ---------------------------------------------------------------------------
export const PLAYER_FRAME_IDLE = 1;
export const REMOTE_FRAME_IDLE = 0;

// ---------------------------------------------------------------------------
// Remote player interpolation
// ---------------------------------------------------------------------------
export const REMOTE_DIR_HOLD_FRAMES_THRESHOLD = 2;
export const REMOTE_INTERP_LERP_THRESHOLD = 0.5;
export const REMOTE_MIN_SNAPSHOTS_FOR_INTERP = 2;

// ---------------------------------------------------------------------------
// Placed NPCs (Convex IDs are long)
// ---------------------------------------------------------------------------
export const PLACED_NPC_ID_MIN_LENGTH = 20;

// ---------------------------------------------------------------------------
// Hit effect
// ---------------------------------------------------------------------------
/** Red tint matrix for hit flash effect (5×4 color matrix) */
export const HIT_FLASH_MATRIX: [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
] = [
  1.6, 0.4, 0.1, 0, 0,
  0.1, 0.3, 0.1, 0, 0,
  0.1, 0.1, 0.3, 0, 0,
  0, 0, 0, 1, 0,
];
export const SHAKE_RANDOM_RANGE = 2;

// ---------------------------------------------------------------------------
// Direction mapping
// ---------------------------------------------------------------------------
export const DIR_ANIM: Record<Direction, string> = {
  down: "row0",
  up: "row1",
  right: "row2",
  left: "row3",
};

const DIR_VALUES: Direction[] = ["up", "down", "left", "right"];

export function parseDirection(s: string): Direction {
  return DIR_VALUES.includes(s as Direction) ? (s as Direction) : "down";
}

export function dirToAnimKey(dir: Direction): string {
  return DIR_ANIM[dir];
}
