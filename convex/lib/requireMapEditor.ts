import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Verify that the given profileId is allowed to edit the given map.
 * Access is granted if:
 *   1. The profile has the global "admin" role, OR
 *   2. The profile is in the map's `editors` list, OR
 *   3. The profile is the map's creator
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

  // Global admins can edit any map
  if ((profile as any).role === "admin") return;

  // Look up the map
  const map = await ctx.db
    .query("maps")
    .withIndex("by_name", (q) => q.eq("name", mapName))
    .first();

  if (!map) throw new Error(`Map "${mapName}" not found`);

  // Check if profile is the map creator
  if (map.creatorProfileId && map.creatorProfileId === profileId) return;

  // Check if profile is in the editors list
  if (map.editors && map.editors.includes(profileId)) return;

  throw new Error("Permission denied: you are not an editor of this map");
}
