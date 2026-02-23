export type DayPhase = "dawn" | "day" | "dusk" | "night";

/**
 * Normalize any hour value into [0, 24).
 * Examples:
 * - normalizeHour(24) -> 0
 * - normalizeHour(-1) -> 23
 */
export function normalizeHour(hour: number): number {
  if (!Number.isFinite(hour)) return 0;
  const wrapped = hour % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

/**
 * Map a normalized hour to a coarse world phase.
 * - dawn: [5, 7)
 * - day: [7, 18)
 * - dusk: [18, 20)
 * - night: [20, 24) and [0, 5)
 */
export function getDayPhase(hour: number): DayPhase {
  const normalized = normalizeHour(hour);

  if (normalized >= 5 && normalized < 7) return "dawn";
  if (normalized >= 7 && normalized < 18) return "day";
  if (normalized >= 18 && normalized < 20) return "dusk";
  return "night";
}
