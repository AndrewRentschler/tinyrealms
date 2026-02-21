/** Known static JSON maps that should be seeded into Convex if missing */
export const STATIC_MAPS = ["cozy-cabin", "camineet", "mage-city", "palma"] as const;

/** Default map name (display) */
export const DEFAULT_MAP = "Cozy Cabin";

/** Fallback map slug when primary fails */
export const FALLBACK_MAP = "cozy-cabin";

/** Re-export for backward compatibility; prefer config/audio-config.ts */
export { DEFAULT_MUSIC } from "../../config/audio-config.ts";

/** Build mode pan speed (px/s) */
export const BUILD_PAN_SPEED = 300;

/** Off-screen position for build mode (hides world items) */
export const OFFSCREEN_POS = -9999;

/** Presence cleanup: consider stale after this many ms */
export const PRESENCE_STALE_THRESHOLD_MS = 5000;
