/**
 * NPC aggro attack mutation: resolveAggroAttack.
 */
import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import {
  clamp,
  resolveAggression,
  DEFAULT_ATTACK_RANGE_PX,
  DEFAULT_NPC_HIT_COOLDOWN_MS,
  DEFAULT_DAMAGE_VARIANCE_PCT,
  DEFAULT_AGGRO_MEMORY_MS,
  ENEMY_TAG,
} from "./constants.ts";

export const resolveAggroAttack = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    x: v.float64(),
    y: v.float64(),
  },
  handler: async (ctx, { profileId, mapName, x, y }) => {
    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", mapName))
      .first();
    if (!map?.combatEnabled) return { success: false, reason: "combat_disabled" as const };

    const settings = (map as { combatSettings?: Record<string, number> }).combatSettings ?? {};
    const attackRangePx = clamp(
      Number(settings.attackRangePx ?? DEFAULT_ATTACK_RANGE_PX),
      24,
      256
    );
    const npcHitCooldownMs = clamp(
      Number(settings.npcHitCooldownMs ?? DEFAULT_NPC_HIT_COOLDOWN_MS),
      100,
      2500
    );
    const damageVariancePct = clamp(
      Number(settings.damageVariancePct ?? DEFAULT_DAMAGE_VARIANCE_PCT),
      0,
      100
    );

    const player = await ctx.db.get(profileId);
    if (!player) return { success: false, reason: "missing_player" as const };
    const now = Date.now();

    const npcProfiles = await ctx.db.query("npcProfiles").collect();
    const npcByName = new Map(npcProfiles.map((p) => [p.name, p]));
    const states = await ctx.db
      .query("npcState")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    const mapObjects = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    const mapObjectInstanceNameById = new Map(
      mapObjects.map((o) => [String(o._id), o.instanceName])
    );

    let nearest: Doc<"npcState"> | null = null;
    let nearestProfile: Doc<"npcProfiles"> | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (const s of states) {
      if (s.respawnAt != null && now < s.respawnAt) continue;
      if (s.lastHitAt != null && now - s.lastHitAt < npcHitCooldownMs) continue;

      const instanceName =
        s.instanceName ?? mapObjectInstanceNameById.get(String(s.mapObjectId));
      if (!instanceName) continue;
      const profile = npcByName.get(instanceName);
      if (!profile) continue;
      if (!profile.tags?.includes(ENEMY_TAG)) continue;

      const aggression = resolveAggression(profile);
      const canAggro =
        aggression === "high" ||
        (aggression === "medium" &&
          s.aggroTargetProfileId === profileId &&
          s.aggroUntil != null &&
          s.aggroUntil > now);
      if (!canAggro) continue;

      const dx = s.x - x;
      const dy = s.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > attackRangePx) continue;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = s;
        nearestProfile = profile;
      }
    }

    if (!nearest || !nearestProfile) {
      return { success: false, reason: "no_aggro_target" as const };
    }

    const npcStats = nearestProfile.stats ?? {
      hp: 20,
      maxHp: 20,
      atk: 4,
      def: 1,
      spd: 1,
      level: 1,
    };
    const enemyAtk = Math.max(1, npcStats.atk ?? 1);
    const playerDef = Math.max(0, player.stats.def ?? 0);
    const baseEnemyDamage = Math.max(0, Math.round(enemyAtk - playerDef * 0.35));
    const tookVariance = Math.round(
      baseEnemyDamage * ((Math.random() * 2 - 1) * (damageVariancePct / 100))
    );
    const took = Math.max(0, baseEnemyDamage + tookVariance);
    const nextPlayerHp = Math.max(0, (player.stats.hp ?? player.stats.maxHp) - took);

    await ctx.db.patch(profileId, {
      stats: {
        ...player.stats,
        hp: nextPlayerHp,
      },
    });

    await ctx.db.patch(nearest._id, {
      aggroTargetProfileId: profileId,
      aggroUntil: now + DEFAULT_AGGRO_MEMORY_MS,
    });

    return {
      success: true,
      attackerName: nearestProfile.displayName || nearestProfile.name,
      took,
      playerHp: nextPlayerHp,
      attackRangePx,
      aggression: resolveAggression(nearestProfile),
    };
  },
});
