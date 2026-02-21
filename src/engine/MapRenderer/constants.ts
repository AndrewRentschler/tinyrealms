import {
  COLLISION_COLOR,
  ERASE_CURSOR_COLOR,
  GRID_STROKE_COLOR,
  LABEL_FONT_FILL,
  LABEL_FONT_STROKE,
  LABEL_TEXT_FILL,
  LABEL_TEXT_STROKE,
  LABEL_ZONE_COLOR,
  PORTAL_GHOST_COLOR,
  PORTAL_ZONE_COLOR,
} from "../../constants/colors.ts";

// ---------------------------------------------------------------------------
// Z-indices (container ordering)
// ---------------------------------------------------------------------------
/** Above entities (50) so characters walk "under" overlay tiles */
export const OVERLAY_LAYER_Z_INDEX = 60;
/** Portal zone overlay */
export const PORTAL_OVERLAY_Z_INDEX = 150;
/** Label zone overlay */
export const LABEL_OVERLAY_Z_INDEX = 149;
/** Below portal/label overlays */
export const COLLISION_OVERLAY_Z_INDEX = 148;
/** Portal ghost, label ghost (editor preview) */
export const GHOST_Z_INDEX = 160;
/** Tile ghost (paint tool hover preview) */
export const TILE_GHOST_Z_INDEX = 155;
/** Grid overlay lines */
export const GRID_OVERLAY_Z_INDEX = 145;

// ---------------------------------------------------------------------------
// Colors (re-exported from central colors)
// ---------------------------------------------------------------------------
export {
  COLLISION_COLOR,
  ERASE_CURSOR_COLOR,
  GRID_STROKE_COLOR,
  LABEL_FONT_FILL,
  LABEL_FONT_STROKE,
  LABEL_TEXT_FILL,
  LABEL_TEXT_STROKE,
  LABEL_ZONE_COLOR,
  PORTAL_GHOST_COLOR,
  PORTAL_ZONE_COLOR,
};

// ---------------------------------------------------------------------------
// Alphas (opacity 0–1)
// ---------------------------------------------------------------------------
/** Collision overlay fill */
export const COLLISION_FILL_ALPHA = 0.25;
/** Portal ghost fill (multi-tile) */
export const PORTAL_GHOST_FILL_ALPHA = 0.3;
/** Portal ghost stroke (multi-tile) */
export const PORTAL_GHOST_STROKE_ALPHA = 0.9;
/** Portal ghost cursor fill (single tile) */
export const PORTAL_GHOST_CURSOR_FILL_ALPHA = 0.25;
/** Portal ghost cursor stroke */
export const PORTAL_GHOST_CURSOR_STROKE_ALPHA = 0.7;
/** Portal zone rect fill */
export const PORTAL_ZONE_FILL_ALPHA = 0.3;
/** Portal zone rect stroke */
export const PORTAL_ZONE_STROKE_ALPHA = 0.8;
/** Label zone rect fill */
export const LABEL_ZONE_FILL_ALPHA = 0.2;
/** Label zone rect stroke */
export const LABEL_ZONE_STROKE_ALPHA = 0.7;
/** Label ghost fill */
export const LABEL_GHOST_FILL_ALPHA = 0.25;
/** Label ghost stroke */
export const LABEL_GHOST_STROKE_ALPHA = 0.9;
/** Label cursor fill */
export const LABEL_CURSOR_FILL_ALPHA = 0.2;
/** Label cursor stroke */
export const LABEL_CURSOR_STROKE_ALPHA = 0.7;
/** Erase cursor fill */
export const ERASE_CURSOR_FILL_ALPHA = 0.15;
/** Erase cursor stroke */
export const ERASE_CURSOR_STROKE_ALPHA = 0.7;
/** Tile ghost container alpha */
export const TILE_GHOST_ALPHA = 0.55;
/** Grid line stroke */
export const GRID_STROKE_ALPHA = 0.15;
/** Highlight layer: active layer opacity */
export const HIGHLIGHT_LAYER_ACTIVE_ALPHA = 1.0;
/** Highlight layer: inactive layer opacity */
export const HIGHLIGHT_LAYER_INACTIVE_ALPHA = 0.25;

// ---------------------------------------------------------------------------
// Font (label/portal text style)
// ---------------------------------------------------------------------------
/** Label and portal text font family */
export const LABEL_FONT_FAMILY = "monospace";
/** Label font size min (px) */
export const LABEL_FONT_SIZE_MIN = 10;
/** Label font size max (px) */
export const LABEL_FONT_SIZE_MAX = 14;
/** Label font size scale factor (fontSize = min(max, tileWidth * factor)) */
export const LABEL_FONT_SIZE_SCALE = 0.6;

// ---------------------------------------------------------------------------
// Stroke widths (px)
// ---------------------------------------------------------------------------
/** Portal ghost, label ghost, erase cursor, label text stroke */
export const STROKE_WIDTH_THICK = 2;
/** Label zone rect stroke */
export const STROKE_WIDTH_MEDIUM = 1.5;
/** Grid line stroke */
export const STROKE_WIDTH_THIN = 1;

// ---------------------------------------------------------------------------
// Aliases for overlays.ts
// ---------------------------------------------------------------------------
export const COLLISION_OVERLAY_COLOR = COLLISION_COLOR;
export const COLLISION_OVERLAY_ALPHA = COLLISION_FILL_ALPHA;
export const PORTAL_OVERLAY_COLOR = PORTAL_ZONE_COLOR;
export const PORTAL_OVERLAY_FILL_ALPHA = PORTAL_ZONE_FILL_ALPHA;
export const PORTAL_OVERLAY_STROKE_ALPHA = PORTAL_ZONE_STROKE_ALPHA;
export const PORTAL_OVERLAY_STROKE_WIDTH = STROKE_WIDTH_THICK;
export const LABEL_OVERLAY_COLOR = LABEL_ZONE_COLOR;
export const LABEL_OVERLAY_FILL_ALPHA = LABEL_ZONE_FILL_ALPHA;
export const LABEL_OVERLAY_STROKE_ALPHA = LABEL_ZONE_STROKE_ALPHA;
export const LABEL_OVERLAY_STROKE_WIDTH = STROKE_WIDTH_MEDIUM;
export const OVERLAY_LABEL_FONT_FAMILY = LABEL_FONT_FAMILY;
export const OVERLAY_LABEL_FILL_COLOR = LABEL_FONT_FILL;
export const OVERLAY_LABEL_STROKE_COLOR = LABEL_FONT_STROKE;
export const OVERLAY_LABEL_STROKE_WIDTH = STROKE_WIDTH_THICK;
export const OVERLAY_LABEL_FONT_SIZE_MIN = LABEL_FONT_SIZE_MIN;
export const OVERLAY_LABEL_FONT_SIZE_MAX = LABEL_FONT_SIZE_MAX;
export const OVERLAY_LABEL_FONT_SIZE_SCALE = LABEL_FONT_SIZE_SCALE;

// ---------------------------------------------------------------------------
// Aliases for ghosts.ts
// ---------------------------------------------------------------------------
export const GHOST_RECT_Z_INDEX = GHOST_Z_INDEX;
export const GHOST_STROKE_WIDTH = STROKE_WIDTH_THICK;
export const LABEL_GHOST_COLOR = LABEL_ZONE_COLOR;
export const LABEL_GHOST_CURSOR_FILL_ALPHA = LABEL_CURSOR_FILL_ALPHA;
export const LABEL_GHOST_CURSOR_STROKE_ALPHA = LABEL_CURSOR_STROKE_ALPHA;
export const TILE_GHOST_RECT_Z_INDEX = TILE_GHOST_Z_INDEX;

// ---------------------------------------------------------------------------
// Aliases for grid.ts
// ---------------------------------------------------------------------------
export const GRID_Z_INDEX = GRID_OVERLAY_Z_INDEX;
export const GRID_COLOR = GRID_STROKE_COLOR;
export const GRID_ALPHA = GRID_STROKE_ALPHA;
export const GRID_STROKE_WIDTH = STROKE_WIDTH_THIN;
