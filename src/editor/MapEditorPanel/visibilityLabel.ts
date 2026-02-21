import type { VisibilityType } from "../../types/visibility.ts";

/**
 * Helper to normalize visibility type for display.
 */
export function visibilityLabel(v?: VisibilityType): VisibilityType {
  return (v ?? "system") as VisibilityType;
}
