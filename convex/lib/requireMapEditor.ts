import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { isSuperuserProfile } from "./profileRole.ts";

/**
 * Verify that the given profileId is allowed to edit the given map.
 * Access is granted if:
 *   1. The profile has the "superuser" role, OR
 *   2. The profile's user created the map (map.createdBy === profile.userId), OR
 *   3. The profile is in the map's `editors` list
 *
 * Throws if the profile doesn't exist or lacks permissions.
 */
export async function requireMapEditor(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  mapName: string,
): Promise<void> {
  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Profile not found");

  // Superusers can edit any map
  if (isSuperuserProfile(profile)) return;

  // Look up the map
  const map = await ctx.db
    .query("maps")
    .withIndex("by_name", (q) => q.eq("name", mapName))
    .first();

  // If the map doesn't exist yet, any authenticated user can create it
  if (!map) return;

  // Check if user created this map
  if (map.createdBy && profile.userId && map.createdBy === profile.userId) return;

  // Legacy: check if profile is the map creator (for old maps without createdBy)
  if (map.creatorProfileId && map.creatorProfileId === profileId) return;

  // Check if profile is in the editors list
  if (map.editors && map.editors.includes(profileId)) return;

  throw new Error("Permission denied: you are not an editor of this map");
}

/**
 * Check if a user owns a map (is the creator or superuser).
 * Returns true/false without throwing.
 */
export async function isMapOwner(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  mapName: string,
): Promise<boolean> {
  const profile = await ctx.db.get(profileId);
  if (!profile) return false;

  if (isSuperuserProfile(profile)) return true;

  const map = await ctx.db
    .query("maps")
    .withIndex("by_name", (q) => q.eq("name", mapName))
    .first();
  if (!map) return false;

  if (map.createdBy && profile.userId && map.createdBy === profile.userId) return true;
  if (map.creatorProfileId && map.creatorProfileId === profileId) return true;

  return false;
}
