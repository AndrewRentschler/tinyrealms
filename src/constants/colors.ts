/**
 * Central color constants for the game.
 * PixiJS uses hex numbers (0xRRGGBB); DOM/CSS uses hex strings (#RRGGBB).
 */

// ---------------------------------------------------------------------------
// Base (PixiJS hex 0xRRGGBB)
// ---------------------------------------------------------------------------

export const WHITE = 0xffffff;
export const BLACK = 0x000000;

// ---------------------------------------------------------------------------
// Game & UI
// ---------------------------------------------------------------------------

/** PixiJS app background. */
export const GAME_BACKGROUND = 0x0a0a12;

/** NPC name label and fallback square. */
export const NPC_GOLD = 0xffd700;

/** ObjectLayer glow for interactables. */
export const GLOW_COLOR = 0xffcc44;

/** Respawn label, legendary rarity. */
export const ORANGE_AMBER = 0xffaa00;

// ---------------------------------------------------------------------------
// Prompts & labels
// ---------------------------------------------------------------------------

export const PROMPT_FILL_COLOR = WHITE;
export const PROMPT_STROKE_COLOR = BLACK;
export const LABEL_TEXT_FILL = WHITE;
export const LABEL_TEXT_STROKE = BLACK;
export const LABEL_FONT_FILL = WHITE;
export const LABEL_FONT_STROKE = BLACK;

// ---------------------------------------------------------------------------
// Entity layer
// ---------------------------------------------------------------------------

/** Local player name label. */
export const PLAYER_LABEL_FILL = 0xe8e8f0;

/** Player fallback placeholder (purple). */
export const FALLBACK_FILL = 0x6c5ce7;

/** Remote player fallback (light purple). */
export const REMOTE_FALLBACK_FILL = 0xa29bfe;

// ---------------------------------------------------------------------------
// Map editor / overlays
// ---------------------------------------------------------------------------

/** Collision overlay. */
export const COLLISION_COLOR = 0xff2222;

/** Portal ghost. */
export const PORTAL_GHOST_COLOR = 0x00ff88;

/** Portal zone rect. */
export const PORTAL_ZONE_COLOR = 0x00ccff;

/** Label zone rect. */
export const LABEL_ZONE_COLOR = 0xffcc00;

/** Erase cursor. */
export const ERASE_CURSOR_COLOR = 0xff4444;

/** Grid lines. */
export const GRID_STROKE_COLOR = WHITE;

// ---------------------------------------------------------------------------
// Item rarity (PixiJS hex)
// ---------------------------------------------------------------------------

export const RARITY_COMMON = WHITE;
export const RARITY_UNCOMMON = 0x44ff44;
export const RARITY_RARE = 0x4488ff;
export const RARITY_EPIC = 0xbb44ff;
export const RARITY_LEGENDARY = ORANGE_AMBER;

/** Respawn label fill. */
export const RESPAWN_LABEL_COLOR = ORANGE_AMBER;

/** Fallback visual stroke. */
export const FALLBACK_STROKE_COLOR = BLACK;
export const RARITY_UNIQUE = 0xff4444;

/** Rarity → glow colour (hex). */
export const RARITY_COLORS: Record<string, number> = {
  common: RARITY_COMMON,
  uncommon: RARITY_UNCOMMON,
  rare: RARITY_RARE,
  epic: RARITY_EPIC,
  legendary: RARITY_LEGENDARY,
  unique: RARITY_UNIQUE,
};

// ---------------------------------------------------------------------------
// Combat & pickup notifications (CSS hex #RRGGBB)
// ---------------------------------------------------------------------------

/** Default combat notification (red). */
export const COMBAT_DEFAULT = "#ff6666";

/** Combat warning / attack failed. */
export const COMBAT_WARNING = "#ffcc66";

/** Combat: you hit target. */
export const COMBAT_HIT = "#ff6666";

/** Combat: target hits you. */
export const COMBAT_TOOK_DAMAGE = "#ff9b66";

/** Combat: aggro attack notification. */
export const COMBAT_AGGRO = "#ff9966";

/** Combat: target defeated. */
export const COMBAT_DEFEATED = "#66ff99";

/** Combat: HP display. */
export const COMBAT_HP = "#ffb3b3";

/** Combat: loot dropped. */
export const COMBAT_LOOT = "#99e6ff";

/** Pickup notification. */
export const PICKUP_NOTIFICATION = "#44ff88";

/** Fade overlay background. */
export const FADE_OVERLAY = "#000";

// ---------------------------------------------------------------------------
// Map editor (CSS/DOM hex strings)
// ---------------------------------------------------------------------------

/** Form input background. */
export const EDITOR_FORM_INPUT_BG = "#181825";

/** Form input text. */
export const EDITOR_FORM_INPUT_TEXT = "#eee";

/** Form input border. */
export const EDITOR_FORM_INPUT_BORDER = "#444";

/** Info panel background. */
export const EDITOR_INFO_PANEL_BG = "#1a1a2e";

/** Info panel border. */
export const EDITOR_INFO_PANEL_BORDER = "#333";

/** Muted text (primary). */
export const EDITOR_MUTED_TEXT = "#aaa";

/** Muted text (secondary). */
export const EDITOR_MUTED_TEXT_SECONDARY = "#888";

/** Selected portal highlight. */
export const EDITOR_SELECTED_PORTAL_HIGHLIGHT = "#7ee7ff";

/** Delete button. */
export const EDITOR_DELETE_BUTTON = "#e74c3c";

/** Success green (save status). */
export const EDITOR_SUCCESS_GREEN = "#88ff88";

/** Error red (save status). */
export const EDITOR_ERROR_RED = "#ff4444";

/** Tileset grid stroke (canvas). */
export const EDITOR_TILESET_GRID_STROKE = "rgba(255,255,255,0.35)";

/** Portal ghost green (help text). */
export const EDITOR_PORTAL_GHOST_GREEN = "#00ff88";

/** Label help yellow. */
export const EDITOR_LABEL_HELP_YELLOW = "#ffcc00";
