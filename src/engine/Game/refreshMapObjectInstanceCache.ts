/**
 * Build mapObjectId -> instanceName cache (used to heal stale npcState rows).
 */
export function refreshMapObjectInstanceCache(
  cache: Map<string, string>,
  objs: Array<{ _id: string; instanceName?: string | null }>,
): void {
  cache.clear();
  for (const o of objs) {
    if (typeof o.instanceName === "string" && o.instanceName.length > 0) {
      cache.set(String(o._id), o.instanceName);
    }
  }
}
