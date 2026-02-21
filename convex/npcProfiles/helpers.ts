/**
 * NPC profile helpers: visibility, read checks, slugify.
 */
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getVisibilityType } from "../lib/visibility.ts";

export function canReadNpcProfile(
  profile: { visibilityType?: string; createdByUser?: Id<"users"> },
  userId: Id<"users"> | null
): boolean {
  const visibility = getVisibilityType(profile);
  if (visibility === "system" || visibility === "public") return true;
  if (!userId) return false;
  return profile.createdByUser === userId;
}

export async function isSuperuserUser(ctx: QueryCtx, userId: Id<"users"> | null): Promise<boolean> {
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
