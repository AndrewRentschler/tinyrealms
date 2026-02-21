/**
 * Centralized visibility type union and helpers.
 * Single source-of-truth for "public" | "private" | "system" in Convex.
 */
import { v } from "convex/values";

export const VISIBILITY_TYPES = ["public", "private", "system"] as const;
export type VisibilityType = (typeof VISIBILITY_TYPES)[number];

export const visibilityTypeValidator = v.union(
  v.literal("public"),
  v.literal("private"),
  v.literal("system")
);

export const DEFAULT_VISIBILITY_TYPE: VisibilityType = "system";
export const DEFAULT_MAP_TYPE: VisibilityType = "private";

export function getVisibilityType(doc: { visibilityType?: string }): VisibilityType {
  const raw = doc.visibilityType ?? DEFAULT_VISIBILITY_TYPE;
  return isValidVisibilityType(raw) ? raw : DEFAULT_VISIBILITY_TYPE;
}

export function getMapType(map: { mapType?: string }): VisibilityType {
  const raw = map.mapType ?? DEFAULT_MAP_TYPE;
  return isValidVisibilityType(raw) ? raw : DEFAULT_MAP_TYPE;
}

export function isValidVisibilityType(s: string): s is VisibilityType {
  return (VISIBILITY_TYPES as readonly string[]).includes(s);
}
