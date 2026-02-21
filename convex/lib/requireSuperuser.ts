import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { isSuperuserProfile } from "./profileRole.ts";

/**
 * Verify that the given profileId belongs to a superuser.
 * Throws if the profile doesn't exist or isn't a superuser.
 */
export async function requireSuperuser(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
): Promise<void> {
  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Profile not found");
  if (!isSuperuserProfile(profile)) {
    throw new Error("Permission denied: superuser role required");
  }
}
