/**
 * Admin: lightweight inspection queries for CLI.
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAdminKey } from "../lib/requireAdminKey";

/** Lightweight NPC list for CLI */
export const listNpcs = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const allDefs = await ctx.db.query("spriteDefinitions").collect();
    const npcDefNames = new Set(
      allDefs.filter((d) => d.category === "npc").map((d) => d.name)
    );
    const allObjects = await ctx.db.query("mapObjects").collect();
    const npcObjects = allObjects.filter((o) => npcDefNames.has(o.spriteDefName));
    const profiles = await ctx.db.query("npcProfiles").collect();
    const profilesByName = new Map(profiles.map((p) => [p.name, p]));
    const users = await ctx.db.query("users").collect();
    const emailById = new Map<string, string>();
    for (const u of users) {
      emailById.set(String(u._id), (u as { email?: string }).email ?? "(no-email)");
    }
    const maps = await ctx.db.query("maps").collect();
    const mapCreatorById = new Map<string, string>();
    for (const m of maps) {
      const creator = m.createdBy
        ? (emailById.get(String(m.createdBy)) ?? "(unknown)")
        : "(none)";
      mapCreatorById.set(m.name, creator);
    }
    return npcObjects.map((obj) => {
      const profile = obj.instanceName
        ? profilesByName.get(obj.instanceName) ?? null
        : null;
      return {
        name: (profile as { displayName?: string } | null)?.displayName ?? obj.instanceName ?? obj.spriteDefName,
        instanceName: obj.instanceName ?? "(unnamed)",
        spriteDefName: obj.spriteDefName,
        mapName: obj.mapName,
        mapCreator: mapCreatorById.get(obj.mapName) ?? "(unknown)",
      };
    });
  },
});
