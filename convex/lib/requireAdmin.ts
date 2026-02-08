import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Verify that the given profileId belongs to an admin.
 * Throws if the profile doesn't exist or isn't an admin.
 */
export async function requireAdmin(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
): Promise<void> {
  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Profile not found");
  // Profiles without a role field are treated as non-admin
  if ((profile as any).role !== "admin") {
    throw new Error("Permission denied: admin role required");
  }
}
