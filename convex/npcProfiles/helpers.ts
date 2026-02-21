/**
 * NPC profile helpers: visibility, read checks, slugify.
 */
import type { QueryCtx } from "../_generated/server";

export function getVisibilityType(profile: { visibilityType?: string }): "public" | "private" | "system" {
  return (profile.visibilityType ?? "system") as "public" | "private" | "system";
}

export function canReadNpcProfile(
  profile: { visibilityType?: string; createdByUser?: string },
  userId: string | null
): boolean {
  const visibility = getVisibilityType(profile);
  if (visibility === "system" || visibility === "public") return true;
  if (!userId) return false;
  return profile.createdByUser === userId;
}

export async function isSuperuserUser(ctx: QueryCtx, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const profiles = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return profiles.some((p) => (p as { role?: string }).role === "superuser");
}

export function slugifyInstanceName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
